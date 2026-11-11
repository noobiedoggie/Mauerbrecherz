import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTFLoaderPlugin, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TOOLS } from '../config/tools';

/**
 * Assets - loads every GLB exactly as shipped and hands out clones.
 *
 * Nothing is remodelled. Two things happen at load time, both in memory only:
 *   1. The four wall files embed the *same* three concrete textures. The
 *      first file is loaded normally; the other files reuse its material so
 *      the textures are decoded and uploaded to the GPU once instead of four
 *      times.
 *   2. The fractured chunks have their pivot at the segment origin. Each
 *      chunk's pivot is moved to its own centre so it can spin when it is
 *      knocked out.
 */

export const ASSET_BASE = `${import.meta.env.BASE_URL}assets/`;

export type ModelKey =
  | 'player'
  | 'guard'
  | 'dog'
  | 'wall'
  | 'wallFractured'
  | 'wallRow'
  | 'rubble'
  | 'watchtower'
  | 'lamp'
  | 'fence'
  | 'hedgehog'
  | 'crate'
  | 'sandbags'
  | 'barrel'
  | 'coin'
  | 'ground'
  | `tool${number}`;

const MODEL_FILES: Record<string, string> = {
  player: 'characters/Player.glb',
  guard: 'characters/Guard.glb',
  dog: 'characters/GuardDog.glb',
  wall: 'wall/Wall_Segment.glb',
  wallFractured: 'wall/Wall_Segment_Fractured.glb',
  wallRow: 'wall/Wall_Row6.glb',
  rubble: 'wall/Rubble_Pieces.glb',
  watchtower: 'props/Prop_Watchtower.glb',
  lamp: 'props/Prop_StreetLamp.glb',
  fence: 'props/Prop_BarbedFence.glb',
  hedgehog: 'props/Prop_CzechHedgehog.glb',
  crate: 'props/Prop_Crate.glb',
  sandbags: 'props/Prop_Sandbags.glb',
  barrel: 'props/Prop_Barrel.glb',
  coin: 'props/Prop_Coin.glb',
  ground: 'props/Prop_GroundTile.glb',
};
for (const t of TOOLS) MODEL_FILES[`tool${t.id}`] = t.model;

/** Name of the textured material shared by all wall files. */
const SHARED_MATERIAL = 'Concrete';

/** GLTFLoader plugin: reuse the already-loaded concrete material. */
class SharedMaterialPlugin implements GLTFLoaderPlugin {
  readonly name = 'MB_shared_material';
  constructor(
    private parser: GLTFParser,
    private shared: { material: THREE.Material | null },
  ) {}

  loadMaterial(index: number): Promise<THREE.Material> | null {
    const def = this.parser.json.materials?.[index];
    if (def && def.name === SHARED_MATERIAL && this.shared.material) {
      return Promise.resolve(this.shared.material);
    }
    return null; // fall through to the normal loader
  }
}

export class Assets {
  private models = new Map<string, THREE.Object3D>();
  private shared: { material: THREE.Material | null } = { material: null };
  private loader: GLTFLoader;
  crackTexture!: THREE.Texture;

  constructor() {
    this.loader = new GLTFLoader();
    this.loader.register((parser) => new SharedMaterialPlugin(parser, this.shared));
  }

