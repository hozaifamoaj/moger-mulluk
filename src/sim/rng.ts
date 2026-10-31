// §12.5 Seeded randomness: mulberry32. Same seed + same calls = same sequence.
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max], inclusive of both ends. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** One random element of a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
}
