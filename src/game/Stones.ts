import * as THREE from 'three';
import { TUNING } from '../config/tuning';
import type { Assets } from './Assets';

/**
 * Stones - throwable distractions.
 *
 *   - Stones in flight follow a simple arc and spin; where they land they
 *     make a noise (Game sends nearby guards to look).
 *   - Landed stones stay on the ground and can be picked up again, as can
 *     the stones some fallen wall chunks leave behind.
 *   - While aiming, a dashed arc and a target ring show where it will land.
 */

interface Flying {
  obj: THREE.Object3D;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  t: number;
  dur: number;
  apex: number;
}

interface Ground {
  obj: THREE.Object3D;
  ring: THREE.Mesh;
  x: number;
  z: number;
  /** Seconds before it can be picked up (so a fresh throw is not grabbed back). */
  wait: number;
  phase: number;
}

const ARC_DOTS = 12;
const START_HEIGHT = 1.45;

export class Stones {
  readonly group = new THREE.Group();
  /** A thrown stone hit the ground. */
  onLand: (x: number, z: number) => void = () => {};

  private flying: Flying[] = [];
  private ground: Ground[] = [];
  private time = 0;
  private serial = 0;

  private ringGeo = new THREE.RingGeometry(0.2, 0.28, 24);
  private ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  // Aim preview.
  private aim = new THREE.Group();
  private aimRing: THREE.Mesh;
  private dots: THREE.Mesh[] = [];

  constructor(private assets: Assets) {
    this.ringGeo.rotateX(-Math.PI / 2);

    const aimMat = new THREE.MeshBasicMaterial({ color: 0xffc234, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, fog: false });
    const ringGeo = new THREE.RingGeometry(0.42, 0.56, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.aimRing = new THREE.Mesh(ringGeo, aimMat);
    this.aimRing.renderOrder = 4;
    this.aim.add(this.aimRing);
    const dotGeo = new THREE.SphereGeometry(0.05, 8, 6);
    for (let i = 0; i < ARC_DOTS; i++) {
      const d = new THREE.Mesh(dotGeo, aimMat);
      d.renderOrder = 4;
      this.dots.push(d);
      this.aim.add(d);
    }
    this.aim.visible = false;
    this.group.add(this.aim);
  }

  /** Remove every stone (new attempt / level). */
  reset(): void {
    for (const f of this.flying) this.group.remove(f.obj);
    for (const g of this.ground) this.group.remove(g.obj, g.ring);
    this.flying.length = 0;
    this.ground.length = 0;
    this.aim.visible = false;
  }

  private makeStone(): THREE.Object3D {
    const obj = this.assets.rubblePiece(this.serial++ * 7 + 3);
    obj.scale.setScalar(0.2);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = false;
      }
    });
    return obj;
  }

  /** Arc peak height for a throw of this length. */
  private static apexFor(dist: number): number {
    return 0.7 + dist * 0.2;
  }

  /** Put a stone on the ground that can be picked up. */
  addGround(x: number, z: number, wait = 0): void {
    const obj = this.makeStone();
    obj.position.set(x, 0, z);
    obj.rotation.y = Math.random() * Math.PI * 2;
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    ring.position.set(x, 0.04, z);
    ring.renderOrder = 3;
    this.group.add(obj, ring);
    this.ground.push({ obj, ring, x, z, wait, phase: Math.random() * 6 });
  }

  /** Throw a stone from the player to a target point. */
  throw(fromX: number, fromZ: number, toX: number, toZ: number): void {
    const dist = Math.hypot(toX - fromX, toZ - fromZ);
    const obj = this.makeStone();
    obj.position.set(fromX, START_HEIGHT, fromZ);
    this.group.add(obj);
    this.flying.push({ obj, fromX, fromZ, toX, toZ, t: 0, dur: 0.32 + dist / 13, apex: Stones.apexFor(dist) });
  }

  /** Show / hide the aim preview. */
  setAim(visible: boolean, fromX = 0, fromZ = 0, toX = 0, toZ = 0): void {
    this.aim.visible = visible;
    if (!visible) return;
    this.aimRing.position.set(toX, 0.05, toZ);
    const pulse = 1 + Math.sin(this.time * 8) * 0.08;
    this.aimRing.scale.setScalar(pulse);
    const apex = Stones.apexFor(Math.hypot(toX - fromX, toZ - fromZ));
    for (let i = 0; i < ARC_DOTS; i++) {
      // Dots crawl along the arc so it reads as motion.
      const t = ((i + ((this.time * 2.2) % 1)) / ARC_DOTS) * 0.97;
      this.dots[i].position.set(
        fromX + (toX - fromX) * t,
        START_HEIGHT * (1 - t) + 4 * apex * t * (1 - t),
        fromZ + (toZ - fromZ) * t,
      );
    }
  }

  /**
   * @param room how many more stones the player can carry (0 = full)
   * @returns how many stones were picked up this frame
   */
  update(dt: number, px: number, pz: number, canPick: boolean, room: number): number {
    this.time += dt;

    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.obj.position.set(
        f.fromX + (f.toX - f.fromX) * k,
        START_HEIGHT * (1 - k) + 4 * f.apex * k * (1 - k),
        f.fromZ + (f.toZ - f.fromZ) * k,
      );
      f.obj.rotation.x += dt * 14;
      f.obj.rotation.z += dt * 9;
      if (k >= 1) {
        this.group.remove(f.obj);
        this.flying.splice(i, 1);
        this.addGround(f.toX, f.toZ, 0.8);
        this.onLand(f.toX, f.toZ);
      }
    }

    let picked = 0;
    for (let i = this.ground.length - 1; i >= 0; i--) {
      const g = this.ground[i];
      g.wait = Math.max(0, g.wait - dt);
      (g.ring.material as THREE.MeshBasicMaterial).opacity = 0.4; // shared material
      g.ring.scale.setScalar(1 + Math.sin(this.time * 3 + g.phase) * 0.15);
      if (canPick && picked < room && g.wait <= 0 && Math.hypot(g.x - px, g.z - pz) < TUNING.stones.pickup) {
        this.group.remove(g.obj, g.ring);
        this.ground.splice(i, 1);
        picked++;
      }
    }
    return picked;
  }

  dispose(): void {
    this.reset();
    this.ringGeo.dispose();
    this.ringMat.dispose();
    this.group.removeFromParent();
  }
}
