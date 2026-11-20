"""Make alpha tiles from the approved focus-bitmap-particles.html proof with Pillow."""

import argparse
import re
from math import cos, pi, sin, sqrt
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parents[1] / 'src' / 'assets'
ASSETS.mkdir(exist_ok=True)


def write_tile(name, size, boxes):
    scale = 10
    image = Image.new('L', (size[0] * scale, size[1] * scale))
    draw = ImageDraw.Draw(image)
    for x, y, width, height, alpha in boxes:
        left, top = round(x * scale), round(y * scale)
        right, bottom = round((x + width) * scale), round((y + height) * scale)
        if right > left and bottom > top:
            draw.rectangle((left, top, right-1, bottom-1), fill=alpha)
    alpha = image.resize((size[0] * 2, size[1] * 2), Image.Resampling.BOX)
    tile = Image.new('LA', alpha.size, (255, 0))
    tile.putalpha(alpha)
    tile.save(ASSETS / f'{name}.png', optimize=True)


def fibre(proof):
    pattern = re.search(r'<pattern id="fp-fibre"[^>]*>\s*<path d="([^"]+)"', proof).group(1)
    number = r'(\d+(?:\.\d+)?)'
    boxes = re.findall(fr'M{number} {number}h{number}v{number}h-\d+(?:\.\d+)?z', pattern)
    assert len(boxes) == pattern.count('M')
    write_tile('paper-grain', (109, 113), [(*map(float, box), 255) for box in boxes])


def toner():
    # Freeze the proof's first particle frame. Group speeds into three layers
    # so the CSS compositor can drift them without repainting paths per frame.
    seed = 18032

    def pick():
        nonlocal seed
        seed = (1664525 * seed + 1013904223) & 0xffffffff
        return seed / 2**32

    layers = [[], [], []]
    width, height = 760, 594
    for index in range(230):
        x, y, phase, speed, size, pair, rank, cycle = (pick() for _ in range(8))
        x = x * 940 - 20
        phase *= 2 * pi
        y = y * 520 + 9 * sin(phase + x * .003) + 3 * cos(phase * .7)
        density = .74 + .065 * sin(1.4) + .035 * sin(cycle * 6.283)
        presence = min(1, (density - rank) / .065)
        if presence <= 0:
            continue
        size = 1.44 * (.50 + 3.1 * size**1.9) * (.75 if y < 165 else 1) * sqrt(presence)
        alpha = round(255 * ((.22, .33, .44, .55)[index % 4] if y >= 165 else .22))
        x, y = (x + 20) * width / 940, (y * height / 520) % height
        layer = layers[int(speed * len(layers))]
        layer.append((x, y, size, size * .84, alpha))
        if pair < .19:
            layer.append((x - size * .55, y + size * .84, .85, .8, alpha))

    for name, boxes in zip(('slow', 'mid', 'quick'), layers):
        write_tile(f'toner-{name}', (width, height), boxes)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('proof', type=Path)
    fibre(parser.parse_args().proof.read_text())
    toner()
