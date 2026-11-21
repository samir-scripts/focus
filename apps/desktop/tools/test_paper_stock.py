import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location(
    'paper_stock', Path(__file__).with_name('build-paper-stock.py')
)
paper_stock = importlib.util.module_from_spec(spec)
spec.loader.exec_module(paper_stock)


class FlakeMaskTest(unittest.TestCase):
    def raster(self, x, y, size):
        width, height = 32, 24
        grid = [[0] * width for _ in range(height)]
        for left, top, w, h, alpha in paper_stock.flake_boxes(x, y, size, 100, width, height):
            self.assertTrue(0 <= left < left + w <= width)
            self.assertTrue(0 <= top < top + h <= height)
            for row in grid[top:top + h]:
                for col in range(left, left + w):
                    row[col] = max(row[col], alpha)
        return grid

    def test_dotted_head_and_wrapped_wake(self):
        grid = self.raster(1, 2, 3.5)
        interior = [alpha for row in grid[3:6] for alpha in row[2:5]]
        self.assertIn(0, interior)
        self.assertIn(100, interior)
        self.assertEqual(grid[4][30], 65)
        self.assertEqual(grid[2][16], 18)
        self.assertEqual(grid[4][31], 0)

    def test_tiny_speck_has_one_head_dot_and_a_fainter_wake(self):
        grid = self.raster(16, 10, 1)
        heads = [(x, y) for y, row in enumerate(grid) for x, ink in enumerate(row) if ink == 100]
        self.assertEqual(heads, [(16, 10)])
        self.assertEqual(grid[12][13], 65)
        self.assertEqual(grid[10][31], 18)

    def test_large_head_wraps_vertically_without_filling_the_hole(self):
        grid = self.raster(8, 22, 4.5)
        self.assertEqual(grid[0][10:13], [100, 0, 100])
        self.assertEqual(grid, self.raster(8, 22, 4.5))


if __name__ == '__main__':
    unittest.main()
