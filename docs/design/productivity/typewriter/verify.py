"""Check the pinned input and compositing contract of a Slice 3B export."""
import hashlib
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

SOURCE_SHA = "7d03b0e4dfc7b04bde992eedd6be3d680062b49b59258a30096d33a6ca8189a1"
REFERENCE_SHA = "2f6fec6f5e6d19baee4b71c94900b4e74633a1e04c5a0d22a0d6316b1230cb4a"


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def main(output, hero):
    root = Path(__file__).resolve().parent
    assert digest(root / "source/typewriter.glb") == SOURCE_SHA, "Grab3D input changed"
    assert digest(root.parent / "references/approved-cobalt-dashboard.png") == REFERENCE_SHA
    for path, size, mode in (
        (hero, (1408, 832), "RGBA"),
        (output / "clay.png", (704, 416), "RGBA"),
        (output / "comparison.png", (2112, 416), "RGB"),
    ):
        assert path.is_file(), f"Missing export: {path}"
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            image.load()
            assert (image.size, image.mode) == (size, mode), path
        print(f"{digest(path)}  {path}")

    with Image.open(hero) as art, Image.open(output / "clay.png") as clay:
        # Stock must show through the open left side, but not through the sheet
        # or the cropped blue base. Compare the two silhouettes away from AA.
        assert art.getpixel((0, 0))[3] == 0
        assert art.getpixel((0, 630))[3] == 0
        r, g, b, a = art.getpixel((1000, 190))
        assert a == 255 and min(r, g, b) >= 240 and max(r, g, b) - min(r, g, b) <= 6, (
            "The sheet is not opaque neutral white"
        )
        assert art.getpixel((1325, 60))[3] == 255
        assert art.getpixel((900, 831))[3] == 255
        assert clay.getpixel((662, 30))[3] == 0, "Clay contains the pink plate"
        stock = art.getchannel("A").resize(clay.size, Image.Resampling.BOX)
        # The passes sample pixel edges at different resolutions. Erode one
        # desktop pixel before comparing their opaque interiors.
        interior = clay.getchannel("A").filter(ImageFilter.MinFilter(3))
        assert ImageChops.subtract(interior, stock).getextrema()[1] == 0, (
            "Finished crop loses part of the matched clay silhouette"
        )


if __name__ == "__main__":
    main(*(Path(arg) for arg in sys.argv[1:]))
