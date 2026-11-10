import * as THREE from 'three';
import { DEG, TUNING } from '../config/tuning';

/**
 * CameraRig - two camera poses and a smooth move between them.
 *
 *   menu : low on the ground, looking up at the towering wall
 *   game : top-down, tilted ~62 degrees, following the player on X and Z,
 *          clamped so the wall stays in the top third of the screen
 */
export type CameraMode = 'menu' | 'game';

const smooth = (t: number) => t * t * (3 - 2 * t);

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(46, 0.46, 0.5, 220);
  /** Point on the ground the game camera is looking at (the sun follows it). */
  readonly focus = new THREE.Vector3(0, 0, 7);

  private mode: CameraMode = 'menu';
  /** 0 = menu pose, 1 = game pose. */
  private blend = 0;
  private halfWidth = 10;
  private depth = 13;
  private aspect = 0.46;
  private gameFov = 46;
  private shakeAmount = 0;
  private time = 0;

  private gamePos = new THREE.Vector3();
  private menuPos = new THREE.Vector3();
  private menuLook = new THREE.Vector3();
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();

  setBounds(halfWidth: number, depth: number): void {
    this.halfWidth = halfWidth;
    this.depth = depth;
  }

  resize(width: number, height: number): void {
    this.aspect = width / height;
    this.camera.aspect = this.aspect;
    // Keep the *horizontal* view constant so every phone sees the same width
    // of the level; taller screens simply see more depth.
    const h = TUNING.camera.horizontalFovDeg * DEG;
    const v = (2 * Math.atan(Math.tan(h / 2) / this.aspect)) / DEG;
    this.gameFov = Math.max(38, Math.min(62, v));
    this.camera.updateProjectionMatrix();
  }

  setMode(mode: CameraMode, instant = false): void {
    this.mode = mode;
    if (instant) this.blend = mode === 'game' ? 1 : 0;
  }

  /** Kick the camera. `amount` is in metres; it dies out on its own. */
  shake(amount: number): void {
    this.shakeAmount = Math.min(0.6, Math.max(this.shakeAmount, amount));
  }

  /** Jump the follow point straight to a position (level start). */
  snapTo(x: number, z: number): void {
    this.clampFocus(x, z);
    this.focus.copy(this.tmp);
  }

  private tmp = new THREE.Vector3();

  private clampFocus(x: number, z: number): void {
    const C = TUNING.camera;
    const maxX = Math.max(0, this.halfWidth - C.sideMargin);
    const maxZ = Math.max(C.minTargetZ, this.depth - C.backMargin);
    this.tmp.set(Math.max(-maxX, Math.min(maxX, x)), 0, Math.max(C.minTargetZ, Math.min(maxZ, z)));
  }

  /** @param followX/followZ the player's position */
  update(dt: number, followX: number, followZ: number): void {
    const C = TUNING.camera;
    this.time += dt;

    // Follow the player smoothly on X and Z, inside the level bounds.
    this.clampFocus(followX, followZ);
    this.focus.lerp(this.tmp, Math.min(1, dt * C.followRate));

    const pitch = C.pitchDeg * DEG;
    this.gamePos.set(this.focus.x, Math.sin(pitch) * C.distance, this.focus.z + Math.cos(pitch) * C.distance);

    // Menu pose with a slow drift so the scene behind the menu feels alive.
    this.menuPos.set(C.menuPos[0] + Math.sin(this.time * 0.25) * 0.5, C.menuPos[1], C.menuPos[2]);
    this.menuLook.set(C.menuLook[0], C.menuLook[1], C.menuLook[2]);

    const target = this.mode === 'game' ? 1 : 0;
    const speed = dt / 0.9; // the move takes 0.9 s
    this.blend = target > this.blend ? Math.min(1, this.blend + speed) : Math.max(0, this.blend - speed);
    const k = smooth(this.blend);

    this.pos.lerpVectors(this.menuPos, this.gamePos, k);
    this.look.lerpVectors(this.menuLook, this.focus, k);
    const fov = C.menuFovDeg + (this.gameFov - C.menuFovDeg) * k;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // Shake: a quick random offset that decays.
    if (this.shakeAmount > 0.001) {
      this.pos.x += (Math.random() - 0.5) * 2 * this.shakeAmount;
      this.pos.y += (Math.random() - 0.5) * 2 * this.shakeAmount;
      this.pos.z += (Math.random() - 0.5) * this.shakeAmount;
      this.shakeAmount *= Math.exp(-C.shakeDecay * dt);
    } else {
      this.shakeAmount = 0;
    }

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
