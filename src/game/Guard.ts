import * as THREE from 'three';
import { COLORS, DEG, TUNING } from '../config/tuning';
import type { GuardDef, Vec2 } from '../config/levels';
import type { Assets } from './Assets';
import { angleDelta, resolveCircle, turnTowards } from './Collision';
import type { Collider } from './Collision';
import { DetectionMeter, VisionCone } from './Detection';
import type { AlertState, Target } from './Detection';
import { DOG_PARTS, DOG_STYLE, FloatingBody, GUARD_STYLE } from './FloatingBody';

/**
 * Guard - patrols a waypoint loop with a flashlight cone.
 *
 * Behaviour, in priority order:
 *   1. WATCH        meter >= "suspicious": stop and turn to where the player
 *                   was last seen. At "alert" the guard also walks closer.
 *   2. INVESTIGATE  heard a punch: walk to the noise for a few seconds.
 *   3. PATROL/PAUSE walk the loop, pause 1-2 s at each waypoint and look
 *                   left and right.
 */

type Mode = 'patrol' | 'pause' | 'investigate' | 'watch' | 'chase';

// Flashlight lens position relative to the guard (from Guard.glb): the cone starts here.
const LENS_X = -0.4;
const LENS_Z = 0.27;

// "?" and "!" markers are drawn once and shared by all guards.
let iconTextures: { question: THREE.Texture; alarm: THREE.Texture } | null = null;