  /** Load everything. `onProgress` gets 0..1. */
  async loadAll(onProgress: (p: number) => void): Promise<void> {
    const keys = Object.keys(MODEL_FILES);
    const total = keys.length + 1;
    let done = 0;
    const tick = () => onProgress(++done / total);

    // The intact wall goes first: it provides the shared concrete material.
    await this.loadModel('wall');
    tick();
    this.models.get('wall')!.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !this.shared.material) {
        const m = mesh.material as THREE.Material;
        if (m.name === SHARED_MATERIAL) this.shared.material = m;
      }
    });

    const rest = keys.filter((k) => k !== 'wall').map((k) => this.loadModel(k).then(tick));
    const crack = new THREE.TextureLoader().loadAsync(`${ASSET_BASE}wall/Crack_Decal.png`).then((tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      this.crackTexture = tex;
      tick();
    });
    await Promise.all([...rest, crack]);

    this.prepareFractured();
    this.prepareRubble();
    this.prepareGround();
  }

  private async loadModel(key: string): Promise<void> {
    const gltf = await this.loader.loadAsync(ASSET_BASE + MODEL_FILES[key]);
    const root = gltf.scene;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    this.models.set(key, root);
  }

  /** Move every chunk's pivot to its centre (geometry is shared by all clones). */
  private prepareFractured(): void {
    const root = this.models.get('wallFractured')!;
    root.updateMatrixWorld(true);
    const center = new THREE.Vector3();
    for (const child of root.children) {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) continue;
      mesh.geometry.computeBoundingBox();
      mesh.geometry.boundingBox!.getCenter(center);
      mesh.geometry.translate(-center.x, -center.y, -center.z);
      mesh.position.add(center);
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    }
  }

  /** Rubble rocks are laid out in a row in the file; bring each one to the origin. */
  private prepareRubble(): void {
    const root = this.models.get('rubble')!;
    for (const child of root.children) child.position.set(0, 0, 0);
  }

  /**
   * The sand tile has no UVs or texture. Give it UVs (in metres) and a
   * minimalist procedural texture: raked lines parallel to the wall (the
   * real death strip was raked to show footprints), soft patches and grain.
   * The tile's own sand colour is kept; the texture only shades it.
   */
  private prepareGround(): void {
    const root = this.models.get('ground')!;
    const tex = makeSandTexture();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      const uv = new Float32Array(pos.count * 2);
      // One texture repeat = SAND_TEXTURE_METRES; the tile is 10 m.
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = (pos.getX(i) + 5) / SAND_TEXTURE_METRES;
        uv[i * 2 + 1] = (pos.getZ(i) + 5) / SAND_TEXTURE_METRES;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.map = tex;
      mat.needsUpdate = true;
    });
  }

  /**
   * A fresh instance of a model. Geometry and materials are shared with
   * every other instance (Object3D.clone), so this is cheap.
   */
  instance(key: ModelKey): THREE.Object3D {
    const src = this.models.get(key);
    if (!src) throw new Error(`Model not loaded: ${key}`);
    return src.clone(true);
  }

  /** One random rubble rock (shared geometry). */
  rubblePiece(index: number): THREE.Object3D {
    const root = this.models.get('rubble')!;
    return root.children[index % root.children.length].clone(true);
  }

  get concreteMaterial(): THREE.Material | null {
    return this.shared.material;
  }
}

/** Turn shadow casting on/off for a whole model instance. */
export function setShadows(obj: THREE.Object3D, cast: boolean, receive = true): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
  });
}

/** Size (m) covered by one repeat of the sand texture. 10 must divide by it. */
const SAND_TEXTURE_METRES = 5;

/**
 * Seamless 512 px greyscale sand texture (values around 1, so it multiplies
 * the sand colour). Everything is drawn with wrap-around so tiles join.
 */
function makeSandTexture(): THREE.CanvasTexture {
  const N = 512;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ececec';
  g.fillRect(0, 0, N, N);

  // Deterministic random so every run looks the same.
  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const wrapped = (draw: (ox: number, oy: number) => void) => {
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) draw(ox, oy);
  };

  // 1. Soft light/dark patches.
  for (let i = 0; i < 26; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const r = 40 + rnd() * 110;
    const light = rnd() < 0.5;
    wrapped((ox, oy) => {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, light ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }

  // 2. Raked lines along X (parallel to the wall), gently wavy.
  const lines = 14; // must divide evenly into the texture for a seamless repeat
  for (let i = 0; i < lines; i++) {
    const y0 = (i + 0.5) * (N / lines);
    for (const [dy, alpha, width] of [
      [0, 0.1, 2.2],
      [2.5, 0.07, 1.2],
    ] as const) {
      g.strokeStyle = dy === 0 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
      g.lineWidth = width;
      g.beginPath();
      for (let x = 0; x <= N; x += 8) {
        const y = y0 + dy + Math.sin((x / N) * Math.PI * 2 * 2 + i) * 2.2;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }

  // 3. Fine grain and a few small pebbles.
  for (let i = 0; i < 5200; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${0.04 + rnd() * 0.07})`;
    g.fillRect(rnd() * N, rnd() * N, 1.5, 1.5);
  }
  for (let i = 0; i < 70; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const r = 1.2 + rnd() * 2;
    wrapped((ox, oy) => {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.beginPath();
      g.arc(x + ox + 0.8, y + oy + 0.8, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.beginPath();
      g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      g.fill();
    });
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4; // stays crisp at the tilted camera angle
  return tex;
}
