#!/usr/bin/env python3
"""Create transparent light/dark full-wordmark assets from /root/logo.png."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = Path('/tmp/root-logo.png')
if not source.exists():
    source = Path('/root/logo.png')
if not source.exists():
    source = root / 'web/default/public/logo.png'
image = Image.open(source).convert('RGBA')
pixels = image.load()
for y in range(image.height):
    for x in range(image.width):
        r, g, b, _ = pixels[x, y]
        # Remove the white presentation background while preserving antialiasing.
        distance = 255 - min(r, g, b)
        alpha = min(255, max(0, distance * 18))
        pixels[x, y] = (255, 255, 255, 0) if alpha == 0 else (r, g, b, alpha)

# The source artwork is presented on a large white canvas. Crop only the
# transparent margin so the wordmark uses the full space of its UI container.
bbox = image.getchannel('A').point(lambda value: 255 if value >= 64 else 0).getbbox()
if bbox:
    padding = max(8, int(image.height * 0.025))
    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(image.width, bbox[2] + padding)
    bottom = min(image.height, bbox[3] + padding)
    image = image.crop((left, top, right, bottom))

light = image
dark = image.copy()
dp = dark.load()
wordmark_start = int(image.width * 0.30)
for y in range(dark.height):
    for x in range(wordmark_start, dark.width):
        r, g, b, a = dp[x, y]
        # The source wordmark is navy; make it readable on the dark shell
        # while retaining the original anti-aliased alpha edge.
        if a and (r + g + b) < 650:
            dp[x, y] = (232, 240, 255, a)

for theme, asset in [('light', light), ('dark', dark)]:
    for target in [root / f'web/default/public/logo-{theme}.png', root / f'web/classic/public/logo-{theme}.png']:
        target.parent.mkdir(parents=True, exist_ok=True)
        asset.save(target, optimize=True)
print('generated transparent logo-light.png and logo-dark.png')
