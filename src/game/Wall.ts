import * as THREE from 'three';
import { COLORS, TUNING } from '../config/tuning';
import type { Assets } from './Assets';

/**
 * Wall - the one breakable segment.
 *
 *   - Starts as Wall_Segment.glb (intact).
 *   - First hit: swapped for Wall_Segment_Fractured.glb at the same transform.
 *   - As HP drops, chunks near the impact zone (bottom centre, up to ~3.5 m)
 *     are knocked out one by one and a rubble rock lands on the ground.
 *   - HP 0: every hole chunk is gone and the player can walk through.
 *
 * The file's flat back face is at z = -0.92 and the L-foot points +Z. The
 * segment is turned 180 degrees and pushed back so that, in the world, the
 * flat face sits exactly on z = 0 and the foot points away from the player.
 */

/** Distance from the segment origin to its flat face (from the GLB). */
export const WALL_FACE_OFFSET = 0.92;
/** Width of one segment (m). */
export const SEGMENT_WIDTH = 2.4;

interface Chunk {
  mesh: THREE.Mesh;
  /** World-space centre while still in the wall. */
  center: THREE.Vector3;
  size: number;
  /** How far this chunk has been knocked inwards by hits (m). */
  pushed: number;
}

interface FlyingChunk {
  mesh: THREE.Mesh;
  material: THREE.Material;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
  life: number;
  rubbleAt: THREE.Vector3;
  rubbleSpawned: boolean;
}

interface Rubble {
  obj: THREE.Object3D;
  scale: number;
  grow: number;
}

export interface WallHit {
  /** This hit turned the intact wall into the fractured one. */
  firstHit: boolean;
  /** Where the tool met the concrete (world space), for dust and the damage number. */
  point: THREE.Vector3;
  /** World centres of the chunks that just fell out. */
  fallen: THREE.Vector3[];
  /** The hole just became big enough to see through. */
  brokeThrough: boolean;
  /** HP just reached zero. */
  destroyed: boolean;
}

/** Positioning shared by the intact and the fractured model. */
export function placeSegment(obj: THREE.Object3D, x: number): void {
  obj.position.set(x, 0, -WALL_FACE_OFFSET);
  obj.rotation.y = Math.PI;
}

/**
 * Area (m2) of a chunk that lies on the wall's flat face. Chunks with almost
 * none are buried inside the foot and should fall after the visible ones.
 */
function faceArea(mesh: THREE.Mesh): number {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const index = geo.index;
  // Face plane in the chunk's local space (pivot was moved to the chunk centre).
  const planeZ = -WALL_FACE_OFFSET - mesh.position.z;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  let area = 0;
  const count = index ? index.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(pos, index ? index.getX(i) : i);
    b.fromBufferAttribute(pos, index ? index.getX(i + 1) : i + 1);
    c.fromBufferAttribute(pos, index ? index.getX(i + 2) : i + 2);
    if (Math.abs(a.z - planeZ) > 0.03 || Math.abs(b.z - planeZ) > 0.03 || Math.abs(c.z - planeZ) > 0.03) continue;
    n.crossVectors(b.sub(a), c.sub(a));
    area += n.length() * 0.5;
  }
  return area;
}

export class Wall {
  /** Everything the wall adds to the scene lives in here. */
  readonly group = new THREE.Group();
  readonly maxHp: number;
  hp: number;

  private intact: THREE.Object3D | null;
  private fractured: THREE.Object3D | null = null;
  /** Hole chunks in the order they fall out. */
  private holeChunks: Chunk[] = [];
  /** Every chunk still attached to the wall (for hit tests). */
  private attached: THREE.Mesh[] = [];
  private removed = 0;
  private flying: FlyingChunk[] = [];
  private rubble: Rubble[] = [];
  private decals: THREE.Mesh[] = [];
  private decalGeo = new THREE.PlaneGeometry(1, 1);
  private decalMat: THREE.MeshBasicMaterial;
  private marker: THREE.Mesh;
  private shake = 0;
  private raycaster = new THREE.Raycaster();
  private brokeThroughDone = false;

