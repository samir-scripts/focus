import { expect, it } from 'vitest';
import { FlickSamples, coastTravel, COAST_DURATION } from './flick';

function release(points: [number, number][], up: number) {
  const samples = new FlickSamples();
  samples.start(...points[0]);
  for (const [x, time] of points.slice(1)) samples.move(x, time);
  return samples.release(up) * 180 / Math.PI;
}

it('uses recent movement speed, not total drag distance', () => {
  expect(release([[0, 0], [4, 50], [7, 100], [11, 150], [14, 200]], 202)).toBe(0);
  expect(release([[0, 0], [5, 10], [10, 20], [14, 30]], 32)).toBeLessThan(-180);
});

it('ignores an old flick, stop jitter, and a single late spike', () => {
  const fast: [number, number][] = [[0, 0], [10, 10], [20, 20], [40, 30]];
  expect(release(fast, 100)).toBe(0);
  expect(release([...fast, [41, 95], [39, 98]], 100)).toBe(0);
  expect(release([[0, 0], [2, 30], [4, 60], [150, 75]], 76)).toBe(0);
  expect(release([[0, 0], [150, 20]], 21)).toBe(0);
});

it('uses the latest sustained direction on reversal and caps the release speed', () => {
  const forward = release([[0, 0], [30, 10], [70, 20], [120, 30]], 31);
  expect(forward).toBeCloseTo(-300);
  expect(release([[0, 0], [60, 10], [110, 20], [85, 30], [60, 40], [40, 50]], 51)).toBeCloseTo(300);
});

it('decays by elapsed time, in the release direction, to a bounded stop', () => {
  const speed = 300 * Math.PI / 180;
  const degrees = (time: number) => coastTravel(speed, time) * 180 / Math.PI;
  expect(degrees(0)).toBe(0);
  expect(degrees(150)).toBeCloseTo(28.4454, 3);
  expect(degrees(300) - degrees(150)).toBeLessThan(degrees(150));
  expect(degrees(COAST_DURATION)).toBeCloseTo(44.1758, 3);
  expect(degrees(3000)).toBe(degrees(COAST_DURATION));
  expect(coastTravel(-speed, 150)).toBe(-coastTravel(speed, 150));
});
