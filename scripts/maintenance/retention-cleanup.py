#!/usr/bin/env python3
"""Bounded local retention; remote R2 objects and upload queues are never deleted."""
import argparse
import collections
import concurrent.futures
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.parse

APP = Path('/home/ubuntu/demo/SynthApi')
RELEASES = Path('/var/www/synthapi-web/releases')
RECORDER = Path('/var/lib/session-recorder')
FEISHU = Path('/root/feishu-session-recorder-json')
STATE = Path('/var/lib/synthapi-maintenance')
UPLOAD_CONFIG = Path('/etc/session-recorder/upload.json')
DAY = 86400
GIB = 1024 ** 3
NORMAL_RETENTION_HOURS = 6
PRESSURE_RETENTION_HOURS = 1
PRESSURE_FREE_BYTES = 5 * GIB
TARGET_FREE_BYTES = 8 * GIB


def completed_manifest(record):
    return (record.get('state') == 'cleaned'
            and not record.get('failed_count')
            and re.fullmatch(r'[a-f0-9]{64}', record.get('archive_sha256', ''))
            and record.get('archive_size', 0) > 0
            and record.get('object_key', '').startswith('session-recorder-v1/synthapi/aliyun-prod/'))


def feishu_name(source):
    path = Path(source.get('relative_path', ''))
    if path.is_absolute() or '..' in path.parts or '_' not in path.stem:
        return None
    session = path.parent.name.rsplit('_', 1)[-1]
    request = path.stem.split('_', 1)[1]
    safe = lambda value: re.sub(r'[^A-Za-z0-9_.-]', '_', value)
    return safe(session + '__' + request) + '.json'


def size_on_disk(path):
    if path.is_file():
        return path.stat().st_size
    return sum(p.stat().st_size for p in path.rglob('*') if p.is_file() and not p.is_symlink())


def release_candidates(root, current, now):
    if root.is_symlink() or not root.is_dir():
        return []
    dirs = sorted((p for p in root.iterdir() if p.is_dir() and not p.is_symlink()), key=lambda p: p.stat().st_mtime, reverse=True)
    keep = set(dirs[:3]) | {current}
    return [p for p in dirs if p not in keep and now - p.stat().st_mtime > 2*DAY]


def retention_seconds(free_bytes):
    hours = PRESSURE_RETENTION_HOURS if free_bytes < PRESSURE_FREE_BYTES else NORMAL_RETENTION_HOURS
    return hours * 3600


def legacy_binary_candidates(root, now):
    if root.is_symlink() or not root.is_dir():
        return []
    backup_sets = []
    for folder in root.iterdir():
        if not folder.is_dir() or folder.is_symlink():
            continue
        binaries = []
        for path in folder.rglob('synthapi-server*'):
            if (not path.is_file() or path.is_symlink()
                    or any(parent.is_symlink() for parent in path.parents)):
                continue
            with path.open('rb') as stream:
                magic = stream.read(4)
            if magic == b'\x7fELF' or magic[:2] == b'\x1f\x8b':
                binaries.append(path)
        if binaries:
            backup_sets.append(binaries)
    # Deleting a file updates its directory mtime. Rank by the remaining
    # binaries, so emptied old directories never displace rollback backups.
    backup_sets.sort(key=lambda paths: max(p.stat().st_mtime for p in paths), reverse=True)
    return [path for paths in backup_sets[3:] for path in paths
            if now - path.stat().st_mtime > 14 * DAY]



def delete_verified_sources(sources, report):
    for path, before in sources:
        try:
            after = path.lstat()
            if path.is_symlink() or (before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns):
                report['changed_files_kept'] += 1
                continue
            path.unlink()
            report['feishu_files_deleted'] += 1
            report['feishu_bytes_deleted'] += before.st_size
        except FileNotFoundError:
            continue


def verify_safely(record, config):
    try:
        return verify_remote(record, config)
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return False