  constructor(
    private assets: Assets,
    readonly x: number,
    maxHp: number,
    hp: number,
  ) {
    this.maxHp = maxHp;
    this.hp = Math.max(0, Math.min(maxHp, hp));

    this.intact = assets.instance('wall');
    placeSegment(this.intact, x);
    this.group.add(this.intact);

    this.decalMat = new THREE.MeshBasicMaterial({
      map: assets.crackTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      toneMapped: false,
    });

    this.marker = this.makeMarker();
    this.group.add(this.marker);

    // Coming back to a wall that is already damaged: rebuild the hole instantly.
    if (this.hp < this.maxHp) {
      this.fracture();
      const target = this.chunksThatShouldBeGone();
      while (this.removed < target) this.dropChunk(this.holeChunks[this.removed++], true);
      this.brokeThroughDone = this.holeThrough;
    }
  }

  /** 0 = untouched, 1 = down. */
  get damage(): number {
    return 1 - this.hp / this.maxHp;
  }

  get destroyed(): boolean {
    return this.hp <= 0;
  }

  /** Enough chunks are gone to see daylight. */
  get holeThrough(): boolean {
    return this.holeChunks.length > 0 && this.removed / this.holeChunks.length >= TUNING.wall.holeThroughFraction;
  }

  /**
   * Apply one hit.
   * @param fromX player x, @param height impact height on the wall face
   */
  hit(damage: number, fromX: number, height: number): WallHit {
    const firstHit = !this.fractured;
    if (firstHit) this.fracture();
    this.hp = Math.max(0, this.hp - damage);

    const point = this.findImpact(fromX, height);
    const fallen: THREE.Vector3[] = [];
    const target = this.chunksThatShouldBeGone();
    while (this.removed < target) {
      const chunk = this.holeChunks[this.removed++];
      fallen.push(chunk.center.clone());
      this.dropChunk(chunk, false);
    }

    let brokeThrough = false;
    if (!this.brokeThroughDone && this.holeThrough) {
      this.brokeThroughDone = true;
      brokeThrough = true;
    }
    this.shake = 1;
    return { firstHit, point, fallen, brokeThrough, destroyed: this.hp <= 0 };
  }

  update(dt: number): void {
    // Whole-segment rattle after a hit.
    if (this.fractured) {
      this.shake = Math.max(0, this.shake - dt * 9);
      const s = this.shake * 0.02;
      this.fractured.position.x = this.x + (Math.random() - 0.5) * s;
      this.fractured.position.y = (Math.random() - 0.5) * s * 0.5;
    }

    // Chunks in flight: fly back and down, spin, fade.
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.age += dt;
      f.vel.y -= 13 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += f.spin.x * dt;
      f.mesh.rotation.y += f.spin.y * dt;
      f.mesh.rotation.z += f.spin.z * dt;
      const k = f.age / f.life;
      (f.material as THREE.MeshStandardMaterial).opacity = k < 0.45 ? 1 : Math.max(0, 1 - (k - 0.45) / 0.55);
      f.mesh.scale.setScalar(1 - 0.35 * k);
      if (!f.rubbleSpawned && (k > 0.55 || f.mesh.position.y < 0.25)) {
        f.rubbleSpawned = true;
        this.addRubble(f.rubbleAt.x, f.rubbleAt.z, false);
      }
      if (k >= 1) {
        this.group.remove(f.mesh);
        f.material.dispose();
        this.flying.splice(i, 1);
      }
    }

