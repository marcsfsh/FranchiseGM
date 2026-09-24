/**
 * Seeded randomness (spec 8.9).
 *
 * One stream per league, with sub-streams per game, offseason phase, and AI decision. A sub-stream is
 * derived from the current advance seed and a key path, never from another stream's position, so
 * drawing more numbers in one area can't reshuffle another.
 *
 * Weighted seed: every advance mixes a variance nonce into the next advance seed. The nonce combines a
 * draw from the league stream, a digest of the user's actions since the last advance, and entropy the
 * app supplies. Fixed mode drops the nonce, so a base seed replays exactly.
 *
 * Generator: xoshiro128** (Blackman and Vigna), seeded through SplitMix32.
 */

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export type StreamKey = string | number;

const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));

function splitmix32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let t = s ^ (s >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** Murmur3-style hash of 32-bit words. Pure and stable across platforms. */
export function hashWords(words: readonly number[], seed = 0): number {
  let h = seed >>> 0;
  for (const word of words) {
    let k = Math.imul(word >>> 0, 0xcc9e2d51);
    k = rotl(k, 15);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = rotl(h, 13);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= words.length * 4;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Stable 32-bit hash of a string, for stream keys and action digests. */
export function hashString(text: string): number {
  const words: number[] = [];
  for (let i = 0; i < text.length; i++) words.push(text.charCodeAt(i));
  return hashWords(words, 0x5bd1e995);
}

const keyWord = (key: StreamKey): number =>
  typeof key === 'number' ? (Number.isInteger(key) ? key >>> 0 : hashString(String(key))) : hashString(key);

/** Combines seeds and keys into one 32-bit seed. */
export function mixSeed(seed: number, ...path: readonly StreamKey[]): number {
  return hashWords([seed >>> 0, ...path.map(keyWord)], 0x2545f491);
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number | RngState) {
    if (typeof seed === 'number') {
      const next = splitmix32(seed >>> 0);
      this.a = next() | 0;
      this.b = next() | 0;
      this.c = next() | 0;
      this.d = next() | 0;
      if ((this.a | this.b | this.c | this.d) === 0) this.a = 1;
    } else {
      this.a = seed.a | 0;
      this.b = seed.b | 0;
      this.c = seed.c | 0;
      this.d = seed.d | 0;
    }
  }

  /** A copy of the generator's position, for saving the league stream. */
  state(): RngState {
    return { a: this.a, b: this.b, c: this.c, d: this.d };
  }

  /** Next unsigned 32-bit integer. */
  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.b, 5), 7), 9) >>> 0;
    const t = this.b << 9;
    this.c ^= this.a;
    this.d ^= this.b;
    this.b ^= this.c;
    this.a ^= this.d;
    this.c ^= t;
    this.d = rotl(this.d, 11);
    return result;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Invalid integer range ${min}..${max}`);
    }
    return min + Math.floor(this.float() * (max - min + 1));
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.float() * (max - min);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.float() < p;
  }

  /** Normal draw (Box-Muller). */
  normal(mean = 0, sd = 1): number {
    const u = 1 - this.float();
    const v = this.float();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Cannot pick from an empty list');
    return items[Math.floor(this.float() * items.length)] as T;
  }

  /** Picks an index with probability proportional to its weight. Weights must be non-negative. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      if (!(w >= 0)) throw new RangeError('Weights must be non-negative numbers');
      total += w;
    }
    if (total <= 0) throw new RangeError('At least one weight must be positive');
    let roll = this.float() * total;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i] as number;
      if (roll < 0) return i;
    }
    for (let i = weights.length - 1; i >= 0; i--) if ((weights[i] as number) > 0) return i;
    return weights.length - 1;
  }

  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length !== weights.length) throw new RangeError('Items and weights differ in length');
    return items[this.weightedIndex(weights)] as T;
  }

  /** Fisher-Yates shuffle in place. Returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  /** A sub-stream keyed from a fresh draw of this stream. Use `stream()` for position-independent keys. */
  fork(...path: readonly StreamKey[]): Rng {
    return new Rng(mixSeed(this.nextU32(), ...path));
  }
}

/** A generator for a key path under a seed. The same seed and path always give the same sequence. */
export function stream(seed: number, ...path: readonly StreamKey[]): Rng {
  return new Rng(mixSeed(seed, ...path));
}

/** The league's randomness state. Saved with the league. */
export interface LeagueRandom {
  /** Chosen at league creation. */
  baseSeed: number;
  /** Fixed mode disables the variance nonce so results replay exactly (dev menu and tests). */
  fixed: boolean;
  /** Number of advances so far. */
  advance: number;
  /** Seed for everything simulated in the current advance period. */
  advanceSeed: number;
  /** The league stream. Weighted mode draws each advance's nonce from it. */
  league: RngState;
}

export function createLeagueRandom(baseSeed: number, fixed = false): LeagueRandom {
  const seed = baseSeed >>> 0;
  return {
    baseSeed: seed,
    fixed,
    advance: 0,
    advanceSeed: mixSeed(seed, 'advance', 0),
    league: new Rng(mixSeed(seed, 'league')).state()
  };
}

export interface AdvanceInput {
  /** Digest of the user's actions since the last advance (see `digestActions`). */
  actions: number;
  /** Entropy supplied by the app for this advance. Ignored in fixed mode. */
  entropy: number;
}

/** The variance nonce for the next advance. Zero in fixed mode. */
export function varianceNonce(
  random: LeagueRandom,
  input: AdvanceInput
): { nonce: number; league: RngState } {
  if (random.fixed) return { nonce: 0, league: random.league };
  const league = new Rng(random.league);
  const draw = league.nextU32();
  return { nonce: hashWords([draw, input.actions >>> 0, input.entropy >>> 0]), league: league.state() };
}

/** Moves to the next advance period. Each advance seed chains from the previous one and mixes in the
 * variance nonce unless fixed mode is on. */
export function advanceLeagueRandom(random: LeagueRandom, input: AdvanceInput): LeagueRandom {
  const { nonce, league } = varianceNonce(random, input);
  const advance = random.advance + 1;
  const advanceSeed = random.fixed
    ? mixSeed(random.advanceSeed, 'advance', advance)
    : mixSeed(random.advanceSeed, 'advance', advance, nonce);
  return { ...random, advance, advanceSeed, league };
}

/** The generator for one area of the current advance period, such as ('game', gameId). */
export function leagueStream(random: LeagueRandom, ...path: readonly StreamKey[]): Rng {
  return stream(random.advanceSeed, ...path);
}

/** Digest of user action records since the last advance. Order matters. */
export function digestActions(actions: readonly unknown[]): number {
  return hashString(JSON.stringify(actions));
}

/** A new 32-bit seed from the platform's cryptographic source, for new leagues and advance entropy. */
export function freshSeed(): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0] as number;
}
