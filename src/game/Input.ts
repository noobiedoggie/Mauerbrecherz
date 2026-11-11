/**
 * Input - floating virtual joystick, PUNCH (hold), HIDE, tool cycle.
 *
 * Touch is the main input. For testing in a desktop browser the keyboard
 * works too: WASD / arrows = move, Space = punch, H = hide, T = next tool,
 * Esc = pause.
 */

export interface InputElements {
  /** Left part of the screen that listens for the joystick thumb. */
  zone: HTMLElement;
  /** Joystick ring and knob (moved to wherever the thumb lands). */
  base: HTMLElement;
  knob: HTMLElement;
  punch: HTMLElement;
  hide: HTMLElement;
  tool: HTMLElement;
  /** THROW button: tap to throw ahead, hold and drag to aim. */
  throwBtn: HTMLElement;
}

export class Input {
  /** Joystick vector, each -1..1. moveY is positive towards the wall (screen up). */
  moveX = 0;
  moveY = 0;
  /** True while the PUNCH button is held. */
  punchHeld = false;

  onHide: () => void = () => {};
  onTool: () => void = () => {};
  /** Throw released. (dx, dy) = drag in px (screen axes), `drag` = its length. */
  onThrow: (dx: number, dy: number, drag: number) => void = () => {};

  /** True while the THROW button is held (aiming). */
  aiming = false;
  aimDX = 0;
  aimDY = 0;
  private throwId = -1;
  private throwX = 0;
  private throwY = 0;
  onPause: () => void = () => {};

  private enabled = false;
  private joyId = -1;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private punchId = -1;
  private keys = new Set<string>();
  private keyPunch = false;
  private touchX = 0;
  private touchY = 0;

  constructor(private el: InputElements) {
    const { zone, punch, hide, tool } = el;

    // ---- joystick ----
    zone.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.joyId !== -1) return;
      this.joyId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      this.joyOriginX = e.clientX;
      this.joyOriginY = e.clientY;
      this.placeBase(e.clientX, e.clientY);
      el.base.classList.add('is-active');
      this.moveKnob(0, 0);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyId) return;
      const radius = el.base.offsetWidth * 0.5;
      let dx = e.clientX - this.joyOriginX;
      let dy = e.clientY - this.joyOriginY;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      this.moveKnob(dx, dy);
      this.touchX = dx / radius;
      this.touchY = -dy / radius;
    });
    const endJoy = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.releaseJoystick();
    };
    zone.addEventListener('pointerup', endJoy);
    zone.addEventListener('pointercancel', endJoy);
    zone.addEventListener('lostpointercapture', endJoy);

    // ---- punch: hold to keep punching ----
    punch.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.punchId = e.pointerId;
      punch.setPointerCapture(e.pointerId);
      this.punchHeld = true;
      punch.classList.add('is-down');
    });
    const endPunch = (e: PointerEvent) => {
      if (e.pointerId !== this.punchId) return;
      this.releasePunch();
    };
    punch.addEventListener('pointerup', endPunch);
    punch.addEventListener('pointercancel', endPunch);
    punch.addEventListener('lostpointercapture', endPunch);

    // ---- taps ----
    hide.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.enabled) this.onHide();
    });
    tool.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.enabled) this.onTool();
    });

    // ---- throw: hold, drag to aim, release ----
    const tb = el.throwBtn;
    tb.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.throwId !== -1) return;
      e.preventDefault();
      this.throwId = e.pointerId;
      tb.setPointerCapture(e.pointerId);
      this.throwX = e.clientX;
      this.throwY = e.clientY;
      this.aimDX = 0;
      this.aimDY = 0;
      this.aiming = true;
      tb.classList.add('is-down');
    });
    tb.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.throwId) return;
      this.aimDX = e.clientX - this.throwX;
      this.aimDY = e.clientY - this.throwY;
    });
    tb.addEventListener('pointerup', (e) => {
      if (e.pointerId !== this.throwId) return;
      const dx = this.aimDX;
      const dy = this.aimDY;
      this.releaseThrow();
      if (this.enabled) this.onThrow(dx, dy, Math.hypot(dx, dy));
    });
    const cancelThrow = (e: PointerEvent) => {
      if (e.pointerId === this.throwId) this.releaseThrow();
    };
    tb.addEventListener('pointercancel', cancelThrow);
    tb.addEventListener('lostpointercapture', cancelThrow);

    // ---- keyboard (desktop testing) ----
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        this.onPause();
        return;
      }
      if (!this.enabled) return;
      this.keys.add(k);
      if (k === ' ') this.keyPunch = true;
      if (k === 'h') this.onHide();
      if (k === 't') this.onTool();
      if (k === 'f') this.onThrow(0, 0, 0); // throw straight ahead
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === ' ') this.keyPunch = false;
    });
    window.addEventListener('blur', () => this.reset());
  }

  /** Call once per frame before reading moveX / moveY / punchHeld. */
  poll(): void {
    let x = this.touchX;
    let y = this.touchY;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y += 1;
    if (k.has('s') || k.has('arrowdown')) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.moveX = x;
    this.moveY = y;
    this.punchHeld = this.punchId !== -1 || this.keyPunch;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.reset();
  }

  /** Drop every held control (used when a menu opens). */
  reset(): void {
    this.releaseJoystick();
    this.releasePunch();
    this.releaseThrow();
    this.keys.clear();
    this.keyPunch = false;
    this.moveX = 0;
    this.moveY = 0;
    this.punchHeld = false;
  }

  private releaseJoystick(): void {
    this.joyId = -1;
    this.touchX = 0;
    this.touchY = 0;
    this.el.base.classList.remove('is-active');
    this.el.base.style.left = '';
    this.el.base.style.top = '';
    this.moveKnob(0, 0);
  }

  private releaseThrow(): void {
    this.throwId = -1;
    this.aiming = false;
    this.el.throwBtn.classList.remove('is-down');
  }

  /** Max drag (px) for a full-range throw. */
  get maxAimDrag(): number {
    return Math.max(80, this.el.throwBtn.offsetWidth * 2.2);
  }

  private releasePunch(): void {
    this.punchId = -1;
    this.punchHeld = false;
    this.el.punch.classList.remove('is-down');
  }

  private placeBase(clientX: number, clientY: number): void {
    const parent = this.el.zone.getBoundingClientRect();
    this.el.base.style.left = `${clientX - parent.left}px`;
    this.el.base.style.top = `${clientY - parent.top}px`;
  }

  private moveKnob(dx: number, dy: number): void {
    this.el.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
}