    // Rubble pops in.
    for (const r of this.rubble) {
      if (r.grow < 1) {
        r.grow = Math.min(1, r.grow + dt * 7);
        const e = 1 - (1 - r.grow) * (1 - r.grow);
        r.obj.scale.setScalar(r.scale * (0.3 + 0.7 * e));
      }
    }
  }

  dispose(): void {
    for (const f of this.flying) f.material.dispose();
    this.decalGeo.dispose();
    this.decalMat.dispose();
    (this.marker.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.marker.material as THREE.Material).dispose();
    this.marker.geometry.dispose();
    this.group.removeFromParent();
  }

  // ---- internals ------------------------------------------------------------

  private chunksThatShouldBeGone(): number {
    const n = this.holeChunks.length;
    if (this.hp <= 0) return n;
    return Math.min(n - 1, Math.floor(n * this.damage));
  }

  /** Swap the intact segment for the pre-broken one at the same transform. */
  private fracture(): void {
    if (this.intact) {
      this.group.remove(this.intact);
      this.intact = null;
    }
    this.marker.visible = false;
    const model = this.assets.instance('wallFractured');
    placeSegment(model, this.x);
    this.group.add(model);
    model.updateMatrixWorld(true);
    this.fractured = model;

    const candidates: { chunk: Chunk; key: number }[] = [];
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    for (const child of model.children) {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) continue;
      this.attached.push(mesh);
      if (!mesh.name.startsWith('Chunk')) continue; // the pipe on top stays
      const center = mesh.getWorldPosition(new THREE.Vector3());
      if (center.y > TUNING.wall.holeMaxHeight) continue;
      box.copy(mesh.geometry.boundingBox!);
      box.getSize(size);
      const volume = size.x * size.y * size.z;
      // Fall order: low first, centre first, small first, buried pieces later.
      const buried = faceArea(mesh) < 0.05 ? 0.9 : 0;
      const key = center.y + 0.5 * Math.abs(center.x - this.x) + 0.25 * Math.cbrt(volume) + buried;
      candidates.push({ chunk: { mesh, center, size: Math.cbrt(volume), pushed: 0 }, key });
    }
    candidates.sort((a, b) => a.key - b.key);
    this.holeChunks = candidates.map((c) => c.chunk);
  }

  /** Knock one chunk out of the wall. `instant` skips the animation (restoring a save). */
  private dropChunk(chunk: Chunk, instant: boolean): void {
    const mesh = chunk.mesh;
    const at = this.attached.indexOf(mesh);
    if (at >= 0) this.attached.splice(at, 1);
    // Cracks painted on this chunk go with it.
    for (let i = this.decals.length - 1; i >= 0; i--) {
      if (this.decals[i].parent === mesh) {
        mesh.remove(this.decals[i]);
        this.decals.splice(i, 1);
      }
    }

    // Rubble lands in front of the wall, near where the chunk was.
    const seed = this.removed * 12.9898;
    const rx = this.x + Math.max(-1.5, Math.min(1.5, (chunk.center.x - this.x) * 1.2 + Math.sin(seed) * 0.5));
    const rz = 0.45 + Math.abs(Math.sin(seed * 1.7)) * 1.9;

    if (instant) {
      mesh.removeFromParent();
      this.addRubble(rx, rz, true);
      return;
    }

    // Move the chunk into world space so it can fly freely.
    this.group.attach(mesh);
    const material = (mesh.material as THREE.Material).clone();
    material.transparent = true;
    mesh.material = material;
    mesh.castShadow = false;

    // Big pieces (the foot) topple slowly, small ones pop out fast.
    const heavy = Math.min(1, chunk.size / 2.4);
    const speed = 1 - 0.75 * heavy;
    this.flying.push({
      mesh,
      material,
      vel: new THREE.Vector3((Math.random() - 0.5) * 3 * speed, (2.2 + Math.random() * 2) * speed, (2.6 + Math.random() * 2.2) * speed),
      spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9).multiplyScalar(speed),
      age: 0,
      life: 0.75 + 0.35 * heavy,
      rubbleAt: new THREE.Vector3(rx, 0, rz),
      rubbleSpawned: false,
    });
  }

  private addRubble(x: number, z: number, instant: boolean): void {
    const n = this.rubble.length;
    const obj = this.assets.rubblePiece(n * 5 + 2);
    const scale = 0.34 + ((n * 37) % 10) * 0.022;
    obj.position.set(x, 0, z);
    obj.rotation.y = n * 2.399;
    obj.scale.setScalar(instant ? scale : scale * 0.3);
    this.group.add(obj);
    this.rubble.push({ obj, scale, grow: instant ? 1 : 0 });
  }

  /**
   * Find where a punch from `fromX` at `height` meets concrete, paint a crack
   * there and nudge the chunk that was hit.
   */
  private findImpact(fromX: number, height: number): THREE.Vector3 {
    const W = TUNING.wall;
    const half = SEGMENT_WIDTH / 2 - 0.25;
    const x = Math.max(this.x - half, Math.min(this.x + half, fromX + (Math.random() - 0.5) * 0.5));
    const y = Math.max(W.impactMinY, Math.min(W.impactMaxY + 0.2, height + (Math.random() - 0.5) * 0.3));
    const origin = new THREE.Vector3(x, y, 2.5);
    const fallback = new THREE.Vector3(x, y, 0);
    if (!this.fractured) return fallback;
    this.group.updateMatrixWorld(true);

    // Straight ahead first; if that is already a hole, aim at the next chunk to fall.
    let hit = this.castAt(origin, new THREE.Vector3(0, 0, -1));
    if (!hit && this.removed < this.holeChunks.length) {
      const next = this.holeChunks[this.removed].center;
      const dir = next.clone().sub(origin).normalize();
      hit = this.castAt(origin, dir);
    }
    if (!hit) {
      fallback.z = -0.3;
      return fallback;
    }

    const mesh = hit.object as THREE.Mesh;
    const normal = hit.face
      ? hit.face.normal.clone().transformDirection(mesh.matrixWorld)
      : new THREE.Vector3(0, 0, 1);
    this.addDecal(mesh, hit.point, normal);

    // Each hit loosens the chunk a little.
    const chunk = this.holeChunks.find((c) => c.mesh === mesh);
    if (chunk && chunk.pushed < 0.07) {
      chunk.pushed += 0.012;
      mesh.position.z += 0.012; // local +Z is away from the player (segment is turned 180 degrees)
      mesh.rotation.x += (Math.random() - 0.5) * 0.02;
      mesh.rotation.y += (Math.random() - 0.5) * 0.02;
    }
    return hit.point.clone();
  }

  private castAt(origin: THREE.Vector3, dir: THREE.Vector3): THREE.Intersection | null {
    this.raycaster.set(origin, dir);
    this.raycaster.far = 6;
    const hits = this.raycaster.intersectObjects(this.attached, false);
    // Ignore hits deep inside the hole (the far side of the foot).
    return hits.length > 0 && hits[0].point.z > -1.4 ? hits[0] : null;
  }

  private addDecal(parent: THREE.Mesh, point: THREE.Vector3, normal: THREE.Vector3): void {
    const decal = new THREE.Mesh(this.decalGeo, this.decalMat);
    const size = 0.6 + Math.random() * 0.45;
    decal.scale.set(size, size, 1);
    decal.position.copy(point).addScaledVector(normal, 0.015);
    decal.lookAt(point.clone().addScaledVector(normal, 1));
    decal.rotateZ(Math.random() * Math.PI * 2);
    decal.renderOrder = 1;
    this.group.add(decal);
    decal.updateMatrixWorld(true);
    parent.attach(decal); // rides along if the chunk is nudged or falls
    this.decals.push(decal);
    if (this.decals.length > TUNING.wall.maxDecals) {
      const old = this.decals.shift()!;
      old.removeFromParent();
    }
  }

  /** Yellow target painted on the intact wall so the breakable segment is easy to find. */
  private makeMarker(): THREE.Mesh {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const c = size / 2;
    const ring = (radius: number, width: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(c, c, radius, 0, Math.PI * 2);
      ctx.stroke();
    };
    const cross = (width: number, color: string, len: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(c - len, c - len);
      ctx.lineTo(c + len, c + len);
      ctx.moveTo(c + len, c - len);
      ctx.lineTo(c - len, c + len);
      ctx.stroke();
    };
    ring(96, 34, COLORS.ink);
    cross(40, COLORS.ink, 50);
    ring(96, 20, COLORS.yellow);
    cross(26, COLORS.yellow, 46);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    mesh.position.set(this.x, 1.5, 0.02);
    mesh.renderOrder = 1;
    return mesh;
  }
}
