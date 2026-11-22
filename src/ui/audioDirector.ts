// M9 / §11: procedurally synthesised audio (Web Audio API oscillators and
// noise bursts) instead of licensed/CC0 sample packs — same reasoning as
// src/ui/sprites.ts (no asset-sourcing tool available here; see
// docs/progress.md's M9 entry for the Option A/B tradeoff). This is
// presentation code (reacts to sim events; never imported by src/sim).
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
  private engine: { osc: OscillatorNode; gain: GainNode } | null = null;
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
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.05;
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    this.engine = { osc, gain };
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
   * of its own max speed — pitch and volume both rise with speed. */
  setEngineIntensity(speedFraction: number): void {
    if (!this.ctx || !this.engine) return;
    const clamped = Math.max(0, Math.min(1, speedFraction));
    this.engine.osc.frequency.setTargetAtTime(55 + clamped * 150, this.ctx.currentTime, 0.08);
    this.engine.gain.gain.setTargetAtTime(0.05 + clamped * 0.09, this.ctx.currentTime, 0.1);
  }

  playHorn(vehicleId: PlayableVehicleId): void {
    const freqs = vehicleId === 'motorcycle' ? [1100, 1450] : [480, 620];
    this.playTone(freqs, 0.22, 'square', 0.16);
  }

  playBrake(): void {
    this.playNoiseBurst(0.16, 2000, 0.1);
  }

  playCrash(intensity: CrashIntensity): void {
    const heavy = intensity === 'heavy';
    this.playNoiseBurst(heavy ? 0.4 : 0.22, heavy ? 250 : 650, heavy ? 0.28 : 0.16);
  }

  playBell(): void {
    this.playTone([1900, 2300], 0.16, 'sine', 0.1);
  }

  private playTone(freqs: number[], duration: number, type: OscillatorType, volume: number): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.connect(this.masterGain);
    const now = ctx.currentTime;
    const slice = duration / freqs.length;
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(gain);
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
