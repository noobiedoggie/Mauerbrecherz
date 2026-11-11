import * as THREE from 'three';
import { TUNING } from '../config/tuning';
import { angleDelta, hasLineOfSight, rayDistance } from './Collision';
import type { Collider } from './Collision';

/**
 * Detection - vision cones and the 0..100 detection meter.
 *
 * Guards and the watchtower searchlight both use these two classes, so the
 * rules are identical for every "eye" in the game.
 */

/** What an eye needs to know about the player this frame. */
export interface Target {
  x: number;
  z: number;
  /** Crouched next to cover. */
  hidden: boolean;
  /** Currently hitting the wall. */
  punching: boolean;
  /** Detection fill multiplier from the Shadow Suit upgrade (1 = none). */
  stealth: number;
}

const FAN_SEGMENTS = 22;

/**
 * A flat, translucent fan drawn on the ground. Each frame it is rebuilt from
 * short ray casts, so cover visibly cuts a shadow out of it - what you see
 * is exactly what the guard sees.
 */
export class VisionCone {
  readonly mesh: THREE.Mesh;
  readonly length: number;
  readonly halfAngle: number;

  /** Current origin and heading (world space). */
  x = 0;
  z = 0;
  yaw = 0;

  private positions: Float32Array;
  private geometry: THREE.BufferGeometry;
  private material: THREE.MeshBasicMaterial;
  private calm = new THREE.Color(TUNING.detection.coneColor);
  private hot = new THREE.Color(TUNING.detection.coneAlertColor);

  constructor(length: number, halfAngle: number, opacity = TUNING.detection.coneOpacity) {
    this.length = length;
    this.halfAngle = halfAngle;

    this.positions = new Float32Array((FAN_SEGMENTS + 2) * 3);
    const indices: number[] = [];
    for (let i = 0; i < FAN_SEGMENTS; i++) indices.push(0, i + 1, i + 2);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setIndex(indices);

    this.material = new THREE.MeshBasicMaterial({
      color: this.calm,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
      // Evening: the beam adds light to the sand instead of painting over it.
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false; // vertices move every frame
    this.mesh.renderOrder = 2;
    this.mesh.position.y = 0.045;
  }

  /** Rebuild the fan for a new origin / heading. */
  update(x: number, z: number, yaw: number, colliders: Collider[]): void {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    const p = this.positions;
    p[0] = x;
    p[1] = 0;
    p[2] = z;
    for (let i = 0; i <= FAN_SEGMENTS; i++) {
      const a = yaw - this.halfAngle + (i / FAN_SEGMENTS) * this.halfAngle * 2;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      let len = rayDistance(x, z, dx, dz, this.length, colliders);
      // The wall face (z = 0) always stops the light.
      if (dz < -1e-4) len = Math.min(len, Math.max(0, z / -dz));
      const k = (i + 1) * 3;
      p[k] = x + dx * len;
      p[k + 1] = 0;
      p[k + 2] = z + dz * len;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  /** 0 = calm yellow, 1 = alert red. */
  setAlert(amount: number): void {
    this.material.color.copy(this.calm).lerp(this.hot, Math.min(1, Math.max(0, amount)));
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v;
  }

  /**
   * Is the target lit by this cone? Returns the distance as a 0..1 fraction
   * of the cone length (0 = at the lamp), or -1 when it is not seen.
   *
   * `eyeX/eyeZ` is where the guard stands; a hidden player is only seen
   * when the guard is closer than TUNING.detection.hiddenRevealDist.
   */
  sees(target: Target, colliders: Collider[], eyeX = this.x, eyeZ = this.z): number {
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist > this.length) return -1;
    // Behind the wall (walked through the hole) = out of sight.
    if (target.z < 0) return -1;
    if (dist > 0.3 && Math.abs(angleDelta(this.yaw, Math.atan2(dx, dz))) > this.halfAngle) return -1;
    if (target.hidden) {
      const near = Math.hypot(target.x - eyeX, target.z - eyeZ);
      if (near > TUNING.detection.hiddenRevealDist) return -1;
    }
    if (!hasLineOfSight(this.x, this.z, target.x, target.z, colliders)) return -1;
    return dist / this.length;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export type AlertState = 'calm' | 'suspicious' | 'alert';

/** The 0..100 meter every eye owns. 100 = caught. */
export class DetectionMeter {
  value = 0;

  /**
   * @param seen   -1 when the target is not visible, else the 0..1 distance fraction
   * @param fillMul extra multiplier (searchlight)
   */
  update(dt: number, seen: number, punching: boolean, fillMul = 1): void {
    const d = TUNING.detection;
    if (seen >= 0) {
      // Faster when closer: blend between the near and far fill rates.
      let rate = d.fillNear + (d.fillFar - d.fillNear) * seen;
      if (punching) rate *= d.punchMultiplier;
      this.value = Math.min(100, this.value + rate * fillMul * dt);
    } else {
      this.value = Math.max(0, this.value - d.drain * dt);
    }
  }

  get state(): AlertState {
    if (this.value >= TUNING.detection.alert) return 'alert';
    if (this.value >= TUNING.detection.suspicious) return 'suspicious';
    return 'calm';
  }

  /** 0 below "suspicious", 1 at "alert" - used to tint the cone. */
  get heat(): number {
    const d = TUNING.detection;
    return (this.value - d.suspicious) / (d.alert - d.suspicious);
  }

  get caught(): boolean {
    return this.value >= 100;
  }

  reset(): void {
    this.value = 0;
  }
}
