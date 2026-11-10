import { TUNING } from '../config/tuning';
import type { ToolDef } from '../config/tools';
import type { Assets } from './Assets';
import { angleDelta, distanceToCollider, resolveCircle } from './Collision';
import type { Collider } from './Collision';
import { FloatingBody, PLAYER_STYLE } from './FloatingBody';
import { ToolHolder, applyPose, carryPose, samplePunch } from './Tools';
import type { PunchPose } from './Tools';

/** What the player needs to know about the level each frame. */
export interface PlayerWorld {
  colliders: Collider[];
  halfWidth: number;
  depth: number;
  /** X of the breakable wall segment. */
  targetX: number;
  /** Half width of that segment (m). */
  targetHalfWidth: number;
}

export interface PlayerInput {
  moveX: number;
  moveY: number;
  punchHeld: boolean;
}

export class Player {
  readonly body: FloatingBody;
  x = 0;
  z = 0;
  /** Heading in radians; 0 faces +Z (away from the wall), PI faces the wall. */
  yaw = Math.PI;
  /** Current ground speed (m/s). */
  speed = 0;

  /** Crouched next to cover. */
  hidden = false;
  /** A hit cycle is running and the wall is in reach (doubles detection). */
  punching = false;
  /** Close enough to cover for HIDE. */
  canHide = false;
  /** Close enough to the breakable segment for PUNCH. */
  inPunchRange = false;
  caught = false;
  exiting = false;

  tool: ToolDef;
  /** Called at the exact moment a punch lands on the wall. */
  onHit: (tool: ToolDef) => void = () => {};
  /** Called when a punch is thrown but nothing is in reach. */
  onWhiff: () => void = () => {};

  private holder: ToolHolder;
  private cycleT = -1;
  private hitDone = false;
  private cycleInRange = false;
  private pose: PunchPose = { rx: 0, ry: 0, rz: 0, rRot: 0, lx: 0, ly: 0, lz: 0, twist: 0, lean: 0 };
  private target: PunchPose = { rx: 0, ry: 0, rz: 0, rRot: 0, lx: 0, ly: 0, lz: 0, twist: 0, lean: 0 };
  private exitStage = 0;
  private exitX = 0;

  constructor(assets: Assets, tool: ToolDef) {
    this.body = new FloatingBody(assets.instance('player'), PLAYER_STYLE);
    this.holder = new ToolHolder(assets, this.body.parts.Hand_R);
    this.tool = tool;
    this.setTool(tool);
  }

  setTool(tool: ToolDef): void {
    this.tool = tool;
    this.holder.equip(tool);
    this.cycleT = -1;
    // A hand that carries something swings less while walking.
    this.body.rightSwing = tool.twoHanded ? 0 : tool.style === 'jab' ? 1 : 0.35;
    this.body.leftSwing = tool.twoHanded ? 0 : 1;
  }

  /** Put the player back at the start of a level. */
  spawn(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.yaw = Math.PI;
    this.speed = 0;
    this.hidden = false;
    this.punching = false;
    this.caught = false;
    this.exiting = false;
    this.exitStage = 0;
    this.cycleT = -1;
    this.body.resetPose();
    const carry = carryPose(this.tool);
    Object.assign(this.pose, carry);
    applyPose(this.body, this.pose);
    this.syncBody();
    this.body.update(0, 0);
  }

  /** HIDE button: crouch / stand up. Only works next to cover. */
  toggleHide(): boolean {
    if (this.caught || this.exiting) return false;
    if (this.hidden) {
      this.hidden = false;
      return true;
    }
    if (!this.canHide) return false;
    this.hidden = true;
    this.cycleT = -1;
    this.punching = false;
    return true;
  }

  /** Caught: parts drift apart. */
  setCaught(): void {
    this.caught = true;
    this.punching = false;
    this.hidden = false;
    this.cycleT = -1;
    this.body.startScatter();
  }

  /** Wall is down: walk to the hole and through it. */
  startExit(targetX: number): void {
    this.exiting = true;
    this.hidden = false;
    this.punching = false;
    this.cycleT = -1;
    this.exitStage = 0;
    this.exitX = targetX;
  }

