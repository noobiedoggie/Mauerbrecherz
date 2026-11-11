import * as THREE from 'three';
import type { Vec2 } from '../config/levels';
import { COLORS } from '../config/tuning';
import { circleCollider } from './Collision';
import type { Collider } from './Collision';

/**
 * Hazards - buried mines, tripwires and warning signs (walls 11+).
 *
 * There are no models for these in the asset pack, so they are built from
 * a few simple shapes in the same flat, clean style as the props.
 *
 *   MINE      Almost invisible at a distance. Inside the Mine Sense range a
 *             red ring pulses and the mine beeps faster as you get closer.
 *             Step on it and the attempt is over.
 *   TRIPWIRE  A thin wire between two stakes, hard to see until you are
 *             close. Touching it snaps it, rattles the cans and sounds a
 *             siren: every guard comes to look.
 */

/** Distance from a mine's centre that sets it off (m). */
const MINE_TRIGGER = 0.42;
/** How close the player's centre must get to a wire to snap it (m). */
const WIRE_TRIGGER = 0.3;

interface Mine {
  x: number;
  z: number;
  group: THREE.Group;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  led: THREE.Mesh;
  reveal: number;
  phase: number;
  alive: boolean;
}

interface Wire {
  a: Vec2;
  b: Vec2;
  line: THREE.Mesh;
  lineMat: THREE.MeshBasicMaterial;
  posts: THREE.Object3D[];
  reveal: number;
  intact: boolean;
}

let signTexture: THREE.CanvasTexture | null = null;

function getSignTexture(): THREE.CanvasTexture {
  if (signTexture) return signTexture;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = COLORS.yellow;
  g.fillRect(0, 0, 256, 160);
  g.strokeStyle = COLORS.ink;
  g.lineWidth = 12;
  g.strokeRect(6, 6, 244, 148);
  g.fillStyle = COLORS.ink;
  g.textAlign = 'center';
  g.font = '44px Anton, Impact, sans-serif';
  g.fillText('ACHTUNG!', 128, 66);
  g.fillStyle = COLORS.red;
  g.font = '52px Anton, Impact, sans-serif';
  g.fillText('MINEN', 128, 128);
  signTexture = new THREE.CanvasTexture(c);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  return signTexture;
}

export class Hazards {
  readonly group = new THREE.Group();
  private mines: Mine[] = [];
  private wires: Wire[] = [];
  private time = 0;
  private beepTimer = 0;

  /** Player stepped on a mine. */
  onExplode: (x: number, z: number) => void = () => {};
  /** Player snapped a tripwire (at the given point). */
  onTrip: (x: number, z: number) => void = () => {};
  /** A revealed mine wants to beep. `urgent` when very close. */
  onBeep: (x: number, z: number, urgent: boolean) => void = () => {};

