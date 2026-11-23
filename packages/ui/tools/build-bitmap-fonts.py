"""Regenerate the bundled TTFs with Python 3, fontTools and Pillow (FreeType with WOFF2).

The library scanlines are from the approved focus-bitmap-particles proof.
Each integer is one row, most significant bit at the left. The rest of the
basic Latin set is drawn on the same grid; longer descenders extend below row 7.
The two display cuts are Mona derivatives (SIL OFL; see THIRD_PARTY_NOTICES.md).
"""

from itertools import groupby
from math import floor, sin
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from PIL import Image, ImageDraw, ImageFont

ASSETS = Path(__file__).resolve().parents[1] / 'src' / 'assets'
EM = 1200
CELL = 128

ROWS = {
    # Original proof, unchanged.
    'A': [14, 17, 17, 31, 17, 17, 17], 'B': [30, 17, 17, 30, 17, 17, 30],
    'F': [31, 16, 16, 30, 16, 16, 16], 'G': [14, 17, 16, 23, 17, 17, 15],
    'I': [7, 2, 2, 2, 2, 2, 7], 'L': [16, 16, 16, 16, 16, 16, 31],
    'R': [30, 17, 17, 30, 20, 18, 17], 'S': [15, 16, 16, 14, 1, 1, 30],
    'T': [31, 4, 4, 4, 4, 4, 4], 'W': [17, 17, 17, 21, 21, 21, 10],
    'X': [17, 17, 10, 4, 10, 17, 17], 'Y': [17, 17, 10, 4, 4, 4, 4],
    'a': [0, 0, 14, 1, 15, 17, 15], 'b': [16, 16, 30, 17, 17, 17, 30],
    'c': [0, 0, 14, 17, 16, 17, 14], 'd': [1, 1, 15, 17, 17, 17, 15],
    'e': [0, 0, 14, 17, 31, 16, 14], 'g': [0, 0, 15, 17, 17, 15, 1, 14],
    'h': [16, 16, 30, 17, 17, 17, 17], 'i': [1, 0, 1, 1, 1, 1, 1],
    'k': [16, 16, 18, 20, 24, 20, 18], 'l': [2, 2, 2, 2, 2, 2, 1],
    'm': [0, 0, 26, 21, 21, 21, 21], 'n': [0, 0, 30, 17, 17, 17, 17],
    'o': [0, 0, 14, 17, 17, 17, 14], 'p': [0, 0, 30, 17, 17, 30, 16, 16],
    'r': [0, 0, 11, 12, 8, 8, 8], 's': [0, 0, 15, 16, 14, 1, 30],
    't': [0, 4, 15, 4, 4, 4, 3], 'u': [0, 0, 17, 17, 17, 19, 13],
    'w': [0, 0, 17, 17, 21, 21, 10], 'y': [0, 0, 17, 17, 17, 15, 1, 14],
    '/': [1, 1, 2, 4, 8, 16, 16],

    'C': [14, 17, 16, 16, 16, 17, 14], 'D': [30, 17, 17, 17, 17, 17, 30],
    'E': [31, 16, 16, 30, 16, 16, 31], 'H': [17, 17, 17, 31, 17, 17, 17],
    'J': [7, 2, 2, 2, 2, 18, 12], 'K': [17, 18, 20, 24, 20, 18, 17],
    'M': [17, 27, 21, 21, 17, 17, 17], 'N': [17, 25, 21, 19, 17, 17, 17],
    'O': [14, 17, 17, 17, 17, 17, 14], 'P': [30, 17, 17, 30, 16, 16, 16],
    'Q': [14, 17, 17, 17, 21, 18, 13], 'U': [17, 17, 17, 17, 17, 17, 14],
    'V': [17, 17, 17, 17, 17, 10, 4], 'Z': [31, 1, 2, 4, 8, 16, 31],
    'f': [6, 9, 8, 28, 8, 8, 8], 'j': [1, 0, 1, 1, 1, 1, 1, 6],
    'q': [0, 0, 15, 17, 17, 17, 15, 1], 'v': [0, 0, 17, 17, 17, 10, 4],
    'x': [0, 0, 17, 10, 4, 10, 17], 'z': [0, 0, 31, 2, 4, 8, 31],
    '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14],
    '2': [14, 17, 1, 2, 4, 8, 31], '3': [30, 1, 1, 14, 1, 1, 30],
    '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 16, 30, 1, 1, 30],
    '6': [14, 16, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
    '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 1, 14],
    '!': [1, 1, 1, 1, 1, 0, 1], '"': [5, 5, 5], '#': [10, 10, 31, 10, 31, 10, 10],
    '$': [4, 15, 20, 14, 5, 30, 4], '%': [25, 25, 2, 4, 8, 19, 19],
    '&': [12, 18, 20, 8, 21, 18, 13], "'": [1, 1, 1],
    '(': [1, 2, 4, 4, 4, 2, 1], ')': [4, 2, 1, 1, 1, 2, 4],
    '*': [0, 21, 14, 31, 14, 21], '+': [0, 0, 4, 4, 31, 4, 4],
    ',': [0, 0, 0, 0, 0, 0, 1, 2], '-': [0, 0, 0, 7], '.': [0, 0, 0, 0, 0, 0, 1],
    ':': [0, 0, 0, 1, 0, 0, 1], ';': [0, 0, 0, 1, 0, 0, 1, 2],
    '<': [0, 1, 2, 4, 8, 4, 2, 1], '=': [0, 0, 31, 0, 31], '>': [0, 8, 4, 2, 1, 2, 4, 8],
    '?': [14, 17, 1, 2, 4, 0, 4], '@': [14, 17, 23, 21, 23, 16, 14],
    '[': [7, 4, 4, 4, 4, 4, 7], '\\': [16, 16, 8, 4, 2, 1, 1], ']': [7, 1, 1, 1, 1, 1, 7],
    '^': [4, 10, 17], '_': [0, 0, 0, 0, 0, 0, 0, 31], '`': [2, 1],
    '{': [3, 4, 4, 8, 4, 4, 3], '|': [1, 1, 1, 1, 1, 1, 1], '}': [12, 2, 2, 1, 2, 2, 12],
    '~': [0, 0, 0, 9, 22], '•': [0, 0, 2, 7, 2], '–': [0, 0, 0, 31],
    '—': [0, 0, 0, 127], '…': [0, 0, 0, 0, 0, 0, 21], '’': [1, 1, 2],
    '×': [0, 0, 17, 10, 4, 10, 17],
}


def bitmap_cells(ch, bold):
    if ch == ' ':
        return 3 * CELL, []
    # Keep figures tabular without changing the proof's proportional letters.
    rows = ROWS[ch]
    width = 5 if ch.isdigit() else max(rows).bit_length()
    weight = 24 if bold else 0
    cells = []
    for y, bits in enumerate(rows):
        bottom = (6 - y) * CELL
        for filled, columns in groupby(range(width), lambda x: bits & (1 << (width - x - 1)) != 0):
            if filled:
                run = list(columns)
                cells.append((-weight + run[0]*CELL, bottom, (run[-1]+1)*CELL + weight, bottom + CELL))
    return (width + 1) * CELL, cells


BAYER = (0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5)


def screen(font, ch, em, step, small, solid=False):
    # Rasterize first, then apply the proof's ordered screen and uneven toner pull.
    # Oversampling separates the screen from FreeType's integer pen positions.
    scale = 4
    left, _, right, _ = font.getbbox(ch, anchor='ls')
    origin = 3 + max(0, -left)
    baseline = round(em * .81 * scale)
    mask = Image.new('L', (origin + max(right, 1) + scale, round(em * 1.04 * scale)))
    ImageDraw.Draw(mask).text((origin, baseline), ch, fill=255, font=font, anchor='ls')
    pixels = mask.load()
    cells = []
    for row in range(int(mask.height / scale / step)):
        y = row * step
        for col in range(int(mask.width / scale / step)):
            x = col * step
            coverage = pixels[int(x * scale), int(y * scale)] / 255
            threshold = (BAYER[row % 4 * 4 + col % 4] + .5) / 16
            fade = max(0, (y / em - .42) * 1.25 + .16 * sin(x / em * 3.8))
            if (coverage < .5 if solid else coverage * (1 - .72 * fade - (0 if small else .08)) <= threshold):
                continue
            grain = sin(col * 13.1 + row * 83.2) * 1934.77
            unit = step * (1 if solid else .99 if small or grain - floor(grain) > .21 else .72)
            factor = EM / em
            left = (x - origin / scale) * factor
            top = (baseline / scale - y) * factor
            size = unit * factor
            cells.append(tuple(map(round, (left, top-size, left+size, top))))
    advance = round(font.getlength(ch) / scale * EM / em)
    return advance, cells


def build(name, weight, characters, draw, variant=None):
    mapping = {ord(ch): f'uni{ord(ch):04X}' for ch in sorted(characters)}
    order = ['.notdef', *mapping.values()]
    glyf = {'.notdef': TTGlyphPen(None).glyph()}
    metrics = {'.notdef': (EM // 2, 0)}
    for point, glyph in mapping.items():
        advance, cells = draw(chr(point))
        pen = TTGlyphPen(None)
        for left, bottom, right, top in cells:
            pen.moveTo((left, bottom))
            pen.lineTo((left, top))
            pen.lineTo((right, top))
            pen.lineTo((right, bottom))
            pen.closePath()
        glyf[glyph] = pen.glyph()
        metrics[glyph] = (advance, min((box[0] for box in cells), default=0))

    family = f'Focus Bitmap {name}' if variant else 'Focus Bitmap'
    style = variant or name
    postscript = f'FocusBitmap-{name}'
    builder = FontBuilder(EM)
    builder.setupGlyphOrder(order)
    builder.setupCharacterMap(mapping)
    builder.setupGlyf(glyf)
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=1008, descent=-192)
    names = {'familyName': family, 'styleName': style, 'uniqueFontIdentifier': postscript,
             'fullName': f'Focus Bitmap {name}', 'psName': postscript, 'version': 'Version 1.0'}
    if variant:
        names.update(copyright='Copyright (c) 2023, GitHub; modified for focus.',
                     licenseDescription='SIL Open Font License, Version 1.1',
                     licenseInfoURL='https://openfontlicense.org/')
    builder.setupNameTable(names)
    bold = name == 'Bold'  # Display and Wordmark are standalone families.
    builder.setupOS2(version=4, sTypoAscender=1008, sTypoDescender=-192, usWinAscent=1008, usWinDescent=256,
                     usWeightClass=weight, fsSelection=0x80 | (0x20 if bold else 0x40))
    builder.setupHead(unitsPerEm=EM, macStyle=int(bold), created=3856896000, modified=3856896000)
    builder.font.recalcTimestamp = False
    builder.setupPost()
    builder.save(ASSETS / f'{postscript}.ttf')


def main():
    chars = {' ', *ROWS}
    assert set(map(chr, range(32, 127))) <= chars
    build('Regular', 400, chars, lambda ch: bitmap_cells(ch, False))
    build('Bold', 700, chars, lambda ch: bitmap_cells(ch, True))

    for name, source, em, step, axes, weight, glyphs in [
        ('Display', 'MonaSansVF', 50, 1.65, [100, 840, 0, 0], 800, chars),
        ('Wordmark', 'MonaSansMonoVF', 25, .9, [730], 700, set('focus.')),
    ]:
        font = ImageFont.truetype(ASSETS / f'{source}.woff2', em * 4)
        font.set_variation_by_axes(axes)
        build(name, weight, glyphs, lambda ch: screen(font, ch, em, step, name == 'Wordmark'), 'Regular')
        if name == 'Display':
            build('DisplaySolid', weight, set('Settings'), lambda ch: screen(font, ch, em, step, False, solid=True), 'Regular')


if __name__ == '__main__':
    main()
