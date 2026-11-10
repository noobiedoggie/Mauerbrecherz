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
