/**
 * Audio - every sound is synthesised with the Web Audio API (no audio files).
 *
 * Signal chain:
 *   sounds -> dry bus ----------------------\
 *          -> reverb send -> convolver ------> compressor -> master -> speakers
 *
 * The convolver uses a generated "outdoor slap" impulse (a short, dark tail
 * like sound bouncing off the wall), which glues everything into one space.
 *
 * Sound design notes (tweak freely):
 *   - Impacts are layered: a low body thump + a filtered noise "crack" +
 *     material-specific detail (metal ring, flesh slap, motor rattle).
 *   - The evening ambience is wind (filtered noise) + crickets (short chirp
 *     trains) + a far-away low city hum.
 *   - Tension: a heartbeat that speeds up with the detection meter.
 *
 * Browsers only allow audio after a touch, so `unlock()` is called from the
 * first pointer event.
 */

/** Which impact recipe a tool uses (see tools.ts). */
export type ImpactKind = 'wraps' | 'brass' | 'hammer' | 'sledge' | 'pick' | 'jack';

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private send: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private muted = false;
  /** Master volume, 0..1. */
  volume = 0.9;

  private amb: { gain: GainNode; nodes: AudioScheduledSourceNode[]; timer: number } | null = null;
  private jack: { gain: GainNode; nodes: AudioScheduledSourceNode[] } | null = null;
  private nextBeat = 0;
  private sirenUntil = 0;

  /** Create / resume the audio context. Safe to call many times. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      comp.connect(this.master).connect(ctx.destination);

      this.dry = ctx.createGain();
      this.dry.connect(comp);

      // Reverb: 1.3 s of decaying, darkened stereo noise.
      const len = Math.floor(ctx.sampleRate * 1.3);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const t = i / len;
          lp += (Math.random() * 2 - 1 - lp) * 0.35; // one-pole low-pass
          // Early slap from the wall at ~45 ms, then a soft tail.
          const slap = i > ctx.sampleRate * 0.045 && i < ctx.sampleRate * 0.06 ? 1.6 : 1;
          d[i] = lp * Math.pow(1 - t, 3.2) * slap;
        }
      }
      const conv = ctx.createConvolver();
      conv.buffer = ir;
      this.send = ctx.createGain();
      this.send.gain.value = 0.5;
      this.send.connect(conv).connect(comp);

      // Two seconds of white and brown noise, reused by every noisy sound.
      const nlen = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
      this.brown = ctx.createBuffer(1, nlen, ctx.sampleRate);
      const w = this.noise.getChannelData(0);
      const b = this.brown.getChannelData(0);
      let last = 0;
      for (let i = 0; i < nlen; i++) {
        w[i] = Math.random() * 2 - 1;
        last = (last + 0.02 * w[i]) / 1.02;
        b[i] = last * 3.5;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  /** App went to the background / came back. */
  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  private get ready(): boolean {
    return !!this.ctx && !this.muted && this.ctx.state === 'running';
  }

  // ---- building blocks -------------------------------------------------------

  /** Route a node to the dry bus (with pan) and, optionally, the reverb. */
  private out(node: AudioNode, pan = 0, wet = 0.15): void {
    const ctx = this.ctx!;
    let tail: AudioNode = node;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p);
      tail = p;
    }
    tail.connect(this.dry!);
    if (wet > 0) {
      const g = ctx.createGain();
      g.gain.value = wet;
      tail.connect(g).connect(this.send!);
    }
  }

  /** A pitched tone with an exponential pitch glide and a percussive envelope. */
  private tone(
    type: OscillatorType,
    from: number,
    to: number,
    dur: number,
    gain: number,
    opts: { delay?: number; attack?: number; pan?: number; wet?: number } = {},
  ): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + (opts.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    this.out(g, opts.pan ?? 0, opts.wet ?? 0.15);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Filtered noise burst. `sweepTo` slides the filter frequency. */
  private burst(
    filter: BiquadFilterType,
    freq: number,
    dur: number,
    gain: number,
    opts: { delay?: number; q?: number; sweepTo?: number; attack?: number; pan?: number; wet?: number; brown?: boolean } = {},
  ): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = opts.brown ? this.brown : this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
    f.Q.value = opts.q ?? 0.8;
    const g = ctx.createGain();
    const a = opts.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    this.out(g, opts.pan ?? 0, opts.wet ?? 0.15);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  /** Inharmonic metal ring (several decaying partials). */
  private ring(base: number, partials: number[], dur: number, gain: number, delay = 0): void {
    partials.forEach((ratio, i) => {
      this.tone('sine', base * ratio, base * ratio * 0.995, dur * (1 - i * 0.15), gain / (1 + i * 0.7), { delay, wet: 0.3 });
    });
  }

  // ---- impacts on the wall -----------------------------------------------------

  /** One hit on concrete. `weight` ~0.3 (fists) .. 1.6 (sledge). */
  impact(kind: ImpactKind, weight = 1): void {
    if (!this.ready) return;
    const v = 0.8 + Math.random() * 0.4; // a bit of variation every hit
    switch (kind) {
      case 'wraps':
        // Taped fist on concrete: dull slap + soft low thump.
        this.burst('bandpass', 1100 * v, 0.06, 0.55, { q: 1.2, wet: 0.1 });
        this.tone('sine', 140 * v, 55, 0.12, 0.6, { wet: 0.08 });
        this.burst('highpass', 3500, 0.025, 0.12);
        break;
      case 'brass':
        this.burst('bandpass', 1300 * v, 0.06, 0.5, { q: 1.4 });
        this.tone('sine', 150 * v, 55, 0.13, 0.6, { wet: 0.08 });
        this.ring(2350 * v, [1, 1.47, 2.09], 0.14, 0.09);
        break;
      case 'hammer':
        // Steel on concrete: sharp crack, mid knock, a little metal ring.
        this.burst('highpass', 1800, 0.05, 0.6, { wet: 0.2 });
        this.burst('bandpass', 750 * v, 0.1, 0.55, { q: 2.2 });
        this.tone('sine', 120 * v, 48, 0.16, 0.55);
        this.ring(1850 * v, [1, 1.62, 2.71], 0.2, 0.06, 0.004);
        break;
      case 'sledge':
        // Heavy boom: deep body, chunky crack, long tail off the wall.
        this.tone('sine', 95 * v, 34, 0.42, 0.95, { wet: 0.35 });
        this.burst('lowpass', 900, 0.32, 0.8, { sweepTo: 160, wet: 0.45, brown: true });
        this.burst('highpass', 1400, 0.07, 0.5, { wet: 0.25 });
        this.burst('bandpass', 420 * v, 0.18, 0.45, { q: 1.5 });
        this.ring(1200 * v, [1, 1.58], 0.18, 0.04, 0.005);
        break;
      case 'pick':
        // Pointed steel biting in: bright chink + gritty crunch.
        this.ring(2650 * v, [1, 1.55, 2.02, 2.76], 0.24, 0.12);
        this.burst('highpass', 2400, 0.08, 0.55, { wet: 0.25 });
        this.burst('bandpass', 900 * v, 0.14, 0.45, { q: 1.6 });
        this.tone('sine', 110 * v, 42, 0.25, 0.7, { wet: 0.25 });
        break;
      case 'jack':
        // Chisel chatter: three fast knocks per hit (the motor runs separately).
        for (let i = 0; i < 3; i++) {
          this.burst('bandpass', 1500 + Math.random() * 600, 0.035, 0.45, { delay: i * 0.05, q: 1.8, wet: 0.1 });
          this.tone('sine', 120, 60, 0.04, 0.35, { delay: i * 0.05, wet: 0 });
        }
        break;
    }
    // Every hit sheds a few grains of grit.
    if (weight > 0.5) this.grit(Math.round(2 + weight * 3), 0.25);
  }

  /** Tiny pebbles skittering (bandpassed noise ticks). */
  private grit(count: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      this.burst('bandpass', 2200 + Math.random() * 4000, 0.012 + Math.random() * 0.02, 0.06 + Math.random() * 0.1, {
        delay: 0.03 + Math.random() * spread,
        q: 3,
        pan: (Math.random() - 0.5) * 0.6,
        wet: 0.2,
      });
    }
  }

  /** Air swing when nothing is in reach. */
  whiff(): void {
    this.burst('bandpass', 700, 0.16, 0.18, { q: 1.2, sweepTo: 1800, attack: 0.04, wet: 0 });
  }

  /** First hit: the wall cracks open. */
  crack(): void {
    this.burst('highpass', 2600, 0.04, 0.7, { wet: 0.4 });
    this.burst('bandpass', 1400, 0.22, 0.45, { q: 3, sweepTo: 500, delay: 0.02, wet: 0.35 });
    this.tone('sine', 80, 38, 0.35, 0.5, { wet: 0.3 });
    this.grit(6, 0.4);
  }

  /** A chunk breaks off: crunch, pebbles, and a heavy thud when it lands. */
  crumble(): void {
    this.burst('lowpass', 1600, 0.4, 0.6, { sweepTo: 220, attack: 0.01, wet: 0.4, brown: true });
    this.burst('bandpass', 600, 0.25, 0.4, { q: 1.2, sweepTo: 250 });
    this.grit(12, 0.6);
    // Landing in the sand ~0.35 s later.
    this.tone('sine', 70, 32, 0.3, 0.8, { delay: 0.34, wet: 0.35 });
    this.burst('lowpass', 500, 0.25, 0.5, { delay: 0.34, brown: true, wet: 0.3 });
  }

  /** Jackhammer motor: on while the button is held. */
  setJackhammer(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.dry) return;
    if (on && !this.jack && !this.muted) {
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.gain.setTargetAtTime(0.32, ctx.currentTime, 0.04);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.Q.value = 2;
      // A 26 Hz square "piston" amplitude-modulating a rough sawtooth.
      const motor = ctx.createOscillator();
      motor.type = 'sawtooth';
      motor.frequency.value = 78;
      const piston = ctx.createOscillator();
      piston.type = 'square';
      piston.frequency.value = 26;
      const am = ctx.createGain();
      am.gain.value = 0.5;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      piston.connect(depth).connect(am.gain);
      const rattle = ctx.createBufferSource();
      rattle.buffer = this.noise;
      rattle.loop = true;
      const rf = ctx.createBiquadFilter();
      rf.type = 'bandpass';
      rf.frequency.value = 2500;
      const rg = ctx.createGain();
      rg.gain.value = 0.25;
      motor.connect(am);
      rattle.connect(rf).connect(rg).connect(am);
      am.connect(lp).connect(gain);
      this.out(gain, 0, 0.12);
      motor.start();
      piston.start();
      rattle.start();
      this.jack = { gain, nodes: [motor, piston, rattle] };
    } else if (!on && this.jack) {
      const { gain, nodes } = this.jack;
      gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
      for (const n of nodes) n.stop(ctx.currentTime + 0.3);
      this.jack = null;
    }
  }

  // ---- movement ----------------------------------------------------------------

  /**
   * Footstep in the sand. `volume` 0..1 (distance falloff is done by the
   * caller), `pan` -1..1, `heavy` for guard boots.
   */
  footstep(volume: number, pan = 0, heavy = false): void {
    if (volume < 0.03) return;
    const v = 0.85 + Math.random() * 0.3;
    this.burst('bandpass', (heavy ? 900 : 1500) * v, heavy ? 0.09 : 0.07, 0.32 * volume, { q: 0.9, pan, wet: 0.05, attack: 0.006 });
    this.burst('highpass', 4200 * v, 0.04, 0.08 * volume, { pan, wet: 0, delay: 0.01 });
    if (heavy) this.tone('sine', 90 * v, 50, 0.07, 0.25 * volume, { pan, wet: 0 });
  }

  /** Crouch / stand up rustle. */
  rustle(): void {
    this.burst('bandpass', 1800, 0.22, 0.16, { q: 0.6, attack: 0.05, wet: 0.05 });
  }

  // ---- pickups and UI ----------------------------------------------------------

  /** Coin: a bright little bell. */
  coin(): void {
    this.ring(1760, [1, 2.0, 2.76], 0.32, 0.14);
    this.ring(2349, [1, 2.0, 2.76], 0.4, 0.12, 0.07);
  }

  click(): void {
    this.burst('bandpass', 2400, 0.025, 0.25, { q: 2, wet: 0 });
    this.tone('sine', 520, 380, 0.05, 0.12, { wet: 0 });
  }

  buy(): void {
    this.coin();
    this.ring(3136, [1, 2.0], 0.45, 0.1, 0.16);
    this.burst('bandpass', 3000, 0.1, 0.15, { q: 1, delay: 0.02 });
  }

  deny(): void {
    this.tone('square', 130, 110, 0.18, 0.12, { wet: 0 });
    this.tone('square', 98, 90, 0.18, 0.1, { wet: 0, delay: 0.02 });
  }

  // ---- guards ------------------------------------------------------------------

  /** Guard "?": a muffled, questioning "hm?" (two vocal formants). */
  question(pan = 0): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115, t);
    osc.frequency.linearRampToValueAtTime(108, t + 0.12);
    osc.frequency.exponentialRampToValueAtTime(175, t + 0.32);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
    g.gain.setValueAtTime(0.5, t + 0.24);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    const mix = ctx.createGain();
    for (const [f, q, lvl] of [
      [420, 6, 1],
      [1100, 8, 0.45],
      [2500, 10, 0.15],
    ] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const lg = ctx.createGain();
      lg.gain.value = lvl;
      g.connect(bp).connect(lg).connect(mix);
    }
    osc.connect(g);
    this.out(mix, pan, 0.2);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  /** Guard "!": a sharp pea-whistle blast. */
  alarm(pan = 0): void {
    this.whistle(0.55, pan);
  }

  private whistle(dur: number, pan: number, delay = 0): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 3000;
    // The pea rattling inside the whistle = fast vibrato.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 34;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 210;
    lfo.connect(lfoG).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
    g.gain.setValueAtTime(0.32, t + dur - 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    this.out(g, pan, 0.35);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    this.burst('highpass', 5000, dur, 0.06, { delay, attack: 0.02, pan });
  }

  /** Caught: two whistle blasts and a dramatic low hit. */
  caught(): void {
    this.whistle(0.3, 0);
    this.whistle(0.75, 0, 0.36);
    this.tone('sine', 65, 30, 1.0, 0.9, { wet: 0.5 });
    this.burst('lowpass', 1200, 0.6, 0.5, { sweepTo: 120, brown: true, wet: 0.5 });
  }

  /** Wall down: a long collapse rumble + a bright three-note sting. */
  win(): void {
    this.burst('lowpass', 1400, 1.6, 0.8, { sweepTo: 90, attack: 0.03, brown: true, wet: 0.6 });
    this.tone('sine', 58, 26, 1.4, 0.9, { wet: 0.6 });
    this.grit(24, 1.2);
    [392, 523.25, 659.25, 783.99].forEach((f, i) => {
      this.tone('triangle', f, f, 0.5 + i * 0.12, 0.22, { delay: 0.35 + i * 0.12, attack: 0.01, wet: 0.45 });
      this.tone('sawtooth', f / 2, f / 2, 0.45, 0.05, { delay: 0.35 + i * 0.12, wet: 0.3 });
    });
  }

  // ---- hazards -----------------------------------------------------------------

  /** Short electronic tick from a nearby mine. */
  mineBeep(pan = 0, urgent = false): void {
    this.tone('sine', urgent ? 2400 : 1900, urgent ? 2400 : 1900, 0.05, urgent ? 0.22 : 0.14, { pan, wet: 0.05, attack: 0.002 });
  }

  /** Mine explosion. */
  explosion(): void {
    this.burst('lowpass', 3500, 1.5, 1.0, { sweepTo: 70, attack: 0.004, brown: true, wet: 0.7 });
    this.burst('highpass', 1500, 0.12, 0.8, { wet: 0.5 });
    this.tone('sine', 85, 22, 1.3, 1.0, { wet: 0.6 });
    this.grit(30, 1.5);
  }

  /** Tripwire: tin cans rattle, then a two-tone siren for a few seconds. */
  tripwire(): void {
    for (let i = 0; i < 7; i++) {
      this.ring(1300 + Math.random() * 900, [1, 1.7, 2.6], 0.12, 0.12, i * 0.06 + Math.random() * 0.03);
    }
    this.siren(3.2);
  }

  private siren(dur: number): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.25;
    this.sirenUntil = t + dur;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    for (let k = 0; k < dur / 0.5; k++) osc.frequency.setValueAtTime(k % 2 ? 660 : 880, t + k * 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.1);
    g.gain.setValueAtTime(0.13, t + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp).connect(g);
    this.out(g, 0, 0.6);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  get sirenActive(): boolean {
    return !!this.ctx && this.ctx.currentTime < this.sirenUntil;
  }

  // ---- tension -----------------------------------------------------------------

  /**
   * Called every frame with the highest detection (0..1). Above ~0.3 a
   * heartbeat fades in and speeds up.
   */
  updateTension(level: number): void {
    if (!this.ready || level < 0.28) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    if (now < this.nextBeat) return;
    const k = Math.min(1, (level - 0.28) / 0.72);
    const bpm = 70 + 80 * k;
    const vol = 0.25 + 0.55 * k;
    // "lub-dub"
    this.tone('sine', 62, 40, 0.13, vol, { wet: 0, attack: 0.01 });
    this.tone('sine', 55, 36, 0.12, vol * 0.7, { delay: 0.17, wet: 0, attack: 0.01 });
    this.nextBeat = now + 60 / bpm;
  }

  // ---- ambience ----------------------------------------------------------------

  /** Evening ambience: wind, crickets and a distant hum. */
  startAmbience(): void {
    const ctx = this.ctx;
    if (!ctx || !this.dry || this.amb) return;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(1, ctx.currentTime, 1.0);
    gain.connect(this.dry);
    const nodes: AudioScheduledSourceNode[] = [];

    // Wind: brown noise through a slowly wandering band-pass.
    const wind = ctx.createBufferSource();
    wind.buffer = this.brown;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 380;
    wf.Q.value = 0.7;
    const wg = ctx.createGain();
    wg.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 180;
    lfo.connect(lfoG).connect(wf.frequency);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.11;
    const lfo2G = ctx.createGain();
    lfo2G.gain.value = 0.07;
    lfo2.connect(lfo2G).connect(wg.gain);
    wind.connect(wf).connect(wg).connect(gain);
    wind.start();
    lfo.start();
    lfo2.start();
    nodes.push(wind, lfo, lfo2);

    // Distant city / generator hum.
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 49;
    const hg = ctx.createGain();
    hg.gain.value = 0.05;
    hum.connect(hg).connect(gain);
    hum.start();
    nodes.push(hum);

    // Crickets: short chirp trains at random times and positions.
    const chirp = () => {
      if (!this.amb || !this.ready) return;
      const t = ctx.currentTime;
      const f = 4300 + Math.random() * 500;
      const pulses = 3 + Math.floor(Math.random() * 3);
      const pan = Math.random() * 2 - 1;
      for (let i = 0; i < pulses; i++) {
        const osc = ctx.createOscillator();
        osc.frequency.value = f;
        const g = ctx.createGain();
        const s = t + i * 0.045;
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(0.025, s + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.03);
        osc.connect(g);
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p).connect(gain);
        osc.start(s);
        osc.stop(s + 0.04);
      }
    };
    const timer = window.setInterval(() => {
      if (Math.random() < 0.7) chirp();
      if (Math.random() < 0.3) window.setTimeout(chirp, 220);
    }, 650);

    this.amb = { gain, nodes, timer };
  }

  stopAmbience(): void {
    const ctx = this.ctx;
    this.setJackhammer(false);
    if (!ctx || !this.amb) return;
    const { gain, nodes, timer } = this.amb;
    window.clearInterval(timer);
    gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
    for (const n of nodes) n.stop(ctx.currentTime + 1.2);
    this.amb = null;
  }
}
