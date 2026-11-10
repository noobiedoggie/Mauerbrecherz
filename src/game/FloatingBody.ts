import * as THREE from 'three';

/**
 * FloatingBody - procedural animation for the six-part characters.
 *
 * There is no skeleton. Each part (Head, Torso, Hand_L, Hand_R, Foot_L,
 * Foot_R) is a separate node whose pivot is its own centre; every frame the
 * part's position/rotation is rebuilt from its rest pose plus a few sine
 * waves. Player and guards share this class and differ only in `BodyStyle`.
 */

export type PartName = 'Head' | 'Torso' | 'Hand_L' | 'Hand_R' | 'Foot_L' | 'Foot_R';
export const PART_NAMES: PartName[] = ['Head', 'Torso', 'Hand_L', 'Hand_R', 'Foot_L', 'Foot_R'];

/** All the feel numbers of a walk. Tweak these to change how a character moves. */
export interface BodyStyle {
  /** Idle bob height (m) and speed (rad/s). */
  bob: number;
  bobSpeed: number;
  /** Extra idle drift of the hands (m). */
  handFloat: number;
  /** Foot swing forward/back (m) and lift (m). */
  stride: number;
  stepHeight: number;
  /** Hand swing forward/back (m). */
  armSwing: number;
  /** Torso lean into the walk (radians). */
  lean: number;
  /** Walk-cycle radians per metre travelled (higher = quicker little steps). */
  cadence: number;
}

export const PLAYER_STYLE: BodyStyle = {
  bob: 0.022,
  bobSpeed: 2.4,
  handFloat: 0.025,
  stride: 0.24,
  stepHeight: 0.13,
  armSwing: 0.2,
  lean: 0.16,
  cadence: 4.6,
};

/** Guards: same system, slower and stiffer. */
export const GUARD_STYLE: BodyStyle = {
  bob: 0.012,
  bobSpeed: 1.8,
  handFloat: 0.008,
  stride: 0.17,
  stepHeight: 0.07,
  armSwing: 0.09,
  lean: 0.04,
  cadence: 4.3,
};

/** Additive pose an owner (Player) can push onto a hand each frame. */
export interface HandPose {
  pos: THREE.Vector3;
  /** Rotation around X (radians): positive tips the hand - and a held tool - forward. */
  rotX: number;
}