def verify_remote(record, config):
    credentials = Path('/etc/session-recorder/credentials')
    auth = (credentials / 'aws_access_key_id').read_text().strip() + ':' + (credentials / 'aws_secret_access_key').read_text().strip()
    url = config['endpoint'].rstrip('/') + '/' + config['bucket'] + '/' + urllib.parse.quote(record['object_key'], safe='/')
    command = ['curl', '--silent', '--show-error', '--head', '--max-time', '12',
               '--proxy', 'http://127.0.0.1:7896', '--aws-sigv4', 'aws:amz:auto:s3',
               '-H', 'x-amz-content-sha256: ' + hashlib.sha256(b'').hexdigest(),
               '--config', '-', url]
    result = subprocess.run(command, input='user = ' + json.dumps(auth) + '\n', text=True, capture_output=True, timeout=15)
    if result.returncode:
        return False
    headers = {}
    status = 0
    for line in result.stdout.splitlines():
        if line.startswith('HTTP/'):
            status = int(line.split()[1]); headers = {}
        elif ':' in line:
            key, value = line.split(':', 1); headers[key.lower()] = value.strip()
    return (status == 200
            and headers.get('content-length') == str(record['archive_size'])
            and headers.get('x-amz-meta-session-recorder-sha256') == record['archive_sha256'])


def refresh_feishu_metadata():
    """Keep the exporter's incremental index and UI manifest consistent."""
    meta_path = RECORDER / 'state/feishu-json-exporter.meta.jsonl'
    temp = meta_path.with_suffix('.tmp')
    models, providers, sessions = set(), set(), set()
    starts, ends = [], []
    count = 0
    with temp.open('w') as output:
        for path in FEISHU.glob('*.json'):
            if path.name == 'manifest.json' or path.is_symlink():
                continue
            record = json.loads(path.read_text())
            row = {key: record.get(key) for key in ('model','provider','session_id','start_time','end_time')}
            output.write(json.dumps(row) + '\n')
            count += 1
            if row['model']: models.add(row['model'])
            if row['provider']: providers.add(row['provider'])
            if row['session_id']: sessions.add(row['session_id'])
            if row['start_time']: starts.append(row['start_time'])
            if row['end_time']: ends.append(row['end_time'])
    temp.chmod(0o600); temp.replace(meta_path)
    path = FEISHU / 'manifest.json'
    manifest = json.loads(path.read_text()) if path.exists() else {}
    manifest.update(total_records=count,total_sessions=len(sessions),models=sorted(models),providers=sorted(providers),time_range={'start':min(starts,default=''),'end':max(ends,default='')})
    temp = path.with_suffix('.tmp');temp.write_text(json.dumps(manifest,indent=2));temp.chmod(0o600);temp.replace(path)