  update(dt: number, input: PlayerInput, world: PlayerWorld): void {
    const P = TUNING.player;
    this.body.crouchTarget = this.hidden ? 1 : 0;

    if (this.caught) {
      this.speed = 0;
      this.body.shiver = 0;
      this.body.update(dt, 0);
      return;
    }
    if (this.exiting) {
      this.updateExit(dt);
      return;
    }

    // ---- what is in reach? ----
    this.canHide = false;
    for (const c of world.colliders) {
      if (c.cover && distanceToCollider(this.x, this.z, c) < P.radius + P.hideRange) {
        this.canHide = true;
        break;
      }
    }
    this.inPunchRange =
      this.z <= P.punchRange && Math.abs(this.x - world.targetX) <= world.targetHalfWidth + P.punchSideMargin;

    // ---- move ----
    const mag = Math.hypot(input.moveX, input.moveY);
    const moving = !this.hidden && mag > P.deadZone;
    let targetYaw = this.yaw;
    if (moving) {
      // Moving always wins over punching: running away must feel instant.
      this.cycleT = -1;
      const throttle = Math.min(1, (mag - P.deadZone) / (1 - P.deadZone));
      const v = P.speed * (0.35 + 0.65 * throttle);
      const vx = (input.moveX / mag) * v;
      const vz = (-input.moveY / mag) * v; // stick up = towards the wall = -Z
      const fromX = this.x;
      const fromZ = this.z;
      const r = resolveCircle(this.x + vx * dt, this.z + vz * dt, P.radius, world.colliders);
      this.x = Math.max(-world.halfWidth + P.radius, Math.min(world.halfWidth - P.radius, r.x));
      this.z = Math.max(P.radius + 0.03, Math.min(world.depth - P.radius, r.z));
      this.speed = dt > 0 ? Math.hypot(this.x - fromX, this.z - fromZ) / dt : 0;
      targetYaw = Math.atan2(vx, vz);
    } else {
      this.speed = 0;
    }

    // ---- punch ----
    const tool = this.tool;
    const period = 1 / tool.hitsPerSec;
    const wantPunch = input.punchHeld && !this.hidden && !moving;
    if (wantPunch) {
      if (this.inPunchRange) {
        targetYaw = Math.PI; // auto-face the wall
        // Slide to the distance where this tool just reaches the concrete.
        const k = Math.min(1, dt * 9);
        this.z += (Math.max(P.radius + 0.03, tool.reach) - this.z) * k;
        const limit = world.targetHalfWidth - 0.3;
        const clampedX = Math.max(world.targetX - limit, Math.min(world.targetX + limit, this.x));
        this.x += (clampedX - this.x) * k;
      }
      if (this.cycleT < 0) {
        this.cycleT = 0;
        this.hitDone = false;
        this.cycleInRange = this.inPunchRange;
      }
    }

    if (this.cycleT >= 0) {
      this.cycleT += dt;
      if (tool.style === 'jackhammer') {
        // Continuous: one hit every period for as long as the button is held.
        if (!wantPunch) {
          this.cycleT = -1;
        } else if (this.cycleT >= period) {
          this.cycleT -= period;
          if (this.inPunchRange) this.onHit(tool);
        }
      } else {
        if (!this.hitDone && this.cycleT >= tool.windup + tool.strike) {
          this.hitDone = true;
          if (this.cycleInRange && this.inPunchRange) this.onHit(tool);
          else this.onWhiff();
        }
        if (!wantPunch && !this.hitDone && this.cycleT < tool.windup) {
          this.cycleT = -1; // released during the wind-up: cancel the swing
        } else if (this.cycleT >= period) {
          if (wantPunch) {
            this.cycleT -= period;
            this.hitDone = false;
            this.cycleInRange = this.inPunchRange;
          } else {
            this.cycleT = -1;
          }
        }
      }
    }
    this.punching = this.cycleT >= 0 && this.inPunchRange;

    // ---- pose ----
    if (this.cycleT >= 0) {
      samplePunch(tool, this.cycleT, this.pose);
    } else {
      // Ease back to the carry pose after a cancelled swing or a tool change.
      const carry = carryPose(tool);
      const k = Math.min(1, dt * 16);
      const p = this.pose;
      Object.assign(this.target, carry);
      (Object.keys(p) as (keyof PunchPose)[]).forEach((key) => {
        p[key] += (this.target[key] - p[key]) * k;
      });
    }
    applyPose(this.body, this.pose);
    this.body.shiver = tool.style === 'jackhammer' && this.cycleT >= 0 ? 1 : 0;

    this.yaw += angleDelta(this.yaw, targetYaw) * Math.min(1, dt * P.turnRate);
    this.syncBody();
    this.body.update(dt, this.speed);
  }

  private updateExit(dt: number): void {
    const speed = 3.0;
    // Stage 0: line up with the hole. Stage 1: walk through it.
    const tx = this.exitX;
    const tz = this.exitStage === 0 ? Math.max(1.0, Math.min(this.z, 1.4)) : -5.2;
    const dx = tx - this.x;
    const dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.12) {
      if (this.exitStage === 0) this.exitStage = 1;
      this.speed = this.exitStage === 1 && this.z > -5 ? speed : 0;
    } else {
      const step = Math.min(dist, speed * dt);
      this.x += (dx / dist) * step;
      this.z += (dz / dist) * step;
      this.speed = speed;
      this.yaw += angleDelta(this.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 12);
    }
    const carry = carryPose(this.tool);
    Object.assign(this.pose, carry);
    applyPose(this.body, this.pose);
    this.body.shiver = 0;
    this.syncBody();
    this.body.update(dt, this.speed);
  }

  private syncBody(): void {
    this.body.root.position.set(this.x, 0, this.z);
    this.body.root.rotation.y = this.yaw;
  }
}
