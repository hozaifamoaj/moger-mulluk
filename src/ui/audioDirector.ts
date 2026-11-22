// M9 / §11: procedurally synthesised audio (Web Audio API oscillators and
// noise bursts) instead of licensed/CC0 sample packs — same reasoning as
// src/ui/sprites.ts (no asset-sourcing tool available here; see
// docs/progress.md's M9 entry for the Option A/B tradeoff). This is
// presentation code (reacts to sim events; never imported by src/sim).
//
// Every tone/engine voice is routed through a lowpass filter before the
// gain stage — a raw oscillator's full harmonic series (particularly
// sawtooth/square) reads as a harsh, buzzy, "pinching" digital tone at
// typical game volume; filtering off the upper harmonics is the standard
// game-audio technique for making a synthesised engine/horn read as a
// rounder, more realistic sound instead.
import type { PlayableVehicleId } from '../sim/types';

let sharedCtx: AudioContext | null | undefined;

function getContext(): AudioContext | null {
  if (sharedCtx !== undefined) return sharedCtx;
  try {
    sharedCtx = new AudioContext();
  } catch {
    sharedCtx = null;
  }
  return sharedCtx;
}

export type CrashIntensity = 'light' | 'heavy';

interface EngineVoice {
  osc: OscillatorNode;
  sub: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

/**
 * Owns one GameScene run's worth of continuous sounds (engine, ambience)
 * plus one-shot triggers (horn, brake, crash, rickshaw bell). A fresh
 * instance is created per GameScene.create() and torn down on scene
 * shutdown — GameScene itself is a persistent Phaser scene instance reused
 * across restarts, so the continuous nodes must not be double-started.
 * All browsers' AudioContext is memoized at module scope since only a
 * handful may exist per page.
 */
export class AudioDirector {
  private readonly ctx: AudioContext | null;
  private readonly masterGain: GainNode | null;
  private engine: EngineVoice | null = null;
  private ambience: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  constructor(enabled: boolean) {
    this.ctx = getContext();
    this.masterGain = this.ctx ? this.ctx.createGain() : null;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.value = enabled ? 1 : 0;
      this.masterGain.connect(this.ctx.destination);
    }
  }

  setEnabled(enabled: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(enabled ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  /** Browsers suspend new AudioContexts until a user gesture; the Play/pause
   * flows already involve a click/tap, so resuming there is enough. */
  resume(): void {
    void this.ctx?.resume();
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  start(): void {
    this.startEngine();
    this.startAmbience();
  }

  private startEngine(): void {
    if (!this.ctx || !this.masterGain || this.engine) return;
    const ctx = this.ctx;

    // Two voices layered — a sawtooth for harmonic "grit" plus a sine an
    // octave below for low-end body — reads as a rounder engine note than
    // either alone, and is far less of a single piercing tone.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 27.5;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0.05;

    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(this.masterGain);
    osc.start();
    sub.start();
    this.engine = { osc, sub, filter, gain };
  }

  private startAmbience(): void {
    if (!this.ctx || !this.masterGain || this.ambience) return;
    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer(this.ctx, 2);
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 350;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.035;
    source.connect(filter).connect(gain).connect(this.masterGain);
    source.start();
    this.ambience = { source, gain };
  }

  /** Called every render frame with the player's speed as a 0..1 fraction
   * of its own max speed — pitch, filter brightness and volume all rise
   * with speed, mimicking a real engine's rising note and growing presence
   * of higher harmonics as revs climb, instead of just getting louder. */
  setEngineIntensity(speedFraction: number): void {
    if (!this.ctx || !this.engine) return;
    const clamped = Math.max(0, Math.min(1, speedFraction));
    const now = this.ctx.currentTime;
    const baseFreq = 55 + clamped * 150;
    this.engine.osc.frequency.setTargetAtTime(baseFreq, now, 0.08);
    this.engine.sub.frequency.setTargetAtTime(baseFreq / 2, now, 0.08);
    this.engine.filter.frequency.setTargetAtTime(220 + clamped * 500, now, 0.08);
    this.engine.gain.gain.setTargetAtTime(0.05 + clamped * 0.07, now, 0.1);
  }

  playHorn(vehicleId: PlayableVehicleId): void {
    const freqs = vehicleId === 'motorcycle' ? [950, 1250] : [480, 620];
    this.playTone(freqs, 0.22, 'square', 0.13, 2400);
  }

  playBrake(): void {
    this.playNoiseBurst(0.16, 1700, 0.09);
  }

  playCrash(intensity: CrashIntensity): void {
    const heavy = intensity === 'heavy';
    this.playNoiseBurst(heavy ? 0.4 : 0.22, heavy ? 220 : 550, heavy ? 0.24 : 0.14);
  }

  playBell(): void {
    this.playTone([1900, 2300], 0.16, 'sine', 0.1, 4000);
  }

  private playTone(freqs: number[], duration: number, type: OscillatorType, volume: number, lowpassFreq: number): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpassFreq;
    const gain = ctx.createGain();
    filter.connect(gain).connect(this.masterGain);
    const now = ctx.currentTime;
    const slice = duration / freqs.length;
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(filter);
      const start = now + i * slice;
      osc.start(start);
      osc.stop(start + slice + 0.02);
    });
    gain.gain.setValueAtTime(volume, now);
    gain.gain.linearRampToValueAtTime(0, now + duration);
  }

  private playNoiseBurst(duration: number, lowpassFreq: number, volume: number): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx, duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpassFreq;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    source.connect(filter).connect(gain).connect(this.masterGain);
    source.start();
    source.stop(now + duration);
  }

  /** Stops the continuous nodes so a GameScene restart (same scene
   * instance) can safely start fresh ones. */
  teardown(): void {
    this.engine?.osc.stop();
    this.engine?.sub.stop();
    this.engine = null;
    this.ambience?.source.stop();
    this.ambience = null;
  }
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.ceil(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
