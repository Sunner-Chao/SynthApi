#!/usr/bin/env python3
"""Verify the reviewed V5 tutorial files before publishing a frontend build."""
import hashlib
import sys
from pathlib import Path

EXPECTED = {
    'mp4': '198709aa6d79b64e47959b3c1ed2399ad8a92b14e366fd6821f047da01936fc5',
    'docx': '1cf570a3854d9e7b3ae778f7b4efaf64319790983efc87662b4e0867094e564e',
    'srt': '6ad07d336d2b4c3f1fdc28f0d9fd52f960269db0d98abe01dee28783191b76e7',
}

def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: verify-tutorial-resources.py <frontend-dist-or-resource-root>')
    root = Path(sys.argv[1])
    failures = []
    for extension, expected in EXPECTED.items():
        resource = root / 'tutorials' / f'synthapi-cc-switch-v5-gpt6sol.{extension}'
        if not resource.is_file():
            failures.append(f'Missing tutorial: {resource}')
            continue
        digest = hashlib.sha256(resource.read_bytes()).hexdigest()
        if digest != expected:
            failures.append(f'Tutorial differs from reviewed V5 original: {resource}')
    if failures:
        raise SystemExit('\n'.join(failures))
    print('V5 video, illustrated document and subtitles verified.')

if __name__ == '__main__':
    main()
