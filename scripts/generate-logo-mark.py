#!/usr/bin/env python3
"""Create full-bleed square mark assets from the horizontal SynthAPI PNG."""

import struct
import zlib
from pathlib import Path

SRC = Path('/root/logo.png')
ROOT = Path(__file__).resolve().parents[1]
OUTS = [
    ROOT / 'web/default/public/logo-mark.png',
    ROOT / 'web/classic/public/logo-mark.png',
    ROOT / 'web/default/public/favicon.png',
    ROOT / 'web/default/public/favicon.ico',
    ROOT / 'web/classic/public/favicon.png',
    ROOT / 'web/classic/public/favicon.ico',
]


def read_png(path):
    raw = path.read_bytes()
    assert raw[:8] == b'\x89PNG\r\n\x1a\n'
    pos, idat, width, height, bit_depth, color_type = 8, [], None, None, None, None
    while pos < len(raw):
        size = struct.unpack('>I', raw[pos:pos + 4])[0]
        kind = raw[pos + 4:pos + 8]
        body = raw[pos + 8:pos + 8 + size]
        pos += 12 + size
        if kind == b'IHDR':
            width, height, bit_depth, color_type = struct.unpack('>IIBB', body[:10])
            assert bit_depth == 8 and color_type == 2, (bit_depth, color_type)
        elif kind == b'IDAT':
            idat.append(body)
        elif kind == b'IEND':
            break
    decoded = zlib.decompress(b''.join(idat))
    stride = width * 3
    rows, off, prev = [], 0, bytearray(stride)
    for _ in range(height):
        filt = decoded[off]
        cur = bytearray(decoded[off + 1:off + 1 + stride])
        off += stride + 1
        for i in range(stride):
            left = cur[i - 3] if i >= 3 else 0
            up = prev[i]
            up_left = prev[i - 3] if i >= 3 else 0
            if filt == 1:
                cur[i] = (cur[i] + left) & 255
            elif filt == 2:
                cur[i] = (cur[i] + up) & 255
            elif filt == 3:
                cur[i] = (cur[i] + ((left + up) // 2)) & 255
            elif filt == 4:
                p = left + up - up_left
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - up_left)
                cur[i] = (cur[i] + (left if pa <= pb and pa <= pc else up if pb <= pc else up_left)) & 255
            elif filt != 0:
                raise ValueError(f'unsupported PNG filter {filt}')
        rows.append(bytes(cur))
        prev = cur
    return width, height, rows


def chunk(kind, body):
    return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xffffffff)


def write_png(path, width, height, rows, rgba=False):
    raw = b''.join(b'\x00' + row for row in rows)
    data = b'\x89PNG\r\n\x1a\n'
    color_type = 6 if rgba else 2
    data += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, color_type, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(raw, 9))
    data += chunk(b'IEND', b'')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def write_ico(path, png_path):
    payload = png_path.read_bytes()
    # ICO can carry a full-resolution PNG payload; browsers downsample it
    # for the tab icon while retaining a crisp source for high-DPI displays.
    header = struct.pack('<HHH', 0, 1, 1)
    entry = struct.pack(
        '<BBBBHHII', 0, 0, 0, 0, 1, 32, len(payload), 22
    )
    path.write_bytes(header + entry + payload)


width, height, rows = read_png(SRC)

# The source artwork is a 2172x724 horizontal wordmark. The coloured mark is
# bounded by approximately (224, 136)-(706, 582), while the rest of the
# square is a near-white presentation background. Crop to that artwork and
# resample it to a square so the colour fills the browser icon instead of
# appearing as a small badge surrounded by white.
left, top, right, bottom = 224, 136, 706, 582
crop_width, crop_height = right - left, bottom - top
target = 724

def sample(x, y):
    # Bilinear sampling keeps the enlarged edge smooth without external image
    # dependencies on the production host.
    sx = left + (x + 0.5) * crop_width / target - 0.5
    sy = top + (y + 0.5) * crop_height / target - 0.5
    x0, y0 = max(0, min(width - 1, int(sx))), max(0, min(height - 1, int(sy)))
    x1, y1 = min(width - 1, x0 + 1), min(height - 1, y0 + 1)
    fx, fy = sx - x0, sy - y0
    def pixel(px, py):
        row = rows[py]
        return row[px * 3:px * 3 + 3]
    out = []
    for channel in range(3):
        a = pixel(x0, y0)[channel] * (1 - fx) + pixel(x1, y0)[channel] * fx
        b = pixel(x0, y1)[channel] * (1 - fx) + pixel(x1, y1)[channel] * fx
        out.append(round(a * (1 - fy) + b * fy))
    return out

resized = []
cx = (left + right - 1) / 2
cy = (top + bottom - 1) / 2
rx = crop_width / 2
ry = crop_height / 2
for y in range(target):
    row = bytearray()
    for x in range(target):
        rgb = sample(x, y)
        # Remove only the presentation background outside the circular mark;
        # white details inside the mark remain fully opaque.
        sx = left + (x + 0.5) * crop_width / target - 0.5
        sy = top + (y + 0.5) * crop_height / target - 0.5
        distance = ((sx - cx) / rx) ** 2 + ((sy - cy) / ry) ** 2
        if distance >= 1.0:
            alpha = 0
        elif distance >= 0.96:
            alpha = round(255 * (1.0 - distance) / 0.04)
        else:
            alpha = 255
        row.extend((*rgb, alpha))
    resized.append(bytes(row))

tmp_png = ROOT / 'web/default/public/.logo-mark-source.png'
write_png(tmp_png, target, target, resized, rgba=True)
for output in OUTS:
    if output.suffix.lower() == '.ico':
        write_ico(output, tmp_png)
    else:
        write_png(output, target, target, resized, rgba=True)
tmp_png.unlink()
print(f'generated {target}x{target} full-bleed transparent mark assets')
