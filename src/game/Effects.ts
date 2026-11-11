import * as THREE from 'three';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import type { HapticKind } from '../config/tools';

/**
 * Effects - everything that makes a hit feel good and costs almost nothing:
 * dust puffs and debris (two instanced meshes), noise rings on the ground,
 * floating damage numbers (HTML) and haptics.
 */

interface Particle {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
  life: number;
  size: number;
}

/** Fixed-size pool of identical meshes drawn in one draw call. */
class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private items: Particle[] = [];
  private cursor = 0;
  private dummy = new THREE.Object3D();

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    count: number,
    private gravity: number,
    private drag: number,
    /** true: grow then shrink (dust). false: full size then shrink (debris). */
    private puff: boolean,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) {
      this.items.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        age: 0,
        life: 1,
        size: 1,
      });
    }
    this.flush();
  }

  spawn(pos: THREE.Vector3, vel: THREE.Vector3, size: number, life: number): void {
    const p = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    p.alive = true;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.spin.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    p.age = 0;
    p.life = life;
    p.size = size;
  }

  update(dt: number): void {
    let any = false;
    const damp = Math.max(0, 1 - this.drag * dt);
    for (const p of this.items) {
      if (!p.alive) continue;
      any = true;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      p.vel.y += this.gravity * dt;
      p.vel.multiplyScalar(damp);
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.03) {
        p.pos.y = 0.03;
        p.vel.y *= -0.3;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      p.rot.addScaledVector(p.spin, dt);
    }
    if (any || this.dirty) this.flush();
  }

  private dirty = true;

  private flush(): void {
    const d = this.dummy;
    let alive = false;
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i];
      if (p.alive) {
        alive = true;
        const k = p.age / p.life;
        const s = this.puff ? p.size * Math.sin(Math.min(1, k * 1.15) * Math.PI) * (0.6 + 0.8 * k) : p.size * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
        d.position.copy(p.pos);
        d.rotation.set(p.rot.x, p.rot.y, p.rot.z);
        d.scale.setScalar(Math.max(0.0001, s));
      } else {
        d.position.set(0, -50, 0);
        d.scale.setScalar(0.0001);
      }
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = alive;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

interface Ring {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  radius: number;
}

export class Effects {
  /** Add this to the scene once. */
  readonly group = new THREE.Group();
  vibrationOn = true;

  private dust: ParticlePool;
  private debris: ParticlePool;
  private rings: Ring[] = [];
  private ringGeo = new THREE.RingGeometry(0.965, 1, 48);
  private v = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private lastRing = 0;
  private clock = 0;

  constructor(
    private camera: THREE.Camera,
    /** HTML layer for the floating numbers. */
    private layer: HTMLElement,
  ) {
    this.dust = new ParticlePool(
      new THREE.IcosahedronGeometry(0.5, 1),
      new THREE.MeshBasicMaterial({ color: 0xd9d2c3, transparent: true, opacity: 0.6, depthWrite: false }),
      56,
      0.6,
      2.6,
      true,
    );
    this.debris = new ParticlePool(
      new THREE.TetrahedronGeometry(0.5, 0),
      new THREE.MeshLambertMaterial({ color: 0x8f8d88, flatShading: true }),
      72,
      -14,
      0.4,
      false,
    );
    this.ringGeo.rotateX(-Math.PI / 2);
    this.group.add(this.dust.mesh, this.debris.mesh);
  }

  /** Small dust puff + a few chips at a hit point. `power` ~0.3 (fists) .. 1.5 (jackhammer). */
  hit(point: THREE.Vector3, power: number): void {
    const puffs = Math.round(2 + power * 2);
    for (let i = 0; i < puffs; i++) {
      this.vel.set((Math.random() - 0.5) * 1.6, 0.3 + Math.random() * 0.9, 0.5 + Math.random() * 1.3);
      this.v.copy(point);
      this.v.z = Math.max(this.v.z, 0.05);
      this.dust.spawn(this.v, this.vel, 0.22 + Math.random() * 0.2 + power * 0.1, 0.45 + Math.random() * 0.25);
    }
    const chips = Math.round(2 + power * 3);
    for (let i = 0; i < chips; i++) {
      this.vel.set((Math.random() - 0.5) * 4, 1 + Math.random() * 3, 1.5 + Math.random() * 3);
      this.v.copy(point);
      this.v.z = Math.max(this.v.z, 0.05);
      this.debris.spawn(this.v, this.vel, 0.06 + Math.random() * 0.08, 0.5 + Math.random() * 0.3);
    }
  }

