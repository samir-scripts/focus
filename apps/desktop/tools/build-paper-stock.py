"""Rebuild the three vector flake tiles from the approved study's seeded geometry."""

from math import cos, pi, sin, sqrt
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'src' / 'assets'


def write_tile(name, size, boxes):
    width, height = size
    paths = {}
    for x, y, w, h, alpha in boxes:
        paths.setdefault(alpha, []).append(f'M{x} {y}h{w}v{h}h-{w}z')
    lines = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" shape-rendering="crispEdges">']
    for alpha, fragments in paths.items():
        lines.append(f'  <path opacity="{alpha / 255:.3f}" d="{"".join(fragments)}"/>')
    lines.append('</svg>')
    (ASSETS / f'{name}.svg').write_text('\n'.join(lines) + '\n')


def flake_boxes(
    x: int, y: int, size: float, alpha: int, width: int, height: int
) -> list[tuple[int, int, int, int, int]]:
    if size >= 4:
        head = ('..###..', '.#####.', '###.###', '#######',
                '###.###', '.#####.', '..###..')
    elif size >= 2.5:
        head = ('.###.', '##.##', '#####', '##.##', '.###.')
    else:
        head = ('#',)

    boxes = [
        ((x + dx) % width, (y + dy) % height, 1, 1, alpha)
        for dy, row in enumerate(head)
        for dx, pixel in enumerate(row)
        if pixel == '#'
    ]
    for dx, dy, factor in (
        (-3, 2, .65), (-5, 0, .55), (-7, 3, .45),
        (-10, 1, .35), (-13, 2, .25), (-17, 0, .18),
    ):
        boxes.append(((x + dx) % width, (y + dy) % height, 1, 1, round(alpha * factor)))
    return boxes


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
        x, y, phase, speed, size, _pair, rank, cycle = (pick() for _ in range(8))
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
        layer.extend(flake_boxes(round(x), round(y), size, alpha, width, height))

    for name, boxes in zip(('slow', 'mid', 'quick'), layers):
        write_tile(f'toner-{name}', (width, height), boxes)


if __name__ == '__main__':
    toner()
