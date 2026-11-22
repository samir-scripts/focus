#!/usr/bin/env python3
"""Make the 2× Sites inset from the approved 3B RGBA print (Pillow 11.3.0)."""
from colorsys import hsv_to_rgb, rgb_to_hsv
from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parents[4] / 'apps/desktop/src/assets'
SIZE = (264, 156)
# Hue, saturation multiplier, value multiplier for machine and spot plate.
INKS = {
    'sage': ((.39, .57, .78), (.025, .73, .78)),
    'plum': ((.80, .57, .83), (.070, .74, .90)),
}


def reink(pixel, machine, plate):
    r, g, b, a = pixel
    if not a:
        return 0, 0, 0, 0
    _, saturation, value = rgb_to_hsv(r / 255, g / 255, b / 255)
    hue, sat_scale, value_scale = plate if r > b else machine
    # Leave the sheet and near-white keycaps neutral. Retain the facets, screen and flecks.
    coverage = min(1, saturation * 3)
    rgb = hsv_to_rgb(hue, saturation * sat_scale, value * (1 - coverage * (1 - value_scale)))
    return (*[round(component * 255) for component in rgb], a)


def export(image, palette):
    image.resize(SIZE, Image.Resampling.LANCZOS).save(ASSETS / f'sites-{palette}.png', optimize=True)


if __name__ == '__main__':
    with Image.open(ASSETS / 'typewriter-cobalt.png') as source:
        export(source, 'cobalt')
        for palette, (machine, plate) in INKS.items():
            print_image = Image.new('RGBA', source.size)
            print_image.putdata([reink(pixel, machine, plate) for pixel in source.getdata()])
            export(print_image, palette)
