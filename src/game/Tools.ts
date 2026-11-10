import * as THREE from 'three';
import type { ToolDef } from '../config/tools';
import type { Assets } from './Assets';
import type { FloatingBody } from './FloatingBody';

/**
 * Tools - puts the equipped tool model into Hand_R and describes how each
 * punch style moves the hands.
 *
 * A pose is a set of offsets from the idle pose:
 *   r = right hand offset (m), rRot = right hand tip forward (rad)
 *   l = left hand offset (m)
 *   twist = torso twist (rad), lean = torso lean (rad)
 */
export interface PunchPose {
  rx: number;
  ry: number;
  rz: number;
  rRot: number;
  lx: number;
  ly: number;
  lz: number;
  twist: number;
  lean: number;
}

const ZERO: PunchPose = { rx: 0, ry: 0, rz: 0, rRot: 0, lx: 0, ly: 0, lz: 0, twist: 0, lean: 0 };

// ---- key poses (edit these to restyle the punches) --------------------------

/** Jab: Hand_R lunges ~0.45 m at the wall, Hand_L counter-swings. */
const JAB_HIT: PunchPose = { rx: 0.14, ry: 0.12, rz: 0.45, rRot: 0, lx: 0, ly: 0.03, lz: -0.14, twist: 0.3, lean: 0.06 };

/** One-handed hammer: cock back, then snap forward. */
const SWING_BACK: PunchPose = { rx: 0.04, ry: 0.22, rz: -0.08, rRot: -0.9, lx: 0, ly: 0, lz: 0.06, twist: -0.16, lean: -0.03 };
const SWING_HIT: PunchPose = { rx: 0.12, ry: 0.18, rz: 0.34, rRot: 1.05, lx: 0, ly: 0.02, lz: -0.12, twist: 0.3, lean: 0.1 };

/** Sledgehammer / pickaxe: big overhead arc. */
const OVER_BACK: PunchPose = { rx: 0.1, ry: 0.5, rz: -0.12, rRot: -1.15, lx: -0.04, ly: 0.1, lz: 0.05, twist: -0.2, lean: -0.1 };
const OVER_HIT: PunchPose = { rx: 0.16, ry: 0.2, rz: 0.36, rRot: 1.0, lx: 0, ly: -0.02, lz: -0.16, twist: 0.26, lean: 0.2 };

/** Jackhammer: both hands on the grips in front of the body, all the time. */
const TWO_HAND_HOLD: PunchPose = { rx: 0.19, ry: 0.06, rz: 0.31, rRot: 0, lx: -0.19, ly: 0.06, lz: 0.31, twist: 0, lean: 0.05 };

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeIn = (t: number) => t * t;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function blend(a: PunchPose, b: PunchPose, k: number, out: PunchPose): void {
  out.rx = a.rx + (b.rx - a.rx) * k;
  out.ry = a.ry + (b.ry - a.ry) * k;
  out.rz = a.rz + (b.rz - a.rz) * k;
  out.rRot = a.rRot + (b.rRot - a.rRot) * k;
  out.lx = a.lx + (b.lx - a.lx) * k;
  out.ly = a.ly + (b.ly - a.ly) * k;
  out.lz = a.lz + (b.lz - a.lz) * k;
  out.twist = a.twist + (b.twist - a.twist) * k;
  out.lean = a.lean + (b.lean - a.lean) * k;
}

/** Pose the tool is carried in when nothing is happening. */
export function carryPose(tool: ToolDef): PunchPose {
  return tool.twoHanded ? TWO_HAND_HOLD : ZERO;
}

/**
 * Pose at `t` seconds into a punch. The hit lands at t = windup + strike.
 * After windup + strike + recover the pose is back at the carry pose.
 */
export function samplePunch(tool: ToolDef, t: number, out: PunchPose): void {
  const carry = carryPose(tool);
  const { windup, strike, recover, style } = tool;

  if (style === 'jackhammer') {
    blend(carry, carry, 0, out);
    return;
  }

  const back = style === 'swing' ? SWING_BACK : OVER_BACK;
  const hit = style === 'jab' ? JAB_HIT : style === 'swing' ? SWING_HIT : OVER_HIT;

  if (style !== 'jab' && t < windup) {
    blend(carry, back, easeOut(t / windup), out);
  } else if (t < windup + strike) {
    const k = (t - windup) / strike;
    if (style === 'jab') blend(carry, hit, easeOut(k), out);
    else blend(back, hit, easeIn(k), out);
  } else if (t < windup + strike + recover) {
    blend(hit, carry, easeInOut((t - windup - strike) / recover), out);
  } else {
    blend(carry, carry, 0, out);
  }
}

/** Height (m) at which this tool meets the wall. */
export function impactHeight(tool: ToolDef): number {
  switch (tool.style) {
    case 'jab':
      return 1.14;
    case 'swing':
      return 1.42;
    case 'overhead':
      return 1.62;
    case 'jackhammer':
      return 0.74;
  }
}

/** Copy a pose onto a body. `weight` blends it in (0..1). */
export function applyPose(body: FloatingBody, pose: PunchPose, weight = 1): void {
  body.handR.pos.set(pose.rx * weight, pose.ry * weight, pose.rz * weight);
  body.handR.rotX = pose.rRot * weight;
  body.handL.pos.set(pose.lx * weight, pose.ly * weight, pose.lz * weight);
  body.twist = pose.twist * weight;
  body.leanExtra = pose.lean * weight;
}

/**
 * Holds the tool model that hangs in the player's right hand.
 * Models are created once per tool and re-used when cycling.
 */
export class ToolHolder {
  private cache = new Map<number, THREE.Object3D>();
  private current: THREE.Object3D | null = null;

  constructor(
    private assets: Assets,
    private hand: THREE.Object3D,
  ) {}

  equip(tool: ToolDef): void {
    if (this.current) this.hand.remove(this.current);
    let model = this.cache.get(tool.id);
    if (!model) {
      model = this.assets.instance(`tool${tool.id}`);
      // The grip is at the tool's origin, so it only needs the hold offset.
      model.position.set(...tool.holdPos);
      model.rotation.set(...tool.holdRot);
      this.cache.set(tool.id, model);
    }
    this.hand.add(model);
    this.current = model;
  }
}
