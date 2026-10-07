#!/usr/bin/env python3
"""Collect metadata only; never expose credentials or conversation contents."""
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import urllib.parse
import xml.etree.ElementTree as ET

ROOT = Path('/var/lib/session-recorder')
OUT = Path('/var/lib/synthapi-monitor')
MAX_SNAPSHOT_BATCHES = 500
MAX_SNAPSHOT_RECORDS = 1000

def read(path):
    with open(path) as stream:
        return json.load(stream)

def r2_objects(config):
    credentials = Path('/etc/session-recorder/credentials')
    key = (credentials / 'aws_access_key_id').read_text().strip()
    secret = (credentials / 'aws_secret_access_key').read_text().strip()
    # curl handles SigV4; credentials travel over stdin, never argv or logs.
    curl_config = 'user = ' + json.dumps(key + ':' + secret) + '\n'
    start_after, objects = '', []
    # Limit the listing to the current UTC day. This avoids scanning the
    # entire historical bucket on every two-minute monitor refresh.
    today_prefix = '/synthapi/' + config.get('host_id', 'aliyun-prod') + '/' + dt.datetime.now(dt.timezone.utc).strftime('%Y/%m/%d/')
    for _ in range(100):
        params = {'list-type': '2', 'max-keys': '1000', 'prefix': config.get('object_prefix', '') + today_prefix}
        if start_after:
            params['start-after'] = start_after
        query = urllib.parse.urlencode(params)
        url = config['endpoint'].rstrip('/') + '/' + config['bucket'] + '?' + query
        result = subprocess.run(['curl', '--silent', '--fail', '--connect-timeout', '5', '--max-time', '20', '--aws-sigv4', 'aws:amz:auto:s3', '-H', 'x-amz-content-sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '--config', '-', url], input=curl_config, text=True, capture_output=True, timeout=25)
        if result.returncode:
            detail = result.stderr.strip()
            suffix = ': ' + detail[:160] if detail else ''
            raise RuntimeError('R2 ListObjects failed (curl code %d)%s' % (result.returncode, suffix))
        root = ET.fromstring(result.stdout)
        ns = {'s': 'http://s3.amazonaws.com/doc/2006-03-01/'}
        for obj in root.findall('s:Contents', ns):
            objects.append({'key': obj.findtext('s:Key', namespaces=ns), 'size': int(obj.findtext('s:Size', namespaces=ns)), 'modified': obj.findtext('s:LastModified', namespaces=ns), 'etag': obj.findtext('s:ETag', namespaces=ns)})
        # Key-based pagination avoids curl's handling of opaque R2 tokens.
        if root.findtext('s:IsTruncated', namespaces=ns) == 'true':
            if not objects or objects[-1]['key'] == start_after:
                raise RuntimeError('R2 listing made no pagination progress')
            start_after = objects[-1]['key']
            continue
        return objects, False
    raise RuntimeError('R2 listing exceeded 100 pages; totals unavailable')

def main():
    OUT.mkdir(mode=0o750, exist_ok=True)
    errors = []
    config = read('/etc/session-recorder/upload.json')
    stats = read(ROOT / 'state/stats.json')
    batches = []
    for path in (ROOT / 'upload-work/manifests').glob('*.json'):
        try:
            data = read(path)
            row = {key: data.get(key) for key in ('batch_id', 'state', 'archive_size', 'object_key', 'retry_count', 'failed_count', 'created_at', 'updated_at', 'host_id')}
            row['files'] = len(data.get('sources', []))
            batches.append(row)
        except (OSError, ValueError):
            errors.append('Unreadable upload manifest: ' + path.name)
    # Do not walk or read the raw recorder/Feishu response files here. There
    # are several gigabytes of them and the exporter already maintains a
    # compact metadata index. A full scan used to block on disk for minutes,
    # starving the uploader and leaving the dashboard without a fresh snapshot.
    previous_snapshot = read(OUT / 'snapshot.json') if (OUT / 'snapshot.json').exists() else {}
    previous_records = previous_snapshot.get('records', [])
    record_count = max(int(previous_snapshot.get('record_count') or 0), len(previous_records))
    all_records = list(previous_records)
    meta_path = ROOT / 'state/feishu-json-exporter.meta.jsonl'
    if meta_path.exists():
        try:
            lines = meta_path.read_text().splitlines()[-MAX_SNAPSHOT_RECORDS:]
            known_sessions = {row.get('session_id') for row in all_records}
            for line in reversed(lines):
                row = json.loads(line)
                if not row.get('session_id') or row['session_id'] in known_sessions:
                    continue
                row.update(request_id=None, prompt_tokens=None, completion_tokens=None,
                           total_tokens=None, status='success',
                           termination_reason='response.completed', size=None,
                           source='feishu-index', acceptance='not_validated')
                all_records.append(row)
                known_sessions.add(row['session_id'])
        except (OSError, ValueError, json.JSONDecodeError):
            errors.append('Unreadable Feishu metadata index')
    all_records.sort(key=lambda x: x.get('end_time') or '', reverse=True)
    all_records = all_records[:MAX_SNAPSHOT_RECORDS]
    records = all_records
    totals = previous_snapshot.get('tokens') or {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
    for row in records:
        row['quality_summary'] = {
            'model_allowed': row.get('model') in (
                'claude-fable-5', 'claude-fable-5-1',
                'claude-opus-5', 'claude-opus-5-5', 'gpt-5.6',
            ) or row.get('model', '').startswith('gpt-6'),
            'completed_response': row.get('status') == 'success' and row.get('termination_reason') in ('response.completed', 'end_turn', 'stop'),
            'token_usage_present': row.get('total_tokens') is not None,
            'session_id_present': bool(row.get('session_id')),
            'official_acceptance': 'not_validated',
        }
    objects, r2_error, r2_truncated = [], None, False
    try:
        objects, r2_truncated = r2_objects(config['r2'])
    except Exception as exc:
        r2_error = str(exc)
        # Preserve the last complete listing during transient R2/network
        # failures so the admin page remains useful and does not look empty.
        objects = previous_snapshot.get('objects', [])
        r2_truncated = previous_snapshot.get('r2_truncated', True)
    units = ['session-recorder-proxy', 'session-recorder-upload', 'session-recorder-feishu-json']
    services = {unit: subprocess.run(['systemctl', 'is-active', unit], capture_output=True, text=True).stdout.strip() for unit in units}
    batches.sort(key=lambda x: x.get('updated_at') or '', reverse=True)
    objects.sort(key=lambda x: x['modified'], reverse=True)
    snapshot = dict(
        checked_at=dt.datetime.now(dt.timezone.utc).isoformat(),
        node=config.get('host_id'),
        bucket=config['r2']['bucket'],
        stats=stats,
        services=services,
        errors=errors[:20],
        batches=batches[:MAX_SNAPSHOT_BATCHES],
        objects=objects,
        r2_error=r2_error,
        r2_truncated=r2_truncated,
        r2_bytes=sum(x['size'] for x in objects) if not r2_error else None,
        records=records,
        record_count=record_count,
        records_limited=record_count > len(records),
        tokens=totals,
        token_records=previous_snapshot.get('token_records', sum(row.get('total_tokens') is not None for row in all_records)),
        token_scope='本地已观测记录，按 request_id 去重；不是 R2 历史累计 Token。',
        acceptance='尚未接入官方验收脚本；上传成功不代表采购验收通过。',
    )
    for name, value in [('snapshot.json', snapshot)]:
        temp = OUT / (name + '.tmp')
        temp.write_text(json.dumps(value, ensure_ascii=True))
        os.chmod(temp, 0o640)
        os.replace(temp, OUT / name)

if __name__ == '__main__':
    main()