function makeIcon(char: string, bg: string, fg: string): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = bg;
  ctx.fillRect(10, 10, size - 20, size - 20);
  ctx.fillStyle = fg;
  ctx.font = `96px Anton, Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, size / 2, size / 2 + 6);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getIcons() {
  if (!iconTextures) {
    iconTextures = {
      question: makeIcon('?', COLORS.yellow, COLORS.ink),
      alarm: makeIcon('!', COLORS.red, COLORS.paper),
    };
  }
  return iconTextures;
}

export class Guard {
  readonly body: FloatingBody;
  readonly cone: VisionCone;
  readonly meter = new DetectionMeter();
  /** A guard dog: smells you through cover, runs faster, barks. */
  readonly isDog: boolean;
  x = 0;
  z = 0;
  yaw = 0;
  /** Where the cone starts, relative to the body (flashlight lens or the dog's nose). */
  private lensX = LENS_X;
  private lensZ = LENS_Z;

  /** Fired once each time the meter climbs into a new state. */
  onStateChange: (state: AlertState) => void = () => {};

  private path: Vec2[];
  private startIndex: number;
  private wp = 0;
  private mode: Mode = 'patrol';
  private speed: number;
  private moveSpeed = 0;
  private pauseT = 0;
  private pauseDur = 1;
  private pauseYaw = 0;
  private noiseX = 0;
  private noiseZ = 0;
  private investigateT = 0;
  private lastSeenX = 0;
  private lastSeenZ = 0;
  private lookT = 0;
  private stuckT = 0;
  private avoidT = 0;
  private avoidSign = 1;
  private avoidCount = 0;
  private lastState: AlertState = 'calm';
  private frozen = false;
  /** Frozen because the player was caught (shows "!"), not because the wall fell. */
  private alarmed = false;
  private icon: THREE.Sprite;
  private iconMat: THREE.SpriteMaterial;
  private iconPop = 0;

  // ---- chase ----
  /** Running after the player (meter hit 100). */
  chasing = false;
  /** Sees the player this frame. */
  seesPlayer = false;
  /** Seconds since a chaser last saw the player. */
  private lostT = 0;
  private chaseSpeed: number;
  /** Seconds left of the whistle/bark before running. */
  private chaseDelay = 0;

  constructor(
    assets: Assets,
    def: GuardDef,
    baseSpeed: number,
    private halfWidth: number,
    private depth: number,
  ) {
    this.isDog = !!def.dog;
    const D = TUNING.dog;
    if (this.isDog) {
      this.body = new FloatingBody(assets.instance('dog'), DOG_STYLE, DOG_PARTS);
      this.cone = new VisionCone(D.coneLength, D.coneHalfAngleDeg * DEG);
      this.lensX = 0;
      this.lensZ = 0.8; // the nose
    } else {
      this.body = new FloatingBody(assets.instance('guard'), GUARD_STYLE);
      // The right hand carries the flashlight: keep it steady.
      this.body.rightSwing = 0.15;
      this.cone = new VisionCone(TUNING.detection.coneLength, TUNING.detection.coneHalfAngleDeg * DEG);
    }
    this.path = def.path;
    this.startIndex = def.start ?? 0;
    this.speed = baseSpeed * (def.speedMul ?? 1) * (this.isDog ? D.speedMul : 1);
    const C = TUNING.chase;
    this.chaseSpeed = this.isDog ? D.chaseSpeed : Math.min(C.maxSpeed, this.speed * C.speedMul + C.speedAdd);

    this.iconMat = new THREE.SpriteMaterial({ map: getIcons().question, depthTest: false, toneMapped: false, fog: false });
    this.icon = new THREE.Sprite(this.iconMat);
    this.icon.position.set(0, this.isDog ? 1.75 : 2.75, 0);
    this.icon.renderOrder = 20;
    this.icon.visible = false;
    this.body.root.add(this.icon);

    this.reset();
  }

  /** Back to the first waypoint, calm. */
  reset(): void {
    this.wp = this.startIndex % this.path.length;
    const here = this.path[this.wp];
    this.x = here[0];
    this.z = here[1];
    this.wp = (this.wp + 1) % this.path.length;
    const next = this.path[this.wp];
    this.yaw = Math.atan2(next[0] - this.x, next[1] - this.z);
    this.mode = 'patrol';
    this.meter.reset();
    this.lastState = 'calm';
    this.investigateT = 0;
    this.frozen = false;
    this.alarmed = false;
    this.chasing = false;
    this.seesPlayer = false;
    this.icon.visible = false;
    this.cone.setAlert(0);
    this.body.resetPose();
    this.sync([]);
  }

  /** A punch landed at (nx, nz) and this guard is inside its noise radius. */
  hearNoise(nx: number, nz: number, seconds = TUNING.guard.investigateTime): void {
    if (this.frozen || this.chasing) return;
    this.noiseX = nx;
    this.noiseZ = nz;
    this.investigateT = Math.max(this.investigateT, seconds);
    if (this.mode !== 'watch') this.mode = 'investigate';
  }

  /** Stop everything and stare at the player (used on the Spotted screen). */
  freeze(lookX: number, lookZ: number, alarmed = true): void {
    this.frozen = true;
    this.alarmed = alarmed;
    this.chasing = false;
    this.lastSeenX = lookX;
    this.lastSeenZ = lookZ;
  }

  /** Start running after the player, from where they were last seen. */
  startChase(x: number, z: number): void {
    if (this.frozen) return;
    this.chasing = true;
    this.mode = 'chase';
    this.lastSeenX = x;
    this.lastSeenZ = z;
    this.lostT = 0;
    this.chaseDelay = TUNING.chase.windup;
    this.meter.value = 100;
    this.iconPop = 1;
    this.body.jump(3.6);
  }

  /** Lost the player: go and look around the last spot, still suspicious. */
  private giveUp(): void {
    this.chasing = false;
    this.meter.value = TUNING.chase.meterAfter;
    this.lastState = this.meter.state;
    this.noiseX = this.lastSeenX;
    this.noiseZ = this.lastSeenZ;
    this.investigateT = 3;
    this.mode = 'investigate';
  }

  /** Distance to a point. */
  distanceTo(x: number, z: number): number {
    return Math.hypot(this.x - x, this.z - z);
  }

  get investigating(): boolean {
    return this.mode === 'investigate';
  }

  /**
   * @param target the player, or null when detection is off (main menu)
   */
  update(dt: number, target: Target | null, colliders: Collider[]): void {
    const G = TUNING.guard;
    this.moveSpeed = 0;

    if (this.frozen) {
      this.yaw = turnTowards(this.yaw, Math.atan2(this.lastSeenX - this.x, this.lastSeenZ - this.z), G.turnRate * 2 * dt);
      this.finish(dt, colliders);
      return;
    }

    // ---- 1. look ----
    this.seesPlayer = false;
    if (target) {
      let seen = this.cone.sees(target, colliders, this.x, this.z);
      let fillMul = 1;
      if (this.isDog && seen < 0 && target.z > 0) {
        // The dog smells you nearby, through cover and even when hidden.
        const d = Math.hypot(target.x - this.x, target.z - this.z);
        if (d < TUNING.dog.smell) {
          seen = d / TUNING.dog.coneLength;
          fillMul = TUNING.dog.smellFill;
        }
      }
      this.seesPlayer = seen >= 0;
      if (this.chasing) {
        // While chasing the meter stays full; the countdown lives in Game.
        this.meter.value = 100;
      } else {
        this.meter.update(dt, seen, target.punching, target.stealth * fillMul);
      }
      if (seen >= 0) {
        this.lastSeenX = target.x;
        this.lastSeenZ = target.z;
      }
    }

    // ---- chase: run at the last place the player was seen ----
    if (this.chasing) {
      this.lostT = this.seesPlayer ? 0 : this.lostT + dt;
      const dx = this.lastSeenX - this.x;
      const dz = this.lastSeenZ - this.z;
      if (this.chaseDelay > 0) {
        // Whistle / bark first: turn to face the player, do not run yet.
        this.chaseDelay -= dt;
        this.yaw = turnTowards(this.yaw, Math.atan2(dx, dz), G.turnRate * 3 * dt);
      } else if (Math.hypot(dx, dz) > 0.6) {
        this.walkTo(this.lastSeenX, this.lastSeenZ, this.chaseSpeed, dt, colliders, G.turnRate * 2.6);
      } else {
        // At the spot and nobody there: look around quickly.
        this.lookT += dt;
        this.yaw += Math.sin(this.lookT * 3.2) * 2.4 * dt;
      }
      if (this.lostT > TUNING.chase.giveUpTime) this.giveUp();
      this.finish(dt, colliders);
      return;
    }
    const state = this.meter.state;
    if (state !== this.lastState) {
      const rising = (state === 'suspicious' && this.lastState === 'calm') || state === 'alert';
      if (rising) {
        this.onStateChange(state);
        this.iconPop = 1;
        // Surprised little jump ("?") or a big startled one ("!").
        this.body.jump(state === 'alert' ? 3.4 : 1.8);
      }
      this.lastState = state;
    }

    // ---- 2. decide ----
    if (state !== 'calm') {
      this.mode = 'watch';
    } else if (this.mode === 'watch') {
      this.mode = this.investigateT > 0 ? 'investigate' : 'patrol';
    }

    // ---- 3. act ----
    switch (this.mode) {
      case 'watch': {
        const dx = this.lastSeenX - this.x;
        const dz = this.lastSeenZ - this.z;
        const dist = Math.hypot(dx, dz);
        if (state === 'alert' && dist > G.alertStopDist) {
          this.walkTo(this.lastSeenX, this.lastSeenZ, this.speed * G.alertSpeed, dt, colliders, G.turnRate * 1.5);
        } else {
          this.yaw = turnTowards(this.yaw, Math.atan2(dx, dz), G.turnRate * 1.5 * dt);
        }
        break;
      }
      case 'investigate': {
        this.investigateT -= dt;
        const dx = this.noiseX - this.x;
        const dz = this.noiseZ - this.z;
        if (Math.hypot(dx, dz) > G.investigateStopDist) {
          this.walkTo(this.noiseX, this.noiseZ, this.speed * G.investigateSpeed, dt, colliders, G.turnRate);
        } else {
          // Arrived: sweep the flashlight over the spot.
          this.lookT += dt;
          const sweep = Math.sin(this.lookT * 2.4) * 0.6;
          this.yaw = turnTowards(this.yaw, Math.atan2(dx, dz) + sweep, G.turnRate * dt);
        }
        if (this.investigateT <= 0) this.mode = 'patrol';
        break;
      }
      case 'pause': {
        this.pauseT += dt;
        // Look left, then right, then straight again over the pause.
        const sweep = Math.sin((this.pauseT / this.pauseDur) * Math.PI * 2) * G.lookAngleDeg * DEG;
        this.yaw = turnTowards(this.yaw, this.pauseYaw + sweep, G.turnRate * dt);
        if (this.pauseT >= this.pauseDur) {
          this.wp = (this.wp + 1) % this.path.length;
          this.mode = 'patrol';
        }
        break;
      }
      case 'patrol': {
        const goal = this.path[this.wp];
        const left = this.walkTo(goal[0], goal[1], this.speed, dt, colliders, G.turnRate);
        // A waypoint that cannot be reached (blocked by a prop) is skipped after a few tries.
        if (left < 0.12 || this.avoidCount >= 4) {
          this.avoidCount = 0;
          this.mode = 'pause';
          this.pauseT = 0;
          this.pauseDur = G.pauseMin + Math.random() * (G.pauseMax - G.pauseMin);
          this.pauseYaw = this.yaw;
        }
        break;
      }
    }

    this.finish(dt, colliders);
  }

  /** Walk towards a point; returns the distance that is left. */
  private walkTo(tx: number, tz: number, speed: number, dt: number, colliders: Collider[], turnRate: number): number {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-3) return 0;
    let desired = Math.atan2(dx, dz);
    if (this.avoidT > 0) {
      // Stuck on a prop a moment ago: steer around it.
      this.avoidT -= dt;
      desired += this.avoidSign * 1.25;
    }
    this.yaw = turnTowards(this.yaw, desired, turnRate * dt);
    // Only step forward once roughly facing the goal (looks less like sliding).
    if (Math.abs(angleDelta(this.yaw, desired)) < 0.7) {
      const step = Math.min(dist, speed * dt);
      const r = resolveCircle(this.x + Math.sin(this.yaw) * step, this.z + Math.cos(this.yaw) * step, TUNING.guard.radius, colliders);
      const nx = Math.max(-this.halfWidth + 0.4, Math.min(this.halfWidth - 0.4, r.x));
      const nz = Math.max(0.55, Math.min(this.depth - 0.4, r.z));
      const moved = Math.hypot(nx - this.x, nz - this.z);
      this.x = nx;
      this.z = nz;
      this.moveSpeed = dt > 0 ? moved / dt : 0;
      if (moved < step * 0.35) {
        this.stuckT += dt;
        if (this.stuckT > 0.25) {
          this.stuckT = 0;
          this.avoidT = 0.8;
          this.avoidCount++;
          this.avoidSign = Math.random() < 0.5 ? -1 : 1;
        }
      } else {
        this.stuckT = 0;
      }
    }
    return dist;
  }

  private finish(dt: number, colliders: Collider[]): void {
    this.sync(colliders);
    this.body.update(dt, this.moveSpeed);

    // "?" over suspicious (or while checking a noise), "!" over alert.
    const state = this.meter.state;
    const icons = getIcons();
    const show = this.frozen ? this.alarmed : this.chasing || state !== 'calm' || this.mode === 'investigate';
    this.icon.visible = show;
    if (show) {
      const alarm = state === 'alert' || this.alarmed || this.chasing;
      const map = alarm ? icons.alarm : icons.question;
      if (this.iconMat.map !== map) {
        this.iconMat.map = map;
        this.iconMat.needsUpdate = true;
      }
      this.iconPop = Math.max(0, this.iconPop - dt * 4);
      const s = 0.95 * (1 + this.iconPop * 0.5);
      this.icon.scale.set(s, s, 1);
    }
    this.cone.setAlert(this.alarmed || this.chasing ? 1 : this.frozen ? 0 : this.meter.heat);
  }

  /** Copy position/heading to the model and rebuild the flashlight cone. */
  private sync(colliders: Collider[]): void {
    this.body.root.position.set(this.x, 0, this.z);
    this.body.root.rotation.y = this.yaw;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const lx = this.x + this.lensX * cos + this.lensZ * sin;
    const lz = this.z - this.lensX * sin + this.lensZ * cos;
    this.cone.update(lx, lz, this.yaw, colliders);
  }

  dispose(): void {
    this.cone.dispose();
    this.iconMat.dispose();
  }
}

/**
 * Searchlight - the watchtower beam (levels 5+). It swings back and forth on
 * a fixed timer and uses the same cone + meter rules as a flashlight.
 */
export class Searchlight {
  readonly cone: VisionCone;
  /** The beam is on the player this frame. */
  seesPlayer = false;
  readonly meter = new DetectionMeter();
  onStateChange: (state: AlertState) => void = () => {};
  private t = 0;
  private lastState: AlertState = 'calm';
  private mid: number;
  private amp: number;

  constructor(
    private head: THREE.Object3D | null,
    readonly x: number,
    readonly z: number,
    fromDeg: number,
    toDeg: number,
    private period: number,
    length: number,
    halfAngleDeg: number,
    private fillMul: number,
  ) {
    this.cone = new VisionCone(length, halfAngleDeg * DEG, TUNING.detection.coneOpacity * 0.85);
    this.mid = ((fromDeg + toDeg) / 2) * DEG;
    this.amp = (Math.abs(toDeg - fromDeg) / 2) * DEG;
  }

  reset(): void {
    this.t = 0;
    this.meter.reset();
    this.lastState = 'calm';
    this.cone.setAlert(0);
  }

  update(dt: number, target: Target | null, colliders: Collider[], frozen: boolean): void {
    if (!frozen) this.t += dt;
    this.seesPlayer = false;
    const yaw = this.mid + Math.sin((this.t / this.period) * Math.PI * 2) * this.amp;
    this.cone.update(this.x, this.z, yaw, colliders);
    if (this.head) this.head.rotation.y = yaw;

    if (target && !frozen) {
      // A hidden player is never revealed by the far-away tower.
      const seen = this.cone.sees(target, colliders, 1e6, 1e6);
      this.seesPlayer = seen >= 0;
      this.meter.update(dt, seen, target.punching, this.fillMul * target.stealth);
      const state = this.meter.state;
      if (state !== this.lastState) {
        const rising = (state === 'suspicious' && this.lastState === 'calm') || state === 'alert';
        if (rising) this.onStateChange(state);
        this.lastState = state;
      }
    }
    this.cone.setAlert(this.meter.heat);
  }

  dispose(): void {
    this.cone.dispose();
  }
}
