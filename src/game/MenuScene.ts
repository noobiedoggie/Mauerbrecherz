import * as THREE from 'three';

/**
 * MenuScene - extra atmosphere that only shows behind the main menu:
 *   - a setting sun glowing just above the top of the wall
 *   - warm dust motes drifting through the light
 *
 * `update(dt, amount)` fades everything with the menu camera (amount 1 =
 * menu, 0 = in game), so nothing of this is drawn during play.
 */

/** Tuning for the menu look. */
const MENU = {
  /** Where the sun sits (world space, far behind the wall). */
  sunPos: new THREE.Vector3(-3.0, 62.1, -78.7),
  sunSize: 16,
  sunGlowSize: 95,
  sunColor: 0xffd28a,
  glowColor: 0xff9a5a,
  /** Dust motes: count and the box they float in. */
  dustCount: 160,
  dustMin: new THREE.Vector3(-7, 0.2, 0.5),
  dustMax: new THREE.Vector3(9, 7.5, 12),
  dustColor: 0xffd9a0,
};

function radial(inner: string, outer: string, stop = 0.35): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(stop, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class MenuScene {
  readonly group = new THREE.Group();
  private sun: THREE.Sprite;
  private glow: THREE.Sprite;
  private dust: THREE.Points;
  private dustMat: THREE.PointsMaterial;
  private base: Float32Array;
  private phase: Float32Array;
  private time = 0;

  constructor() {
    const spriteMat = (map: THREE.Texture, color: number, opacity: number) =>
      new THREE.SpriteMaterial({
        map,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        fog: false,
        toneMapped: false,
      });

    // Wide soft glow first, then the bright disk.
    this.glow = new THREE.Sprite(spriteMat(radial('rgba(255,255,255,0.55)', 'rgba(255,255,255,0)', 0.05), MENU.glowColor, 0.9));
    this.glow.position.copy(MENU.sunPos);
    this.glow.scale.setScalar(MENU.sunGlowSize);
    this.sun = new THREE.Sprite(spriteMat(radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 0.55), MENU.sunColor, 1));
    this.sun.position.copy(MENU.sunPos);
    this.sun.scale.setScalar(MENU.sunSize);
    this.sun.renderOrder = -5;
    this.glow.renderOrder = -6;

    // Dust motes.
    const n = MENU.dustCount;
    this.base = new Float32Array(n * 3);
    this.phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.base[i * 3] = THREE.MathUtils.lerp(MENU.dustMin.x, MENU.dustMax.x, Math.random());
      this.base[i * 3 + 1] = THREE.MathUtils.lerp(MENU.dustMin.y, MENU.dustMax.y, Math.random());
      this.base[i * 3 + 2] = THREE.MathUtils.lerp(MENU.dustMin.z, MENU.dustMax.z, Math.random());
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.base.slice(), 3));
    this.dustMat = new THREE.PointsMaterial({
      color: MENU.dustColor,
      size: 0.07,
      map: radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 0.2),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.dust = new THREE.Points(geo, this.dustMat);
    this.dust.frustumCulled = false;

    this.group.add(this.glow, this.sun, this.dust);
  }

  /** @param amount 1 = full menu, 0 = in game */
  update(dt: number, amount: number): void {
    this.time += dt;
    this.group.visible = amount > 0.01;
    if (!this.group.visible) return;

    // The sun breathes a little.
    const pulse = 1 + Math.sin(this.time * 0.6) * 0.03;
    this.sun.scale.setScalar(MENU.sunSize * pulse);
    (this.sun.material as THREE.SpriteMaterial).opacity = amount;
    (this.glow.material as THREE.SpriteMaterial).opacity = 0.9 * amount;

    // Dust drifts slowly upwards and sways; it wraps around at the top.
    const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const h = MENU.dustMax.y - MENU.dustMin.y;
    for (let i = 0; i < this.phase.length; i++) {
      const p = this.phase[i];
      arr[i * 3] = this.base[i * 3] + Math.sin(this.time * 0.35 + p) * 0.6;
      let y = this.base[i * 3 + 1] + ((this.time * (0.12 + (p % 0.1))) % h);
      if (y > MENU.dustMax.y) y -= h;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = this.base[i * 3 + 2] + Math.cos(this.time * 0.27 + p * 1.7) * 0.5;
    }
    pos.needsUpdate = true;
    this.dustMat.opacity = 0.85 * amount * (0.75 + 0.25 * Math.sin(this.time * 1.3));
  }
}
