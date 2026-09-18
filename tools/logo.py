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


def hull(image, step=2):
    """The convex outline of what is left after the cut-out."""
    alpha = image.getchannel('A')
    w, h = alpha.size
    pixels = alpha.load()
    points = []
    for y in range(0, h, step):
        row = [x for x in range(0, w, step) if pixels[x, y] > 40]
        if row:
            points.append((row[0], y))
            points.append((row[-1], y))
    points.sort()
    def half(order):
        out = []
        for p in order:
            while len(out) >= 2 and (out[-1][0] - out[-2][0]) * (p[1] - out[-2][1]) - \
                                    (out[-1][1] - out[-2][1]) * (p[0] - out[-2][0]) <= 0:
                out.pop()
            out.append(p)
        return out[:-1]
    return half(points) + half(points[::-1])


def corners(shape, want=7):
    """The hull, thinned down to the polygon's own corners (Douglas-Peucker)."""
    def far(points, first, last):
        ax, ay = points[first]
        bx, by = points[last]
        span = max(1e-9, ((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5)
        best, at = 0.0, first
        for i in range(first + 1, last):
            x, y = points[i]
            d = abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / span
            if d > best:
                best, at = d, i
        return best, at

    def simplify(points, tol):
        keep = {0, len(points) - 1}
        stack = [(0, len(points) - 1)]
        while stack:
            first, last = stack.pop()
            if last <= first + 1:
                continue
            d, at = far(points, first, last)
            if d > tol:
                keep.add(at)
                stack += [(first, at), (at, last)]
        return [points[i] for i in sorted(keep)]

    # A closed ring has no two ends to measure from — first to last is the same
    # point and every distance comes out zero — so it is cut at the point
    # furthest from the start and simplified as two open curves.
    ax, ay = shape[0]
    apart = max(range(len(shape)), key=lambda i: (shape[i][0] - ax) ** 2 + (shape[i][1] - ay) ** 2)
    halves = (shape[:apart + 1], shape[apart:] + [shape[0]])
    ring = lambda tol: simplify(halves[0], tol)[:-1] + simplify(halves[1], tol)[:-1]

    low, high = 0.5, max(max(p) for p in shape)
    best = ring(low)
    for _ in range(60):
        tol = (low + high) / 2
        got = ring(tol)
        if len(got) > want:
            low = tol
        else:
            high = tol
            best = got
            if len(got) == want:
                return got
    return best


def rimmed(image, band=0.014, inset=0.013):
    """The shape re-cut along its own outline, with a thin white band on the edge —
    NodeGraph's icon wears the same rim, and it is what keeps a dark heptagon from
    sinking into a dark background."""
    polygon = corners(hull(image))
    if len(polygon) < 3:
        return image
    side = max(image.size)
    cx = sum(x for x, _ in polygon) / len(polygon)
    cy = sum(y for _, y in polygon) / len(polygon)
    pull = lambda by: [(x + (cx - x) * by, y + (cy - y) * by) for x, y in polygon]

    # Crisp edges: cut against the polygon at 4x, then come back down.
    up = 4
    mask = Image.new('L', (image.width * up, image.height * up), 0)
    ImageDraw.Draw(mask).polygon([(x * up, y * up) for x, y in pull(inset / 2)], fill=255)
    cut = image.copy()
    cut.putalpha(Image.composite(image.getchannel('A'), Image.new('L', image.size, 0),
                                 mask.resize(image.size, Image.LANCZOS)))

    rim = Image.new('RGBA', (image.width * up, image.height * up), (0, 0, 0, 0))
    ImageDraw.Draw(rim).polygon([(x * up, y * up) for x, y in pull(inset)],
                                outline=(255, 255, 255, 255), width=max(1, int(side * band * up)))
    cut.alpha_composite(rim.resize(image.size, Image.LANCZOS))
    return cut


def square(image, pad=0.03):
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

    side = int(height * 0.72)
    mark = icon.resize((side, side), Image.LANCZOS)
    left = int(height * 0.16)
    card.paste(mark, (left, (height - side) // 2), mark)

    # The name and the line under it are set as one block, centred on the middle
    # of the mark rather than each placed by hand — laid out separately they sat
    # high and the banner looked top-heavy.
    name = ImageFont.truetype(FONT_BOLD, int(height * 0.26))
    line = ImageFont.truetype(FONT_PLAIN, int(height * 0.094))
    gap = int(height * 0.055)
    name_box = draw.textbbox((0, 0), NAME, font=name)
    line_box = draw.textbbox((0, 0), TAGLINE, font=line)
    block = (name_box[3] - name_box[1]) + gap + (line_box[3] - line_box[1])
    text_x = left + side + int(height * 0.16)
    top = (height - block) // 2

    draw.text((text_x - name_box[0], top - name_box[1]), NAME, font=name, fill=(255, 255, 255, 255))
    under = top + (name_box[3] - name_box[1]) + gap
    draw.text((text_x - line_box[0], under - line_box[1]), TAGLINE, font=line, fill=(*INK, 240))
    # A hairline the width of the words, tying the two lines together.
    rule_y = under - gap * 0.55
    draw.line([(text_x, rule_y), (text_x + (line_box[2] - line_box[0]), rule_y)],
              fill=(255, 255, 255, 40), width=max(1, height // 400))
    return card


def main(source):
    icon = square(rimmed(square(cut_out(Image.open(source)), pad=0.0)))
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
