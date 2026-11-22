// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { Matrix4, Mesh, Texture, Vector3 } from 'three';
import { beforeAll, expect, it } from 'vitest';
import { atlas, keys } from './keyboard.json';
import { createMachine, setView } from './scene';
import type { MachineScene } from './scene';

let machine: MachineScene;
beforeAll(async () => {
  const bytes = await readFile('apps/desktop/src/typewriter/assets/machine.glb');
  machine = await createMachine(Uint8Array.from(bytes).buffer, new Texture());
});

it('binds one physical overlay UV and exposed cap hit to each legend, without mirroring', () => {
  expect(machine.caps.size).toBe(46);
  const point = new Vector3();
  for (const [index, { id }] of keys.entries()) {
    const cap = machine.caps.get(id)!;
    const { position, uv } = cap.geometry.attributes;
    const texels = [];
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i) * atlas.columns, v = uv.getY(i) * atlas.rows;
      if (u < .01 && v < .02) continue; // transparent sidewall texel
      expect([Math.floor(u), Math.floor(v)], id).toEqual([index % 8, Math.floor(index / 8)]);
      texels.push(u);
      expect(Math.sign(u % 1 - .5), id).toBe(Math.sign(position.getX(i)));
      // The back of the cap (-Z) is the top of the upright legend.
      expect(Math.sign(v % 1 - .5), id).toBe(Math.sign(position.getZ(i)));
    }
    expect(new Set(texels).size, id).toBeGreaterThan(1);
    point.copy(cap.position).project(machine.camera);
    expect(machine.pick(point.x, point.y), id).toBe(id);
    const top = cap.position.y;
    machine.press(id, true);
    expect(cap.position.y, id).toBeLessThan(top);
    for (const [other, target] of machine.caps) {
      if (other !== id) expect(target.position.y, other).toBeCloseTo(target.userData.top, 6);
    }
    machine.press(id, false);
    expect(cap.position.y, id).toBe(top);
  }
});

it('after orbit, picks adjacent caps independently and rejects the gap between them', () => {
  setView(machine.camera, -.39, .15);
  const a = machine.caps.get('KeyA')!.position.clone();
  const s = machine.caps.get('KeyS')!.position.clone();
  const gap = a.clone().lerp(s, .5).project(machine.camera);
  a.project(machine.camera);
  s.project(machine.camera);
  expect(machine.pick(a.x, a.y)).toBe('KeyA');
  expect(machine.pick(s.x, s.y)).toBe('KeyS');
  expect(machine.pick(gap.x, gap.y)).toBeUndefined();
});

it('projects all depths up by the same CSS distance and retains the same hit targets', () => {
  setView(machine.camera);
  const points = ['Digit5', 'Space'].map(id => [id, machine.caps.get(id)!.position.clone()] as const);
  const before = points.map(([, p]) => p.clone().project(machine.camera));
  machine.float(6, 416);
  for (const [index, [id, p]] of points.entries()) {
    const after = p.clone().project(machine.camera);
    expect(after.x).toBeCloseTo(before[index].x, 8);
    expect((after.y - before[index].y) * 192).toBeCloseTo(6, 6);
    expect(machine.pick(after.x, after.y)).toBe(id);
  }
  machine.float(0, 416);
});

it('keeps the complete machine inside the art field through allowed orbit and float', () => {
  const point = new Vector3();
  const viewProjection = new Matrix4();
  const modelViewProjection = new Matrix4();
  const bounds = { x: 0, y: 0 };
  for (let u = 0; u < 36; u++) {
    for (let v = 0; v <= 8; v++) {
      setView(machine.camera, 2 * Math.PI * u / 36, -.17 + .71 * v / 8);
      viewProjection.multiplyMatrices(machine.camera.projectionMatrix, machine.camera.matrixWorldInverse);
      machine.root.traverse(object => {
        if (!(object instanceof Mesh)) return;
        const positions = object.geometry.attributes.position;
        modelViewProjection.multiplyMatrices(viewProjection, object.matrixWorld);
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(modelViewProjection);
          bounds.x = Math.max(bounds.x, Math.abs(point.x));
          bounds.y = Math.max(bounds.y, Math.abs(point.y));
        }
      });
    }
  }
  expect(bounds.x).toBeLessThan(.99);
  // Even at a narrow 280px art field, retain room for the 6 CSS px float.
  expect(bounds.y + 12 / (280 * 192 / 208)).toBeLessThan(.99);
}, 12000);

it('returns the same projected view after full turns in either direction', () => {
  const point = new Vector3(.11, .14, -.07);
  for (const yaw of [0, -.9, Math.PI]) {
    setView(machine.camera, yaw, .2);
    const expected = point.clone().project(machine.camera);
    for (const turns of [-2, -1, 1, 2]) {
      setView(machine.camera, yaw + turns * 2 * Math.PI, .2);
      expect(point.clone().project(machine.camera).distanceTo(expected)).toBeLessThan(1e-12);
    }
  }
});