def clean(apply=False, max_batches=2000, workers=4):
    now = time.time()
    report = collections.Counter()
    report['mode'] = 'apply' if apply else 'dry-run'
    report['free_bytes_before'] = shutil.disk_usage('/').free
    retain_seconds = retention_seconds(report['free_bytes_before'])
    report['local_retention_hours'] = retain_seconds / 3600
    candidates = []
    current = Path('/var/www/synthapi-web/current').resolve()
    candidates.extend(release_candidates(RELEASES, current, now))
    candidates.extend(legacy_binary_candidates(Path('/home/ubuntu/deploy-backups'), now))
    backups = APP / 'deploy-backups'
    if backups.is_dir() and not backups.is_symlink():
        # Only old standalone binary backups; SQL snapshots and other data stay.
        binaries = sorted((p for p in backups.glob('synthapi-server*') if p.is_file() and not p.is_symlink()), key=lambda p:p.stat().st_mtime, reverse=True)
        candidates.extend(p for p in binaries[3:] if now-p.stat().st_mtime > 7*DAY)
    # This host runs compiled binaries; frontend dependencies belong to Shanghai.
    dependencies = APP / 'web/node_modules'
    build_running = subprocess.run(['pgrep', '-x', 'bun|node|go|compile|link|rspack|webpack|vite|esbuild|tsc'],capture_output=True).returncode == 0
    if dependencies.is_dir() and not dependencies.is_symlink() and not build_running:
        candidates.append(dependencies)
    running = set()
    for exe in Path('/proc').glob('[0-9]*/exe'):
        try: running.add(exe.resolve())
        except OSError: pass
    for path in candidates:
        if path.is_symlink() or path.resolve() == current or path.resolve() in running or os.path.ismount(path):
            continue
        report['artifact_bytes'] += size_on_disk(path)
        report['artifact_paths'] += 1
        if apply:
            if path.is_dir(): shutil.rmtree(path)
            else: path.unlink()
    if FEISHU.is_symlink() or not FEISHU.is_dir():
        raise RuntimeError('Unsafe Feishu root')
    proof_path = STATE / 'r2-cleanup-proofs.json'
    proofs = json.loads(proof_path.read_text()) if proof_path.exists() else {}
    config = json.loads(UPLOAD_CONFIG.read_text())['r2']
    batches = []
    for manifest in (RECORDER / 'upload-work/manifests').glob('*.json'):
        if time.time() - now > 10*60:
            report['time_budget_reached'] = 1
            break
        try:
            record = json.loads(manifest.read_text())
            if not completed_manifest(record):
                continue
            sources = []
            for source in record.get('sources', []):
                name = feishu_name(source)
                if not name:
                    continue
                path = FEISHU / name
                if path.is_file() and not path.is_symlink():
                    stat = path.stat()
                    if now - stat.st_mtime > retain_seconds:
                        sources.append((path, stat))
            if sources:
                report['eligible_feishu_files'] += len(sources)
                report['eligible_feishu_bytes'] += sum(stat.st_size for _, stat in sources)
                batches.append((record, sources))
        except (OSError, ValueError):
            report['errors_kept'] += 1
    # Oldest uploaded copies first. Bound concurrency and start no new work
    # after the run's time/check budget or repeated R2 verification failures.
    batches.sort(key=lambda batch: min(stat.st_mtime for _, stat in batch[1]))
    report['eligible_batches'] = len(batches)
    if apply:
        print(json.dumps(dict(report, phase='planned')), flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            for start in range(0, min(len(batches), max_batches), workers):
                if time.time() - now > 10*60:
                    report['time_budget_reached'] = 1
                    break
                if report['unverified_batches_kept'] >= 3:
                    break
                chunk = batches[start:min(start + workers, max_batches)]
                verified = pool.map(lambda batch: verify_safely(batch[0], config), chunk)
                for (record, sources), ok in zip(chunk, verified):
                    report['r2_checks'] += 1
                    if not ok:
                        report['unverified_batches_kept'] += 1
                        continue
                    proofs[record['object_key'] + ':' + record['archive_sha256']] = time.time()
                    delete_verified_sources(sources, report)
                if report['r2_checks'] % 100 < workers:
                    progress = dict(report, phase='deleting', free_bytes=shutil.disk_usage('/').free)
                    print(json.dumps(progress), flush=True)
                if (retain_seconds < NORMAL_RETENTION_HOURS * 3600
                        and shutil.disk_usage('/').free >= TARGET_FREE_BYTES):
                    report['free_space_target_reached'] = 1
                    break
        report['deferred_batches'] = len(batches) - report['r2_checks']
    if apply and report['feishu_files_deleted']:
        refresh_feishu_metadata()
    if apply:
        proofs = {key:value for key,value in proofs.items() if now-value < 2*DAY}
        temp = proof_path.with_suffix('.tmp')
        temp.write_text(json.dumps(proofs)); temp.chmod(0o600);temp.replace(proof_path)
    report['free_bytes_after'] = shutil.disk_usage('/').free
    report['checked_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
    if apply:
        (STATE/'retention-last.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--max-batches',type=int,default=2000)
    parser.add_argument('--workers',type=int,choices=range(1,5),default=4)
    args = parser.parse_args()
    STATE.mkdir(mode=0o700,exist_ok=True)
    with (STATE/'retention.lock').open('w') as lock, open('/run/session-recorder-feishu-json.lock','a') as exporter_lock:
        try:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            fcntl.flock(exporter_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            print('{"skipped":"cleanup or exporter active"}')
        else:
            clean(args.apply,args.max_batches,args.workers)
