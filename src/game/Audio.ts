/**
 * Audio - every sound is synthesised with the Web Audio API, so the game
 * ships no audio files.
 *
 * Browsers only allow audio after a touch, so `unlock()` is called from the
 * first pointer event.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private hum: { gain: GainNode; nodes: AudioScheduledSourceNode[] } | null = null;
  private muted = false;
  /** Master volume, 0..1. */
  volume = 0.8;

  /** Create / resume the audio context. Safe to call many times. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);

      // One second of white noise, reused by every noisy sound.
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
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

  // ---- building blocks -------------------------------------------------------

  private tone(
    type: OscillatorType,
    from: number,
    to: number,
    dur: number,
    gain: number,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burst(filter: BiquadFilterType, freq: number, dur: number, gain: number, delay = 0, q = 0.8): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || this.muted) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.02);
  }

  // ---- game sounds -----------------------------------------------------------

  /** Punch thud. `hz` comes from the tool: lower = heavier. */
  thud(hz: number, weight = 1): void {
    this.tone('sine', hz * 1.9, hz * 0.55, 0.13 + 0.05 * weight, 0.55);
    this.tone('triangle', hz * 3.1, hz, 0.05, 0.18);
    this.burst('lowpass', 500 + hz * 5, 0.07 + 0.03 * weight, 0.3);
  }

  /** Air swing when nothing is in reach. */
  whiff(): void {
    this.burst('bandpass', 900, 0.11, 0.12, 0, 1.5);
  }

  /** First hit: the wall cracks. */
  crack(): void {
    this.burst('highpass', 2200, 0.09, 0.35);
    this.burst('bandpass', 1300, 0.16, 0.3, 0.03, 2);
    this.tone('square', 190, 60, 0.12, 0.12);
  }

  /** A chunk falls out and crumbles. */
  crumble(): void {
    for (let i = 0; i < 6; i++) {
      this.burst('bandpass', 300 + Math.random() * 900, 0.08 + Math.random() * 0.1, 0.22, i * 0.045 + Math.random() * 0.02, 1.2);
    }
    this.tone('sine', 110, 42, 0.3, 0.4);
  }

  coin(): void {
    this.tone('square', 988, 988, 0.07, 0.12);
    this.tone('square', 1319, 1319, 0.16, 0.12, 0.07);
  }

  /** Guard "?" blip. */
  question(): void {
    this.tone('triangle', 520, 780, 0.12, 0.25);
    this.tone('triangle', 780, 1040, 0.1, 0.18, 0.1);
  }

  /** Guard "!" alarm sting. */
  alarm(): void {
    this.tone('square', 1240, 1240, 0.09, 0.2);
    this.tone('square', 1660, 1660, 0.2, 0.2, 0.1);
  }

  /** Caught. */
  caught(): void {
    this.tone('sawtooth', 440, 110, 0.5, 0.25);
    this.tone('square', 220, 55, 0.6, 0.18, 0.05);
    this.burst('lowpass', 800, 0.35, 0.25, 0.02);
  }

  /** Wall down fanfare. */
  win(): void {
    const notes = [392, 494, 587, 784];
    notes.forEach((n, i) => this.tone('square', n, n, 0.2, 0.16, i * 0.11));
    this.tone('triangle', 784, 784, 0.5, 0.2, 0.44);
    this.tone('sine', 98, 49, 0.6, 0.4);
  }

  click(): void {
    this.tone('square', 320, 240, 0.045, 0.1);
  }

  buy(): void {
    this.tone('square', 659, 659, 0.08, 0.14);
    this.tone('square', 880, 880, 0.08, 0.14, 0.08);
    this.tone('square', 1319, 1319, 0.18, 0.14, 0.16);
  }

  deny(): void {
    this.tone('square', 160, 120, 0.14, 0.14);
  }

  // ---- ambience --------------------------------------------------------------

  /** Low ambient hum while a level is running. */
  startHum(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.hum) return;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(0.11, ctx.currentTime, 0.8);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.connect(gain).connect(this.master);

    const nodes: AudioScheduledSourceNode[] = [];
    for (const [freq, type, level] of [
      [55, 'sawtooth', 0.5],
      [82.5, 'sine', 0.5],
      [110.6, 'triangle', 0.25],
    ] as [number, OscillatorType, number][]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(filter);
      osc.start();
      nodes.push(osc);
    }
    // Slow wobble so it is a hum, not a tone.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    nodes.push(lfo);

    this.hum = { gain, nodes };
  }

  stopHum(): void {
    const ctx = this.ctx;
    if (!ctx || !this.hum) return;
    const { gain, nodes } = this.hum;
    gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
    for (const n of nodes) n.stop(ctx.currentTime + 0.8);
    this.hum = null;
  }
}