const CENTER = new THREE.Vector3(0, 1.0, 0);

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export class FloatingBody {
  /** Move / rotate this to place the character. */
  readonly root = new THREE.Group();
  readonly parts = {} as Record<PartName, THREE.Object3D>;
  private rest = {} as Record<PartName, THREE.Vector3>;
  private scatterDir = {} as Record<PartName, THREE.Vector3>;
  private phase = {} as Record<PartName, number>;

  private time = Math.random() * 10;
  private walkPhase = 0;
  private moveBlend = 0;

  /** 0 = standing, 1 = fully crouched. Eases towards `crouchTarget`. */
  crouch = 0;
  crouchTarget = 0;

  /** "Caught" pose: parts drift apart. */
  private scatterTime = -1;
  private scatter = 0;

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

  constructor(
    model: THREE.Object3D,
    private style: BodyStyle,
  ) {
    this.root.add(model);
    model.updateMatrixWorld(true);

    PART_NAMES.forEach((name, i) => {
      const part = model.getObjectByName(name);
      if (!part) throw new Error(`Character is missing part "${name}"`);
      this.parts[name] = part;
      this.rest[name] = part.position.clone();
      this.phase[name] = i * 1.37;
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

  /** Start the "caught" pose (parts separate outward). */
  startScatter(): void {
    if (this.scatterTime < 0) this.scatterTime = 0;
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
    this.handR.pos.set(0, 0, 0);
    this.handL.pos.set(0, 0, 0);
    this.handR.rotX = 0;
    this.handL.rotX = 0;
  }

  /**
   * @param speed current ground speed in m/s (drives the walk cycle)
   */
  update(dt: number, speed: number): void {
    const s = this.style;
    this.time += dt;
    this.walkPhase += speed * s.cadence * dt;
    this.moveBlend += ((speed > 0.08 ? 1 : 0) - this.moveBlend) * Math.min(1, dt * 10);
    this.crouch += (this.crouchTarget - this.crouch) * Math.min(1, dt * 14);
    if (this.scatterTime >= 0) {
      this.scatterTime += dt;
      this.scatter = easeOutBack(Math.min(1, this.scatterTime / 0.45));
    }

    const m = this.moveBlend;
    const c = this.crouch;
    const sw = Math.sin(this.walkPhase);
    const cw = Math.cos(this.walkPhase);
    const t = this.time;
    const idle = 1 - 0.6 * m;
    const bob = (name: PartName, amp = 1) => Math.sin(t * s.bobSpeed + this.phase[name]) * s.bob * amp * idle;

    // ---- Head ----
    let p = this.parts.Head;
    p.position.copy(this.rest.Head);
    p.position.y += bob('Head') + Math.abs(sw) * 0.02 * m - 0.77 * c;
    p.position.z += 0.05 * m + 0.06 * c + this.leanExtra * 0.5;
    p.rotation.set(s.lean * 0.5 * m + this.leanExtra * 0.6, this.twist * 0.4, 0);

    // ---- Torso ----
    p = this.parts.Torso;
    p.position.copy(this.rest.Torso);
    p.position.y += bob('Torso', 0.8) + Math.abs(cw) * 0.015 * m - 0.6 * c;
    p.position.z += this.leanExtra * 0.2;
    p.rotation.set(s.lean * m + this.leanExtra, this.twist, sw * 0.04 * m);
    p.scale.set(1 + 0.14 * c, 1 - 0.3 * c, 1 + 0.14 * c);

    // ---- Feet: alternate forward/back and up/down ----
    p = this.parts.Foot_L;
    p.position.copy(this.rest.Foot_L);
    const liftL = Math.max(0, cw) * s.stepHeight * m;
    p.position.z += sw * s.stride * m;
    p.position.y += liftL + bob('Foot_L', 0.25) * (1 - m);
    p.position.x += 0.05 * c;
    p.rotation.set(-liftL * 2.2, 0, 0);

    p = this.parts.Foot_R;
    p.position.copy(this.rest.Foot_R);
    const liftR = Math.max(0, -cw) * s.stepHeight * m;
    p.position.z += -sw * s.stride * m;
    p.position.y += liftR + bob('Foot_R', 0.25) * (1 - m);
    p.position.x -= 0.05 * c;
    p.rotation.set(-liftR * 2.2, 0, 0);

    // ---- Hands: float when idle, swing opposite to the feet when walking ----
    p = this.parts.Hand_L;
    p.position.copy(this.rest.Hand_L);
    p.position.x += Math.cos(t * 0.9 + this.phase.Hand_L) * s.handFloat * 0.6 * idle - 0.1 * c;
    p.position.y += bob('Hand_L', 1.3) + Math.sin(t * 1.3 + 1.1) * s.handFloat * idle - 0.55 * c;
    p.position.z += -sw * s.armSwing * m * this.leftSwing + 0.1 * c;
    p.position.add(this.handL.pos);
    p.rotation.set(this.handL.rotX, 0, 0);

    p = this.parts.Hand_R;
    p.position.copy(this.rest.Hand_R);
    p.position.x += Math.cos(t * 0.9 + this.phase.Hand_R) * s.handFloat * 0.6 * idle + 0.1 * c;
    p.position.y += bob('Hand_R', 1.3) + Math.sin(t * 1.3 + 2.9) * s.handFloat * idle - 0.55 * c;
    p.position.z += sw * s.armSwing * m * this.rightSwing + 0.1 * c;
    p.position.add(this.handR.pos);
    p.rotation.set(this.handR.rotX, 0, 0);

    // ---- Jackhammer vibration ----
    if (this.shiver > 0.001) {
      const j = this.shiver * 0.014;
      for (const name of PART_NAMES) {
        if (name === 'Foot_L' || name === 'Foot_R') continue;
        const part = this.parts[name];
        part.position.x += (Math.random() - 0.5) * j;
        part.position.y += (Math.random() - 0.5) * j * 1.6;
        part.position.z += (Math.random() - 0.5) * j;
      }
    }

    // ---- Caught: the parts separate outward a little ----
    if (this.scatter > 0) {
      for (const name of PART_NAMES) {
        const part = this.parts[name];
        const d = this.scatterDir[name];
        part.position.addScaledVector(d, 0.34 * this.scatter);
        part.rotation.z += d.x * 0.6 * this.scatter;
        part.rotation.x += d.z * 0.5 * this.scatter;
      }
    }
  }
}