  /** Bigger burst when a chunk falls out. */
  crumble(point: THREE.Vector3): void {
    for (let i = 0; i < 6; i++) {
      this.vel.set((Math.random() - 0.5) * 2.4, 0.4 + Math.random() * 1.4, 0.4 + Math.random() * 1.8);
      this.v.set(point.x + (Math.random() - 0.5) * 0.8, Math.max(0.2, point.y + (Math.random() - 0.5) * 0.8), 0.1);
      this.dust.spawn(this.v, this.vel, 0.4 + Math.random() * 0.35, 0.6 + Math.random() * 0.4);
    }
    for (let i = 0; i < 9; i++) {
      this.vel.set((Math.random() - 0.5) * 5, 1.5 + Math.random() * 3.5, 1 + Math.random() * 4);
      this.v.set(point.x + (Math.random() - 0.5) * 0.6, Math.max(0.2, point.y + (Math.random() - 0.5) * 0.6), 0.1);
      this.debris.spawn(this.v, this.vel, 0.08 + Math.random() * 0.12, 0.6 + Math.random() * 0.4);
    }
  }

  /** Mine explosion: a column of dark smoke, flying dirt and a shock ring. */
  explosion(point: THREE.Vector3): void {
    for (let i = 0; i < 26; i++) {
      this.vel.set((Math.random() - 0.5) * 5, 3 + Math.random() * 5, (Math.random() - 0.5) * 5);
      this.v.set(point.x + (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.5, point.z + (Math.random() - 0.5) * 0.6);
      this.dust.spawn(this.v, this.vel, 0.8 + Math.random() * 0.9, 0.9 + Math.random() * 0.8);
    }
    for (let i = 0; i < 40; i++) {
      this.vel.set((Math.random() - 0.5) * 11, 4 + Math.random() * 8, (Math.random() - 0.5) * 11);
      this.v.set(point.x, 0.3, point.z);
      this.debris.spawn(this.v, this.vel, 0.08 + Math.random() * 0.16, 0.9 + Math.random() * 0.6);
    }
    this.lastRing = -1;
    this.noiseRing(point.x, point.z, 7);
  }

  /** Expanding ring on the ground that shows how far a punch was heard. */
  noiseRing(x: number, z: number, radius: number): void {
    if (this.clock - this.lastRing < 0.3) return; // the jackhammer would spam them
    this.lastRing = this.clock;
    const mesh = new THREE.Mesh(
      this.ringGeo,
      new THREE.MeshBasicMaterial({ color: 0x121212, transparent: true, opacity: 0.4, depthWrite: false, fog: false }),
    );
    mesh.position.set(x, 0.05, z);
    mesh.renderOrder = 3;
    mesh.scale.setScalar(0.3);
    this.group.add(mesh);
    this.rings.push({ mesh, age: 0, life: 0.45, radius });
  }

  /** Floating text at a world position: "-15", "+25"... `kind` picks the CSS style. */
  popText(text: string, world: THREE.Vector3, kind: 'dmg' | 'coin' | 'big'): void {
    this.v.copy(world).project(this.camera);
    if (this.v.z > 1) return;
    const el = document.createElement('div');
    el.className = `pop pop-${kind}`;
    el.textContent = text;
    el.style.left = `${(this.v.x * 0.5 + 0.5) * 100}%`;
    el.style.top = `${(-this.v.y * 0.5 + 0.5) * 100}%`;
    el.style.setProperty('--drift', `${(Math.random() - 0.5) * 2.4}rem`);
    el.addEventListener('animationend', () => el.remove(), { once: true });
    this.layer.appendChild(el);
  }

  /** Haptic feedback for one hit. */
  haptic(kind: HapticKind): void {
    if (!this.vibrationOn) return;
    switch (kind) {
      case 'light':
        void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
        break;
      case 'medium':
        void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
        break;
      case 'heavy':
        void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
        break;
      case 'continuous':
        // Hits arrive every ~165 ms; overlapping buzzes feel continuous.
        void Haptics.vibrate({ duration: 150 }).catch(() => {});
        break;
    }
  }

  /** One longer buzz (caught, wall down). */
  buzz(ms: number): void {
    if (!this.vibrationOn) return;
    void Haptics.vibrate({ duration: ms }).catch(() => {});
  }

  update(dt: number): void {
    this.clock += dt;
    this.dust.update(dt);
    this.debris.update(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      const k = Math.min(1, r.age / r.life);
      const e = 1 - (1 - k) * (1 - k);
      r.mesh.scale.setScalar(0.3 + (r.radius - 0.3) * e);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - k);
      if (k >= 1) {
        this.group.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }
  }

  /** Remove everything that is still on screen (level change). */
  clear(): void {
    for (const r of this.rings) {
      this.group.remove(r.mesh);
      (r.mesh.material as THREE.Material).dispose();
    }
    this.rings.length = 0;
    this.layer.replaceChildren();
  }
}
