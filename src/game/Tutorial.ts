import * as THREE from 'three';

/**
 * Tutorial - interactive first-wall guide.
 *
 * Each step waits for the player to actually do the thing (move, reach the
 * wall, punch, hide, stand up, throw). Guards cannot spot you until the
 * tutorial is finished or skipped. A bouncing 3D arrow points at places in
 * the world; the UI coach card points at buttons.
 */

/** What the coach card points at. */
export type CoachTarget = 'joy' | 'punch' | 'hide' | 'throw' | null;

export interface TutorialStep {
  text: string;
  target: CoachTarget;
  /** World position for the 3D arrow (or null for none). */
  arrow: [number, number, number] | null;
}

/** What the tutorial needs to know each frame. */
export interface TutorialInput {
  moved: number;
  inPunchRange: boolean;
  hits: number;
  hidden: boolean;
  canHide: boolean;
  throws: number;
}

const STEPS: (TutorialStep & { done: (i: TutorialInput, s: StepState) => boolean })[] = [
  {
    text: 'Drag your thumb here to move.',
    target: 'joy',
    arrow: null,
    done: (i) => i.moved > 1.5,
  },
  {
    text: 'Walk into the yellow box at the foot of the wall.',
    target: null,
    arrow: [0, 2.3, 0.9],
    done: (i) => i.inPunchRange,
  },
  {
    text: 'Hold PUNCH to hit the wall.',
    target: 'punch',
    arrow: null,
    done: (i, s) => i.hits - s.hitsAtStart >= 3,
  },
  {
    text: 'Guards patrol with flashlights. Go next to the crate.',
    target: null,
    arrow: [-2.4, 2.4, 1.2],
    done: (i) => i.canHide,
  },
  {
    text: 'Tap HIDE. Crouched by cover, flashlights miss you.',
    target: 'hide',
    arrow: null,
    done: (i) => i.hidden,
  },
  {
    text: 'Tap HIDE again to stand up.',
    target: 'hide',
    arrow: null,
    done: (i) => !i.hidden,
  },
  {
    text: 'Tap THROW, or hold and drag to aim. Stones pull guards away.',
    target: 'throw',
    arrow: null,
    done: (i, s) => i.throws > s.throwsAtStart,
  },
];

interface StepState {
  hitsAtStart: number;
  throwsAtStart: number;
}

export class Tutorial {
  readonly group = new THREE.Group();
  /** True while the guided steps run (guards cannot spot you). */
  active = false;
  /** Shows the coach card for a step, or null to hide it. */
  onStep: (step: TutorialStep | null, index: number, total: number) => void = () => {};
  /** Finished or skipped. */
  onFinish: (skipped: boolean) => void = () => {};

  private index = 0;
  private state: StepState = { hitsAtStart: 0, throwsAtStart: 0 };
  private arrow: THREE.Group;
  private time = 0;
  private stepDelay = 0;

  constructor() {
    // A chunky yellow arrow pointing down, with an ink outline.
    this.arrow = new THREE.Group();
    const yellow = new THREE.MeshBasicMaterial({ color: 0xffc234, toneMapped: false, fog: false });
    const ink = new THREE.MeshBasicMaterial({ color: 0x121212, toneMapped: false, fog: false, side: THREE.BackSide });
    const head = new THREE.ConeGeometry(0.42, 0.6, 4);
    head.rotateX(Math.PI); // point down
    const shaft = new THREE.BoxGeometry(0.28, 0.6, 0.28);
    for (const [geo, y] of [
      [head, 0],
      [shaft, 0.55],
    ] as const) {
      const m = new THREE.Mesh(geo, yellow);
      m.position.y = y;
      const o = new THREE.Mesh(geo, ink);
      o.position.y = y;
      o.scale.setScalar(1.18);
      this.arrow.add(o, m);
    }
    this.arrow.visible = false;
    this.arrow.renderOrder = 30;
    this.group.add(this.arrow);
  }

  start(input: TutorialInput): void {
    this.active = true;
    this.index = 0;
    this.enter(input);
  }

  skip(): void {
    if (!this.active) return;
    this.finish(true);
  }

  stop(): void {
    this.active = false;
    this.arrow.visible = false;
    this.onStep(null, 0, STEPS.length);
  }

  update(dt: number, input: TutorialInput): void {
    this.time += dt;
    if (!this.active) return;
    // Bob and spin the arrow.
    this.arrow.position.y = (STEPS[this.index]?.arrow?.[1] ?? 0) + Math.abs(Math.sin(this.time * 4)) * 0.35;
    this.arrow.rotation.y += dt * 2;

    if (this.stepDelay > 0) {
      this.stepDelay -= dt;
      return;
    }
    if (STEPS[this.index].done(input, this.state)) {
      this.index++;
      if (this.index >= STEPS.length) this.finish(false);
      else {
        this.stepDelay = 0.35; // a short beat between steps
        this.enter(input);
      }
    }
  }

  private enter(input: TutorialInput): void {
    const step = STEPS[this.index];
    this.state = { hitsAtStart: input.hits, throwsAtStart: input.throws };
    if (step.arrow) {
      this.arrow.visible = true;
      this.arrow.position.set(...step.arrow);
    } else {
      this.arrow.visible = false;
    }
    this.onStep(step, this.index, STEPS.length);
  }

  private finish(skipped: boolean): void {
    this.stop();
    this.onFinish(skipped);
  }
}
