import {
  Euler, Group, MathUtils, Mesh, NearestFilter, PerspectiveCamera, PlaneGeometry, Raycaster, Scene,
  SRGBColorSpace, TextureLoader, Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { Intersection, Material, Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import modelUrl from './assets/machine.glb?url';
import atlasUrl from './assets/legends.png?url';
import { keys } from './keyboard.json';
import { castInk, plateInk } from './ink';

export const WIDTH = 208;
export const HEIGHT = 192;
const DISTANCE = .47;
const FIELD = .516;
const ASPECT = WIDTH / HEIGHT;
const pivot = new Vector3(0, .101, .016);
const restYaw = .60;
const restElevation = .057;
const orientation = new Euler(0, 0, 0, 'YXZ');

export function setView(camera: PerspectiveCamera, yaw = 0, lift = 0) {
  const angle = restYaw + yaw;
  const elevation = restElevation + lift;
  const pitchAway = 1 - Math.cos(lift);
  // Back away through top and underside views without changing the rest pose.
  const distance = DISTANCE + .055 * (1 - Math.cos(yaw)) + .10 * pitchAway - .15 * Math.expm1(-10 * pitchAway);
  const radial = Math.cos(elevation);
  camera.position.set(Math.sin(angle) * radial, Math.sin(elevation), Math.cos(angle) * radial)
    .multiplyScalar(distance).add(pivot);
  // Yaw, then local pitch, then the existing roll. No world-up pole to flip.
  const roll = -.20 * MathUtils.clamp(Math.sin(angle) / Math.sin(restYaw), -1, 1);
  camera.quaternion.setFromEuler(orientation.set(-elevation, angle, roll));
  camera.updateMatrixWorld();
}

export class MachineScene {
  readonly root = new Scene();
  readonly camera = new PerspectiveCamera(MathUtils.radToDeg(2 * Math.atan(FIELD / (2 * DISTANCE * ASPECT))), ASPECT, .01, 2);
  readonly caps = new Map<string, Mesh>();
  readonly plate = new Scene();
  private readonly disc = new Mesh(new PlaneGeometry(2, 2), plateInk());
  private readonly meshes: Mesh[] = [];
  private readonly ink = new Map<string, Material>();
  private readonly ray = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly localHit = new Vector3();
  private readonly hits: Intersection[] = [];

  constructor(body: Group, private readonly atlas: Texture) {
    const sourceMaterials = new Set<Material>();
    body.traverse(node => {
      if (!(node instanceof Mesh)) return;
      const cap = node.userData.cap;
      const style = typeof cap === 'string' ? 'cap' : node.name;
      if (typeof cap === 'string') {
        this.caps.set(cap, node);
        node.userData.top = node.position.y;
      }
      const original = node.material;
      if (Array.isArray(original)) original.forEach(material => sourceMaterials.add(material));
      else sourceMaterials.add(original);
      let ink = this.ink.get(style);
      if (!ink) {
        ink = castInk(style, atlas);
        this.ink.set(style, ink);
      }
      node.material = ink;
      this.meshes.push(node);
    });
    for (const source of sourceMaterials) source.dispose();
    this.root.add(body);
    this.root.updateMatrixWorld(true);
    this.plate.add(this.disc);
    setView(this.camera);
  }

  press(id: string, down: boolean) {
    const cap = this.caps.get(id);
    if (cap) {
      cap.position.y = cap.userData.top - (down ? .004 : 0);
      cap.updateMatrixWorld();
    }
  }

  pick(x: number, y: number) {
    this.pointer.set(x, y);
    this.ray.setFromCamera(this.pointer, this.camera);
    this.hits.length = 0;
    // Non-caps occlude the keyboard, but only the closest physical cap can press.
    this.ray.intersectObjects(this.meshes, false, this.hits);
    const hit = this.hits[0];
    const id = hit?.object.userData.cap;
    if (typeof id !== 'string' || hit.object.worldToLocal(this.localHit.copy(hit.point)).y < -.006) return;
    return id;
  }

  float(offset: number, cssWidth: number) {
    // One projection translation for all depths. The plate's clip-space
    // plane does not follow it; the raycaster uses the same shifted projection.
    this.camera.setViewOffset(WIDTH, HEIGHT, 0, offset * WIDTH / cssWidth, WIDTH, HEIGHT);
  }

  draw(renderer: WebGLRenderer, includePlate = true) {
    renderer.clear();
    if (includePlate) renderer.render(this.plate, this.camera);
    renderer.render(this.root, this.camera);
  }

  dispose() {
    for (const mesh of this.meshes) mesh.geometry.dispose();
    for (const ink of this.ink.values()) ink.dispose();
    this.disc.geometry.dispose();
    this.disc.material.dispose();
    this.atlas.dispose();
  }
}

export async function createMachine(bytes: ArrayBuffer, atlas: Texture) {
  const { scene } = await new GLTFLoader().parseAsync(bytes, '');
  const machine = new MachineScene(scene, atlas);
  if (machine.caps.size !== keys.length || keys.some(({ id }) => !machine.caps.has(id))) {
    machine.dispose();
    throw new Error('The typewriter model is missing a mapped key');
  }
  return machine;
}

export async function loadMachine(signal?: AbortSignal) {
  const bytes = await (await fetch(modelUrl, { signal })).arrayBuffer();
  const atlas = await new TextureLoader().loadAsync(atlasUrl);
  atlas.flipY = false; // GLB UVs use an upper-left origin.
  atlas.magFilter = atlas.minFilter = NearestFilter;
  atlas.generateMipmaps = false;
  atlas.colorSpace = SRGBColorSpace;
  try {
    signal?.throwIfAborted();
    return await createMachine(bytes, atlas);
  } catch (error) {
    atlas.dispose();
    throw error;
  }
}

export function createRenderer(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: true });
  if (!context) throw new Error('WebGL 2 is unavailable');
  const renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: false });
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(WIDTH, HEIGHT, false);
  return renderer;
}
