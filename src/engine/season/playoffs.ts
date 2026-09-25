/**
 * The playoff bracket (spec 5.3): the top seeds' byes, re-seeding after every round so the best seed left
 * plays the worst, the higher seed at home, and a Super Bowl at a neutral site.
 */
import { superBowlNumber } from '../../data/super-bowl';
import type { Conference, TeamAbbr } from '../../data/teams';

export interface Seed {
  abbr: TeamAbbr;
  seed: number;
  conference: Conference;
}

export interface PlayoffGame {
  /** 1 for the first round; the Super Bowl is the last. */
  round: number;
  /** Null for the Super Bowl. */
  conference: Conference | null;
  home: TeamAbbr;
  away: TeamAbbr;
  homeSeed: number;
  awaySeed: number;
}

/** First-round byes in a conference: the top seeds that fill the bracket out to a power of two. */
export const byes = (field: number): number => 2 ** Math.ceil(Math.log2(Math.max(1, field))) - field;

/** Rounds in a conference before the Super Bowl. */
export const conferenceRounds = (field: number): number => Math.ceil(Math.log2(Math.max(1, field)));

/**
 * One round's games in a conference, from the seeds still alive: the best seed left hosts the worst, the
 * next best the next worst, and so on. In the first round the byes sit out.
 */
export function conferenceRound(alive: readonly Seed[], round: number, field: number): PlayoffGame[] {
  const sorted = [...alive].sort((a, b) => a.seed - b.seed);
  const playing = round === 1 ? sorted.slice(byes(field)) : sorted;
  const games: PlayoffGame[] = [];
  for (let i = 0; i < Math.floor(playing.length / 2); i++) {
    const high = playing[i] as Seed;
    const low = playing[playing.length - 1 - i] as Seed;
    games.push({
      round,
      conference: high.conference,
      home: high.abbr,
      away: low.abbr,
      homeSeed: high.seed,
      awaySeed: low.seed
    });
  }
  return games;
}

/**
 * The Super Bowl between the conference champions. The designated home team alternates by the game's
 * number: the NFC in odd-numbered Super Bowls, the AFC in even-numbered ones.
 */
export function superBowl(afc: Seed, nfc: Seed, season: number, round: number): PlayoffGame {
  const [home, away] = superBowlNumber(season) % 2 === 1 ? [nfc, afc] : [afc, nfc];
  return {
    round,
    conference: null,
    home: home.abbr,
    away: away.abbr,
    homeSeed: home.seed,
    awaySeed: away.seed
  };
}
