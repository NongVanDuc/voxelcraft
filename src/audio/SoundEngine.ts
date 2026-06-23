import { Block } from '../blocks/blockTypes';

type Material = 'stone' | 'dirt' | 'grass' | 'wood' | 'sand' | 'leaves' | 'glass';

function materialOf(id: number): Material {
  switch (id) {
    case Block.STONE: case Block.COBBLESTONE: case Block.COAL_ORE:
    case Block.IRON_ORE: case Block.BEDROCK: return 'stone';
    case Block.DIRT: return 'dirt';
    case Block.GRASS: case Block.SNOW: return 'grass';
    case Block.OAK_LOG: case Block.PLANKS: return 'wood';
    case Block.SAND: case Block.GRAVEL: return 'sand';
    case Block.OAK_LEAVES: return 'leaves';
    case Block.GLASS: return 'glass';
    default: return 'dirt';
  }
}

// Per-material tone for break/step/place (centre frequency + filter).
const MAT: Record<Material, { freq: number; filter: number; type: OscillatorType }> = {
  stone: { freq: 130, filter: 2200, type: 'square' },
  dirt: { freq: 90, filter: 900, type: 'triangle' },
  grass: { freq: 110, filter: 1400, type: 'triangle' },
  wood: { freq: 150, filter: 1700, type: 'square' },
  sand: { freq: 80, filter: 700, type: 'triangle' },
  leaves: { freq: 200, filter: 3000, type: 'sawtooth' },
  glass: { freq: 600, filter: 5000, type: 'square' },
};

/** Procedural Web Audio SFX — no asset files, all synthesized. */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  enabled = true;

  /** Must be called from a user gesture (play button click). */
  resume(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise(0.4);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private now(): number { return this.ctx!.currentTime; }

  private noise(dur: number, filterFreq: number, gain: number, q = 0.7): void {
    if (!this.ctx || !this.master) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    const t = this.now();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, freqEnd?: number): void {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    const t = this.now();
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur);
  }

  blockBreak(id: number): void {
    if (!this.enabled || !this.ctx) return;
    const m = MAT[materialOf(id)];
    this.noise(0.18, m.filter, 0.6);
    this.tone(m.freq, 0.16, m.type, 0.18, m.freq * 0.6);
  }

  blockPlace(id: number): void {
    if (!this.enabled || !this.ctx) return;
    const m = MAT[materialOf(id)];
    this.noise(0.1, m.filter * 0.8, 0.4);
    this.tone(m.freq * 0.9, 0.1, m.type, 0.15, m.freq * 0.7);
  }

  footstep(id: number): void {
    if (!this.enabled || !this.ctx) return;
    const m = MAT[materialOf(id)];
    this.noise(0.07, m.filter * 0.6, 0.16, 0.5);
  }

  hurt(): void {
    if (!this.enabled || !this.ctx) return;
    this.tone(260, 0.22, 'square', 0.25, 90);
  }

  pickup(): void {
    if (!this.enabled || !this.ctx) return;
    this.tone(520, 0.07, 'square', 0.12, 660);
    this.tone(720, 0.07, 'square', 0.1, 880);
  }

  eat(): void {
    if (!this.enabled || !this.ctx) return;
    this.noise(0.12, 800, 0.3, 1.2);
  }

  uiClick(): void {
    if (!this.enabled || !this.ctx) return;
    this.tone(440, 0.05, 'square', 0.12);
  }

  splash(): void {
    if (!this.enabled || !this.ctx) return;
    this.noise(0.3, 1600, 0.35, 0.4);
  }
}