  // Shared look.
  private mineBody = new THREE.CylinderGeometry(0.2, 0.22, 0.08, 16);
  private mineTop = new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12);
  private ledGeo = new THREE.SphereGeometry(0.03, 8, 6);
  private ringGeo = new THREE.RingGeometry(0.42, 0.56, 32);
  private bodyMat = new THREE.MeshStandardMaterial({ color: 0x9a8058, roughness: 0.95, metalness: 0.05 });
  private topMat = new THREE.MeshStandardMaterial({ color: 0x8c8a78, roughness: 0.6, metalness: 0.4 });
  private ledMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false });
  private stakeGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.5, 6);
  private stakeMat = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.9 });
  private canGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.11, 10);
  private canMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.8 });
  private wireGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4);

  constructor(mines: Vec2[], wires: [Vec2, Vec2][], signs: Vec2[], colliders: Collider[]) {
    this.ringGeo.rotateX(-Math.PI / 2);
    this.wireGeo.rotateZ(Math.PI / 2); // length along X

    mines.forEach(([x, z], i) => this.addMine(x, z, i));
    for (const [a, b] of wires) this.addWire(a, b, colliders);
    for (const [x, z] of signs) this.addSign(x, z, colliders);
  }

  private addMine(x: number, z: number, i: number): void {
    const group = new THREE.Group();
    group.position.set(x, -0.055, z); // mostly buried in the sand
    group.rotation.y = i * 1.3;
    const body = new THREE.Mesh(this.mineBody, this.bodyMat);
    body.position.y = 0.03;
    body.receiveShadow = true;
    const top = new THREE.Mesh(this.mineTop, this.topMat);
    top.position.y = 0.08;
    const led = new THREE.Mesh(this.ledGeo, this.ledMat);
    led.position.set(0.13, 0.08, 0);
    led.visible = false;
    group.add(body, top, led);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3a22,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.position.set(x, 0.05, z);
    ring.renderOrder = 3;
    this.group.add(group, ring);
    this.mines.push({ x, z, group, ring, ringMat, led, reveal: 0, phase: i * 0.7, alive: true });
  }

  private addWire(a: Vec2, b: Vec2, colliders: Collider[]): void {
    const posts: THREE.Object3D[] = [];
    for (const [x, z] of [a, b]) {
      const stake = new THREE.Mesh(this.stakeGeo, this.stakeMat);
      stake.position.set(x, 0.25, z);
      stake.castShadow = true;
      const can = new THREE.Mesh(this.canGeo, this.canMat);
      can.position.set(0.07, 0.05, 0);
      can.castShadow = true;
      stake.add(can);
      this.group.add(stake);
      posts.push(stake);
      colliders.push(circleCollider(x, z, 0.08, false, false));
    }
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xb8bcc2, transparent: true, opacity: 0.25, toneMapped: false });
    const line = new THREE.Mesh(this.wireGeo, lineMat);
    line.scale.x = len;
    line.position.set((a[0] + b[0]) / 2, 0.36, (a[1] + b[1]) / 2);
    line.rotation.y = -Math.atan2(dz, dx);
    this.group.add(line);
    this.wires.push({ a, b, line, lineMat, posts, reveal: 0, intact: true });
  }

  private addSign(x: number, z: number, colliders: Collider[]): void {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), this.stakeMat);
    post.position.set(x, 0.65, z);
    post.castShadow = true;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.6),
      new THREE.MeshStandardMaterial({ map: getSignTexture(), roughness: 0.8, side: THREE.DoubleSide }),
    );
    board.position.set(0, 0.42, 0.05);
    board.rotation.z = (x * 0.37) % 0.2; // a little crooked
    board.castShadow = true;
    post.add(board);
    this.group.add(post);
    colliders.push(circleCollider(x, z, 0.12, false, false));
  }

  /**
   * @param revealR Mine Sense range (m)
   * @param active  false while the player cannot trigger anything (menus, end screens)
   */
  update(dt: number, px: number, pz: number, revealR: number, active: boolean): void {
    this.time += dt;
    let nearest = Infinity;
    let nearX = 0;
    let nearZ = 0;

    for (const m of this.mines) {
      if (!m.alive) continue;
      const d = Math.hypot(px - m.x, pz - m.z);
      const want = active && d < revealR ? 1 : 0;
      m.reveal += (want - m.reveal) * Math.min(1, dt * 8);
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 7 + m.phase);
      m.ringMat.opacity = m.reveal * (0.35 + 0.45 * pulse);
      m.ring.scale.setScalar(1 + 0.12 * pulse * m.reveal);
      m.led.visible = m.reveal > 0.3 && Math.sin(this.time * 9 + m.phase) > 0;
      if (active && d < revealR && d < nearest) {
        nearest = d;
        nearX = m.x;
        nearZ = m.z;
      }
      if (active && d < MINE_TRIGGER) {
        m.alive = false;
        m.group.visible = false;
        m.ring.visible = false;
        this.onExplode(m.x, m.z);
        return;
      }
    }

    // Beeps speed up the closer you are (like a metal detector).
    if (nearest < Infinity) {
      const k = Math.max(0, Math.min(1, nearest / revealR));
      const interval = 0.12 + 0.75 * k;
      this.beepTimer -= dt;
      if (this.beepTimer <= 0) {
        this.beepTimer = interval;
        this.onBeep(nearX, nearZ, k < 0.35);
      }
    } else {
      this.beepTimer = 0;
    }

    for (const w of this.wires) {
      if (!w.intact) continue;
      const d = distToSegment(px, pz, w.a, w.b);
      const want = active && d < revealR ? 1 : 0;
      w.reveal += (want - w.reveal) * Math.min(1, dt * 6);
      // A faint glint far away, a bright red-white wire up close.
      const glint = 0.5 + 0.5 * Math.sin(this.time * 3 + w.a[0]);
      w.lineMat.opacity = 0.18 + 0.1 * glint + 0.7 * w.reveal;
      w.lineMat.color.setRGB(0.72 + 0.28 * w.reveal, 0.74 - 0.4 * w.reveal * glint, 0.76 - 0.5 * w.reveal * glint);
      if (active && d < WIRE_TRIGGER) {
        w.intact = false;
        w.line.visible = false;
        w.posts[0].rotation.z = 0.5;
        w.posts[1].rotation.z = -0.5;
        this.onTrip(px, pz);
      }
    }
  }

  /** Mine positions still armed (guards and tests use this). */
  get armedMines(): Vec2[] {
    return this.mines.filter((m) => m.alive).map((m) => [m.x, m.z] as Vec2);
  }

  dispose(): void {
    for (const m of this.mines) m.ringMat.dispose();
    for (const w of this.wires) w.lineMat.dispose();
    for (const g of [this.mineBody, this.mineTop, this.ledGeo, this.ringGeo, this.stakeGeo, this.canGeo, this.wireGeo]) g.dispose();
    for (const mat of [this.bodyMat, this.topMat, this.ledMat, this.stakeMat, this.canMat]) mat.dispose();
    this.group.removeFromParent();
  }
}

function distToSegment(px: number, pz: number, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) : 0;
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
}
