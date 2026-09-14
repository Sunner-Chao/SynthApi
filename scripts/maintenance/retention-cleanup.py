#!/usr/bin/env python3
"""Bounded local retention; remote R2 objects and upload queues are never deleted."""
import argparse
import collections
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
DAY = 86400


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


def clean(apply=False, max_batches=200):
    now = time.time()
    report = collections.Counter()
    report['mode'] = 'apply' if apply else 'dry-run'
    candidates = []
    current = Path('/var/www/synthapi-web/current').resolve()
    candidates.extend(release_candidates(RELEASES, current, now))
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
    config = json.loads(Path('/etc/session-recorder/upload.json').read_text())['r2']
    for manifest in sorted((RECORDER / 'upload-work/manifests').glob('*.json')):
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
                if path.is_file() and not path.is_symlink() and now-path.stat().st_mtime > DAY:
                    sources.append((path, path.stat()))
            if not sources:
                continue
            report['eligible_feishu_files'] += len(sources)
            if not apply:
                report['eligible_feishu_bytes'] += sum(stat.st_size for _,stat in sources)
                continue
            key = record['object_key'] + ':' + record['archive_sha256']
            # Verify R2 immediately before deleting; prior proofs are audit only.
            if report['r2_checks'] >= max_batches:
                report['deferred_batches'] += 1
                continue
            report['r2_checks'] += 1
            if not verify_remote(record, config):
                report['unverified_batches_kept'] += 1
                if report['unverified_batches_kept'] >= 3: break
                continue
            proofs[key] = now
            for path, before in sources:
                after = path.lstat()
                if path.is_symlink() or (before.st_ino,before.st_size,before.st_mtime_ns) != (after.st_ino,after.st_size,after.st_mtime_ns):
                    continue
                path.unlink()
                report['feishu_files_deleted'] += 1
                report['feishu_bytes_deleted'] += before.st_size
        except (OSError,ValueError,subprocess.TimeoutExpired):
            report['errors_kept'] += 1
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
    parser.add_argument('--max-batches',type=int,default=200)
    args = parser.parse_args()
    STATE.mkdir(mode=0o700,exist_ok=True)
    with (STATE/'retention.lock').open('w') as lock, open('/run/session-recorder-feishu-json.lock','a') as exporter_lock:
        try:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            fcntl.flock(exporter_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            print('{"skipped":"cleanup or exporter active"}')
        else:
            clean(args.apply,args.max_batches)
