import * as THREE from 'three';

/**
 * FloatingBody - procedural "jumpy" animation for the six-part characters.
 *
 * There is no skeleton. Each part (Head, Torso, Hand_L, Hand_R, Foot_L,
 * Foot_R) is a separate node whose pivot is its own centre.
 *
 * The style is bouncy and cartoony:
 *   - The whole body HOPS: walking is a chain of little jumps, idling is a
 *     gentle bounce on the spot.
 *   - Squash and stretch: the body stretches while rising and squashes when
 *     it lands.
 *   - Every part follows its target through a damped SPRING, so the head and
 *     hands lag behind and wobble a little after each landing.
 *   - `jump()` throws the body up for an extra hop (punch, startle, caught).
 *
 * Player and guards share this class and differ only in `BodyStyle`.
 */

export type PartName = 'Head' | 'Torso' | 'Hand_L' | 'Hand_R' | 'Foot_L' | 'Foot_R';
export const PART_NAMES: PartName[] = ['Head', 'Torso', 'Hand_L', 'Hand_R', 'Foot_L', 'Foot_R'];

/** All the feel numbers. Tweak these to change how a character moves. */
export interface BodyStyle {
  /** Height of one walking hop (m). */
  hopHeight: number;
  /** Walk-cycle radians per metre travelled (one hop = PI). Higher = more, smaller hops. */
  cadence: number;
  /** Idle bounce height (m) and bounces per second. */
  idleHop: number;
  idleRate: number;
  /** Foot scissor forward/back per hop (m) and how high feet tuck up mid-air (m). */
  stride: number;
  tuck: number;
  /** Hand swing forward/back (m). */
  armSwing: number;
  /** Torso lean into the walk (radians). */
  lean: number;
  /** Squash on landing (0.2 = 20 % shorter) and stretch while rising. */
  squash: number;
  stretch: number;
  /** Spring stiffness for each group of parts (higher = stiffer, less wobble). */
  springHead: number;
  springHands: number;
  springBody: number;
  /** Spring damping ratio (1 = no overshoot, lower = more wobble). */
  damping: number;
}

export const PLAYER_STYLE: BodyStyle = {
  hopHeight: 0.2,
  cadence: 2.9, // ~3.2 hops per second at full speed
  idleHop: 0.035,
  idleRate: 1.7,
  stride: 0.2,
  tuck: 0.1,
  armSwing: 0.2,
  lean: 0.2,
  squash: 0.2,
  stretch: 0.12,
  springHead: 170,
  springHands: 320,
  springBody: 520,
  damping: 0.42,
};

/** Guards: same system, heavier, a stiff little march. */
export const GUARD_STYLE: BodyStyle = {
  hopHeight: 0.11,
  cadence: 3.6,
  idleHop: 0.018,
  idleRate: 1.1,
  stride: 0.13,
  tuck: 0.05,
  armSwing: 0.1,
  lean: 0.06,
  squash: 0.13,
  stretch: 0.06,
  springHead: 260,
  springHands: 420,
  springBody: 650,
  damping: 0.5,
};

/** Additive pose an owner (Player) can push onto a hand each frame. */
export interface HandPose {
  pos: THREE.Vector3;
  /** Rotation around X (radians): positive tips the hand - and a held tool - forward. */
  rotX: number;
}

interface Spring {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  k: number;
}

