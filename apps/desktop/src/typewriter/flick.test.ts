import { expect, it } from 'vitest';
import { FlickSamples, chaseResidual, coastTravel, COAST_DURATION } from './flick';

function release(points: [number, number, number][], up: number) {
  const samples = new FlickSamples();
  samples.start(...points[0]);
  for (const point of points.slice(1)) samples.move(...point);
  const angles = samples.release(up);
  return angles && { yaw: angles.yaw * 180 / Math.PI, pitch: angles.pitch * 180 / Math.PI };
}

it('uses recent movement speed, not total drag distance', () => {
  expect(release([[0, 0, 0], [4, 0, 50], [7, 0, 100], [11, 0, 150], [14, 0, 200]], 202)).toBeUndefined();
  expect(release([[0, 0, 0], [5, 0, 10], [10, 0, 20], [14, 0, 30]], 32)?.yaw).toBeLessThan(-160);
});

it('ignores stale two-axis movement, stop jitter, and a single late spike', () => {
  const fast: [number, number, number][] = [[0, 0, 0], [10, 10, 10], [20, 20, 20], [40, 40, 30]];
  expect(release(fast, 100)).toBeUndefined();
  expect(release([...fast, [41, 40, 95], [39, 41, 98]], 100)).toBeUndefined();
  expect(release([[0, 0, 0], [2, 0, 30], [4, 0, 60], [4, 150, 75]], 76)).toBeUndefined();
});

it('uses the latest sustained two-axis direction and caps vector speed', () => {
  const forward = release([[0, 0, 0], [30, 30, 10], [70, 70, 20], [120, 120, 30]], 31)!;
  expect(forward.yaw).toBeLessThan(0);
  expect(forward.pitch).toBeGreaterThan(0);
  expect(Math.hypot(forward.yaw, forward.pitch)).toBeCloseTo(240);
  const reversed = release([[0, 0, 0], [60, 0, 10], [110, 0, 20], [85, -25, 30], [60, -50, 40], [40, -70, 50]], 51)!;
  expect(reversed.yaw).toBeGreaterThan(0);
  expect(reversed.pitch).toBeLessThan(0);
  const vertical = release([[0, 0, 0], [0, 30, 10], [0, 70, 20], [0, 120, 30]], 31)!;
  expect(vertical.yaw).toBeCloseTo(0);
  expect(vertical.pitch).toBeCloseTo(240);
});

it('chases with real elapsed time, preserves initial lag, and catches up', () => {
  const lag = 7 * Math.PI / 180;
  expect(chaseResidual(lag, 55) / lag).toBeCloseTo(Math.exp(-1), 2);
  expect(chaseResidual(chaseResidual(lag, 19), 36)).toBeCloseTo(chaseResidual(lag, 55), 10);
  const sharpLag = 45 * Math.PI / 180;
  expect(chaseResidual(sharpLag, 16)).toBeGreaterThan(.14);
  expect(chaseResidual(sharpLag, 55)).toBeLessThan(.14);
  expect(chaseResidual(chaseResidual(sharpLag, 19), 36)).toBeCloseTo(chaseResidual(sharpLag, 55), 10);
  expect(chaseResidual(sharpLag, 250)).toBeLessThan(.15 * Math.PI / 180);
});

it('decays by elapsed time, in the release direction, to a bounded stop', () => {
  const speed = 240 * Math.PI / 180;
  const degrees = (time: number) => coastTravel(speed, time) * 180 / Math.PI;
  expect(degrees(0)).toBe(0);
  expect(degrees(120)).toBeCloseTo(18.2051, 3);
  expect(degrees(300) - degrees(150)).toBeLessThan(degrees(150));
  expect(degrees(COAST_DURATION)).toBeCloseTo(28.6059, 3);
  expect(degrees(3000)).toBe(degrees(COAST_DURATION));
  expect(coastTravel(-speed, 150)).toBe(-coastTravel(speed, 150));
});
