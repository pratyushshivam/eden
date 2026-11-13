/**
 * The sound of the place, made on the spot: wind, water, rain, crickets at
 * night and the odd bird by day. No files.
 */
export class Sound {
  muted: boolean;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: GainNode | null = null;
  private windTone: BiquadFilterNode | null = null;
  private water: GainNode | null = null;
  private rain: GainNode | null = null;
  private nextChirp = 0;
  private nextBird = 0;

  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("eden.mute");
    } catch {
      // Private mode: no memory, sound on.
    }
    this.muted = saved === "1";
  }

  /** Must be called from a tap or a key press: browsers will not start sound otherwise. */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = (this.ctx = new Ctor());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);
    // Two seconds of noise, looped, shaped three ways.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.04 * white) / 1.04;
      d[i] = last * 3 + white * 0.25;
    }
    const layer = (type: BiquadFilterType, freq: number, q: number): { gain: GainNode; filter: BiquadFilterNode } => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master as GainNode);
      src.start();
      return { gain, filter };
    };
    const w = layer("bandpass", 420, 0.6);
    this.wind = w.gain;
    this.windTone = w.filter;
    this.water = layer("highpass", 1400, 0.3).gain;
    this.rain = layer("bandpass", 3200, 0.5).gain;
  }

  toggle(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem("eden.mute", this.muted ? "1" : "0");
    } catch {
      // Nothing to do.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.1);
    return this.muted;
  }

  /**
   * @param night 0..1  @param rain 0..1  @param nearWater 0..1, how close the view is to water
   * @param close 0..1, how far zoomed in  @param cold true in deep cold (no crickets)
   */
  update(night: number, rain: number, nearWater: number, close: number, cold: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.wind || !this.water || !this.rain || !this.windTone) return;
    const t = ctx.currentTime;
    const gust = 0.5 + 0.5 * Math.sin(t * 0.23) * Math.sin(t * 0.071 + 1);
    this.wind.gain.setTargetAtTime(0.1 + 0.16 * gust * (1.2 - close * 0.6) + rain * 0.1, t, 0.4);
    this.windTone.frequency.setTargetAtTime(320 + 260 * gust, t, 0.6);
    this.water.gain.setTargetAtTime(0.012 + 0.06 * nearWater * (0.3 + close), t, 0.5);
    this.rain.gain.setTargetAtTime(rain * 0.3, t, 0.4);
    if (this.muted) return;
    if (night > 0.6 && rain < 0.2 && !cold && t > this.nextChirp) {
      this.nextChirp = t + 0.35 + Math.random() * 1.6;
      this.chirp(4100 + Math.random() * 500, 3, 0.012 + close * 0.02);
    }
    if (night < 0.2 && rain < 0.3 && t > this.nextBird) {
      this.nextBird = t + 2.5 + Math.random() * 7;
      this.bird(0.02 + close * 0.03);
    }
  }

  private chirp(freq: number, pulses: number, vol: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0;
    const t = ctx.currentTime;
    for (let i = 0; i < pulses; i++) {
      g.gain.setValueAtTime(0, t + i * 0.055);
      g.gain.linearRampToValueAtTime(vol, t + i * 0.055 + 0.012);
      g.gain.linearRampToValueAtTime(0, t + i * 0.055 + 0.04);
    }
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + pulses * 0.055 + 0.05);
  }

  private bird(vol: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 1800 + Math.random() * 1400;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const s = t + i * 0.13;
      o.frequency.setValueAtTime(base * (1 + i * 0.08), s);
      o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.3), s + 0.08);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(vol, s + 0.02);
      g.gain.linearRampToValueAtTime(0, s + 0.1);
      o.connect(g).connect(this.master);
      o.start(s);
      o.stop(s + 0.12);
    }
  }
}
