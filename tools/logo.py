#!/usr/bin/env python3
"""Makes the extension's icon and banner from the drawn logo.

    python3 tools/logo.py ~/Downloads/rtl_thick.png

Run by hand when the artwork changes; the four PNGs it writes are committed, so
nobody needs Pillow to build or use the extension. The sizes follow NodeGraph's
(icon 256 and 1024, banner 1200x300 and 4800x1200) so the two extensions look
like siblings on the marketplace and in a README.

The one subtlety is the cut-out. The drawing is a dark heptagon on white, and
the white is not all background: the wires drawn over the heptagon are white
too. So the background is taken as the white that is *connected to the border*
and flood-filled away, which leaves every white line inside the shape alone.
"""
import sys
from collections import deque
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent.parent / 'packages/vscode-ext/resources'
NAME = 'RTLGraph'
TAGLINE = "Draw the RTL. Don't just read it."
INK = (232, 178, 22)      # the yellow of the letters
PAPER = (26, 26, 20)      # the heptagon's charcoal
FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT_PLAIN = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def cut_out(image, near=228):
    """Alpha 0 for the white that touches the border, keeping inner white lines."""
    image = image.convert('RGBA')
    w, h = image.size
    pixels = image.load()
    white = lambda p: p[0] >= near and p[1] >= near and p[2] >= near

    seen = bytearray(w * h)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if white(pixels[x, y]):
                queue.append((x, y))
                seen[y * w + x] = 1
    for y in range(h):
        for x in (0, w - 1):
            if white(pixels[x, y]) and not seen[y * w + x]:
                queue.append((x, y))
                seen[y * w + x] = 1

    while queue:
        x, y = queue.popleft()
        pixels[x, y] = (255, 255, 255, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and white(pixels[nx, ny]):
                seen[ny * w + nx] = 1
                queue.append((nx, ny))
    return image


def square(image, pad=0.02):
    """The shape, centred on a transparent square with a little air around it."""
    box = image.getbbox()
    shape = image.crop(box)
    side = int(max(shape.size) * (1 + pad * 2))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(shape, ((side - shape.width) // 2, (side - shape.height) // 2), shape)
    return canvas


FIELD_LEFT = (38, 43, 52)   # cool graphite, a step lighter than the heptagon
FIELD_RIGHT = (13, 15, 19)


def banner(icon, width=4800, height=1200):
    """The icon on the left, the name and the line under it — NodeGraph's shape."""
    card = Image.new('RGBA', (width, height), (0, 0, 0, 255))
    draw = ImageDraw.Draw(card)
    # The field is a cooler, lighter graphite than the heptagon: on a field of its
    # own colour the mark disappeared into the background.
    for x in range(width):
        t = x / (width - 1)
        draw.line([(x, 0), (x, height)], fill=tuple(
            int(a + (b - a) * t) for a, b in zip(FIELD_LEFT, FIELD_RIGHT)) + (255,))

    side = int(height * 0.76)
    mark = icon.resize((side, side), Image.LANCZOS)
    left = int(height * 0.12)
    # The letters are drawn as glowing neon, so the mark is given the halo it
    # would throw — which is also what lifts it off the field.
    glow = Image.new('RGBA', card.size, (0, 0, 0, 0))
    halo = ImageDraw.Draw(glow)
    halo.ellipse([left - side * 0.12, (height - side) // 2 - side * 0.12,
                  left + side * 1.12, (height + side) // 2 + side * 0.12], fill=(*INK, 46))
    card.alpha_composite(glow.filter(ImageFilter.GaussianBlur(side * 0.10)))
    card.paste(mark, (left, (height - side) // 2), mark)

    text_x = left + side + int(height * 0.18)
    name = ImageFont.truetype(FONT_BOLD, int(height * 0.30))
    line = ImageFont.truetype(FONT_PLAIN, int(height * 0.105))
    draw.text((text_x, height * 0.30), NAME, font=name, fill=(255, 255, 255, 255), anchor='ls')
    draw.text((text_x + 4, height * 0.46), TAGLINE, font=line, fill=(*INK, 235), anchor='ls')
    return card


def main(source):
    icon = square(cut_out(Image.open(source)))
    OUT.mkdir(parents=True, exist_ok=True)
    icon.resize((1024, 1024), Image.LANCZOS).save(OUT / 'icon-hires.png')
    icon.resize((256, 256), Image.LANCZOS).save(OUT / 'icon.png')
    wide = banner(icon)
    wide.convert('RGB').save(OUT / 'banner-hires.png')
    wide.resize((1200, 300), Image.LANCZOS).convert('RGB').save(OUT / 'banner.png')
    for file in ('icon.png', 'icon-hires.png', 'banner.png', 'banner-hires.png'):
        print(f'wrote {file} ({(OUT / file).stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else str(Path.home() / 'Downloads/rtl_thick.png'))