const CENTER = new THREE.Vector3(0, 1.0, 0);
const STEP = 1 / 120; // spring sub-step (s)
const GRAVITY = 22; // for extra jumps (m/s^2), a bit floaty on purpose

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export class FloatingBody {
  /** Move / rotate this to place the character. */
  readonly root = new THREE.Group();
  /** Hops and squash/stretch happen on this inner group (pivot on the ground). */
  private readonly bounce = new THREE.Group();
  readonly parts = {} as Record<PartName, THREE.Object3D>;
  private rest = {} as Record<PartName, THREE.Vector3>;
  private scatterDir = {} as Record<PartName, THREE.Vector3>;
  private springs = {} as Record<PartName, Spring>;
  private target = new THREE.Vector3();

  private time = Math.random() * 10;
  private phase = Math.random() * Math.PI;
  private moveBlend = 0;
  private lastHopSin = 0;
  /** Squash/stretch spring: 0 = neutral, >0 stretched, <0 squashed. */
  private squashV = 0;
  private squashVel = 0;
  /** Extra jump on top of the hop cycle. */
  private jumpY = 0;
  private jumpVel = 0;

  /** 0 = standing, 1 = fully crouched. Eases towards `crouchTarget`. */
  crouch = 0;
  crouchTarget = 0;

  /** "Caught" pose: parts drift apart. */
  private scatterTime = -1;
  private scatter = 0;

  /** Called every time the feet touch the ground (footstep sounds). `strength` 0..1. */
  onLand: (strength: number) => void = () => {};

  // ---- inputs the owner sets before calling update() ----------------------
  readonly handR: HandPose = { pos: new THREE.Vector3(), rotX: 0 };
  readonly handL: HandPose = { pos: new THREE.Vector3(), rotX: 0 };
  /** Torso twist (radians, positive = right shoulder forward). */
  twist = 0;
  /** Extra torso lean (radians, positive = forward). */
  leanExtra = 0;
  /** 0..1 rapid vibration (jackhammer). */
  shiver = 0;
  /** Scale the walk swing of each hand (a hand holding something swings less). */
  rightSwing = 1;
  leftSwing = 1;
  /** Head turn (radians) - guards look around with it. */
  headYaw = 0;

  constructor(
    model: THREE.Object3D,
    private style: BodyStyle,
  ) {
    this.root.add(this.bounce);
    this.bounce.add(model);
    model.updateMatrixWorld(true);

    PART_NAMES.forEach((name) => {
      const part = model.getObjectByName(name);
      if (!part) throw new Error(`Character is missing part "${name}"`);
      this.parts[name] = part;
      this.rest[name] = part.position.clone();
      const k =
        name === 'Head' ? style.springHead : name === 'Hand_L' || name === 'Hand_R' ? style.springHands : style.springBody;
      this.springs[name] = { pos: part.position.clone(), vel: new THREE.Vector3(), k };
      // Direction a part flies in when the character is caught.
      const dir = part.position.clone().sub(CENTER);
      if (name === 'Foot_L' || name === 'Foot_R') dir.set(Math.sign(dir.x), 0.15, 0.1);
      if (name === 'Torso') dir.set(0, 0.2, 0);
      this.scatterDir[name] = dir.normalize();
    });

    // Outfit pieces are named <Part>_<Item>: hang each one under its part so
    // it follows that part (Head_Cap under Head, Hand_R_Flashlight under Hand_R...).
    for (const child of [...model.children]) {
      const owner = PART_NAMES.find((p) => child.name !== p && child.name.startsWith(`${p}_`));
      if (owner) this.parts[owner].attach(child);
    }
  }

  /** Throw the body up. `speed` in m/s: 1.5 = little hop, 4 = big surprised jump. */
  jump(speed: number): void {
    if (this.jumpY <= 0.02) this.jumpVel = Math.max(this.jumpVel, speed);
    else this.jumpVel += speed * 0.4;
  }

  /** Instant squash (negative) or stretch (positive) kick, e.g. on a punch. */
  kick(amount: number): void {
    this.squashVel += amount;
  }

  /** Start the "caught" pose (parts separate outward). */
  startScatter(): void {
    if (this.scatterTime < 0) {
      this.scatterTime = 0;
      this.jump(3.2);
    }
  }

  resetPose(): void {
    this.scatterTime = -1;
    this.scatter = 0;
    this.crouch = 0;
    this.crouchTarget = 0;
    this.moveBlend = 0;
    this.twist = 0;
    this.leanExtra = 0;
    this.shiver = 0;
    this.headYaw = 0;
    this.squashV = 0;
    this.squashVel = 0;
    this.jumpY = 0;
    this.jumpVel = 0;
    this.handR.pos.set(0, 0, 0);
    this.handL.pos.set(0, 0, 0);
    this.handR.rotX = 0;
    this.handL.rotX = 0;
    for (const name of PART_NAMES) {
      this.springs[name].pos.copy(this.rest[name]);
      this.springs[name].vel.set(0, 0, 0);
    }
  }

  /**
   * @param speed current ground speed in m/s (drives the hop cycle)
   */
  update(dt: number, speed: number): void {
    const s = this.style;
    this.time += dt;
    this.moveBlend += ((speed > 0.08 ? 1 : 0) - this.moveBlend) * Math.min(1, dt * 9);
    this.crouch += (this.crouchTarget - this.crouch) * Math.min(1, dt * 16);
    if (this.scatterTime >= 0) {
      this.scatterTime += dt;
      this.scatter = easeOutBack(Math.min(1, this.scatterTime / 0.45));
    }
    const m = this.moveBlend;
    const c = this.crouch;
    const still = this.scatterTime >= 0 ? 0 : 1;

    // ---- the hop cycle: one hop every PI of phase ----
    const idleRate = Math.PI * s.idleRate;
    this.phase += (speed * s.cadence * m + idleRate * (1 - m) * (1 - c)) * dt;
    const hopSin = Math.sin(this.phase);
    const hop = Math.abs(hopSin); // 0 on the ground, 1 at the top
    const hopH = (s.idleHop + (s.hopHeight - s.idleHop) * m) * (1 - c) * still;
    // Landing = the sine crosses zero.
    if (hopSin * this.lastHopSin < 0 && hopH > 0.012) {
      const strength = Math.min(1, hopH / s.hopHeight);
      this.squashVel -= s.squash * 9 * strength; // squash impulse
      if (m > 0.4) this.onLand(strength);
    }
    this.lastHopSin = hopSin;
    // Rising (|sin| growing) stretches, falling relaxes.
    const rising = Math.cos(this.phase) * Math.sign(hopSin);
    const stretchTarget = s.stretch * rising * (hopH / Math.max(0.001, s.hopHeight)) * 0.8;

    // ---- extra jumps (ballistic) ----
    if (this.jumpY > 0 || this.jumpVel > 0) {
      this.jumpVel -= GRAVITY * dt;
      this.jumpY += this.jumpVel * dt;
      if (this.jumpY <= 0) {
        this.squashVel -= Math.min(2.4, -this.jumpVel * 0.5) * s.squash * 4;
        this.onLand(Math.min(1, -this.jumpVel / 4));
        this.jumpY = 0;
        this.jumpVel = 0;
      }
    }

    // ---- squash/stretch spring ----
    const kS = 260;
    const cS = 2 * Math.sqrt(kS) * 0.35;
    this.squashVel += ((stretchTarget - this.squashV) * kS - this.squashVel * cS) * dt;
    this.squashV += this.squashVel * dt;
    const sq = Math.max(-0.35, Math.min(0.3, this.squashV));
    const jumpStretch = Math.max(-0.1, Math.min(0.14, this.jumpVel * 0.03));
    const sy = 1 + sq + jumpStretch;
    const sxz = 1 / Math.sqrt(Math.max(0.5, sy)); // keep the volume
    this.bounce.position.y = hop * hopH + this.jumpY;
    this.bounce.scale.set(sxz, sy, sxz);

    // ---- per-part targets ----
    const cw = Math.cos(this.phase); // +1 / -1 at each landing: feet scissor
    const air = hop * m; // 0 on the ground, 1 at the top of a walking hop
    const idle = 1 - m;
    const wob = (k: number, f: number) => Math.sin(this.time * f + k) * 0.012 * idle;

    for (const name of PART_NAMES) {
      const t = this.target.copy(this.rest[name]);
      switch (name) {
        case 'Head':
          t.y += -0.77 * c + air * 0.04 + wob(0.4, 2.2);
          t.z += 0.06 * m + 0.06 * c + this.leanExtra * 0.5;
          break;
        case 'Torso':
          t.y += -0.6 * c + wob(1.7, 1.9) * 0.5;
          t.z += this.leanExtra * 0.2 + 0.02 * m;
          break;
        case 'Foot_L':
          t.z += cw * s.stride * m;
          t.y += air * s.tuck + Math.max(0, -cw) * air * s.tuck;
          t.x += 0.05 * c;
          break;
        case 'Foot_R':
          t.z += -cw * s.stride * m;
          t.y += air * s.tuck + Math.max(0, cw) * air * s.tuck;
          t.x -= 0.05 * c;
          break;
        case 'Hand_L':
          t.x += Math.cos(this.time * 1.1 + 2) * 0.02 * idle - 0.1 * c + 0.04 * air;
          t.y += air * 0.12 + wob(2.3, 2.6) * 2 - 0.55 * c;
          t.z += -cw * s.armSwing * m * this.leftSwing + 0.1 * c;
          break;
        case 'Hand_R':
          t.x += Math.cos(this.time * 1.1 + 4) * 0.02 * idle + 0.1 * c - 0.04 * air;
          t.y += air * 0.12 + wob(4.1, 2.6) * 2 - 0.55 * c;
          t.z += cw * s.armSwing * m * this.rightSwing + 0.1 * c;
          break;
      }
      this.stepSpring(this.springs[name], t, dt);
    }

    // ---- write positions and rotations ----
    for (const name of PART_NAMES) this.parts[name].position.copy(this.springs[name].pos);
    // Punch poses are added after the springs so hits stay crisp.
    this.parts.Hand_L.position.add(this.handL.pos);
    this.parts.Hand_R.position.add(this.handR.pos);
    // Lag-driven tilt: the head nods with its own wobble.
    const headLag = this.springs.Head.vel;
    this.parts.Head.rotation.set(s.lean * 0.4 * m + this.leanExtra * 0.6 - headLag.y * 0.08, this.twist * 0.4 + this.headYaw, -headLag.x * 0.1);
    this.parts.Torso.rotation.set(s.lean * m + this.leanExtra, this.twist, Math.sin(this.phase) * 0.05 * m);
    this.parts.Torso.scale.set(1 + 0.14 * c, 1 - 0.3 * c, 1 + 0.14 * c);
    this.parts.Foot_L.rotation.set(-cw * 0.35 * m, 0, 0);
    this.parts.Foot_R.rotation.set(cw * 0.35 * m, 0, 0);
    this.parts.Hand_L.rotation.set(this.handL.rotX, 0, 0);
    this.parts.Hand_R.rotation.set(this.handR.rotX, 0, 0);

    // ---- Jackhammer vibration ----
    if (this.shiver > 0.001) {
      const j = this.shiver * 0.016;
      for (const name of PART_NAMES) {
        if (name === 'Foot_L' || name === 'Foot_R') continue;
        const part = this.parts[name];
        part.position.x += (Math.random() - 0.5) * j;
        part.position.y += (Math.random() - 0.5) * j * 1.6;
        part.position.z += (Math.random() - 0.5) * j;
      }
      this.bounce.position.y += (Math.random() - 0.5) * 0.012;
    }

    // ---- Caught: the parts separate outward a little ----
    if (this.scatter > 0) {
      for (const name of PART_NAMES) {
        const part = this.parts[name];
        const d = this.scatterDir[name];
        part.position.addScaledVector(d, 0.36 * this.scatter);
        part.rotation.z += d.x * 0.7 * this.scatter;
        part.rotation.x += d.z * 0.5 * this.scatter;
      }
    }
  }

  /** Damped spring towards `target`, in fixed sub-steps so stiff springs stay stable. */
  private stepSpring(sp: Spring, target: THREE.Vector3, dt: number): void {
    const damp = 2 * Math.sqrt(sp.k) * this.style.damping;
    let left = Math.min(dt, 0.05);
    while (left > 1e-6) {
      const h = Math.min(STEP, left);
      left -= h;
      sp.vel.x += ((target.x - sp.pos.x) * sp.k - sp.vel.x * damp) * h;
      sp.vel.y += ((target.y - sp.pos.y) * sp.k - sp.vel.y * damp) * h;
      sp.vel.z += ((target.z - sp.pos.z) * sp.k - sp.vel.z * damp) * h;
      sp.pos.addScaledVector(sp.vel, h);
    }
  }
}
