/**
 * Trigger situations and situation profiles (spec 7.4, 7.5). A profile gives, for each depth chart slot,
 * the share of that slot's snaps in each situation. Profiles are estimated from tendencies here; M4
 * replaces the estimates with profiles measured by running the sim, cached per scheme.
 */
import { TUNING } from '../tuning';
import {
  DEFENSE_SLOTS,
  OFFENSE_SLOTS,
  SPECIAL_SLOTS,
  offenseSnapShares,
  type DefenseSlot,
  type OffenseSlot,
  type Slot,
  type SpecialSlot
} from './slots';
import { passShare, type DefenseTendencies, type OffenseTendencies, type TargetSlot } from './tendencies';

/** What the player is doing on the snap. */
export const PLAY_TRIGGERS = [
  'openField', 'contactAtLine', 'insideRun', 'outsideRun', 'carry', 'dropback', 'target', 'shortPass',
  'deepPass', 'contestedCatch', 'playAction', 'passRush', 'facingBlitz', 'coverage', 'versusMan',
  'versusZone', 'outsidePocket', 'kick'
] as const; // prettier-ignore

/** When it happens. An ability with contexts triggers only on its play situations in those contexts. */
export const CONTEXT_TRIGGERS = ['redZone', 'thirdDown', 'twoMinute', 'lateAndClose', 'badWeather'] as const;

export type PlayTrigger = (typeof PLAY_TRIGGERS)[number];
export type ContextTrigger = (typeof CONTEXT_TRIGGERS)[number];
export type Trigger = PlayTrigger | ContextTrigger;

export const TRIGGER_LABELS: Record<Trigger, string> = {
  openField: 'in the open field',
  contactAtLine: 'contact at the line',
  insideRun: 'inside runs',
  outsideRun: 'outside runs',
  carry: 'carries',
  dropback: 'dropbacks',
  target: 'targets',
  shortPass: 'short passes',
  deepPass: 'deep passes',
  contestedCatch: 'contested catches',
  playAction: 'play action',
  passRush: 'pass rush snaps',
  facingBlitz: 'against the blitz',
  coverage: 'coverage snaps',
  versusMan: 'man coverage',
  versusZone: 'zone coverage',
  outsidePocket: 'outside the pocket',
  kick: 'kicks',
  redZone: 'in the red zone',
  thirdDown: 'on third down',
  twoMinute: 'in the two-minute drill',
  lateAndClose: 'late in close games',
  badWeather: 'in bad weather'
};

/** Share of a slot's snaps in each play situation. */
export type SituationShares = Record<PlayTrigger, number>;
export type ContextShares = Record<ContextTrigger, number>;

export type OffenseProfile = Record<OffenseSlot, SituationShares>;
export type DefenseProfile = Record<DefenseSlot, SituationShares>;

const S = TUNING.situations;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function shares(values: Partial<SituationShares>): SituationShares {
  const out = Object.fromEntries(PLAY_TRIGGERS.map(t => [t, 0])) as SituationShares;
  for (const [key, value] of Object.entries(values)) out[key as PlayTrigger] = clamp01(value);
  return out;
}

/** Game contexts are the same share of every role's snaps in the estimates. */
export const CONTEXT_SHARES: ContextShares = {
  redZone: S.redZone,
  thirdDown: S.downMix.thirdShort + S.downMix.thirdLong,
  twoMinute: S.twoMinute,
  lateAndClose: S.lateAndClose,
  badWeather: S.badWeather
};

/** Estimated offensive profile from the scheme's tendencies. */
export function estimateOffenseProfile(t: OffenseTendencies): OffenseProfile {
  const pass = passShare(t, S.downMix);
  const run = 1 - pass;
  const snaps = offenseSnapShares(t, S.rb1Share);
  const { insideZone, outsideZone, power, counter, draw } = t.runConcepts;
  const inside = insideZone + power + draw + counter * S.counterInside;
  const outside = outsideZone + counter * (1 - S.counterInside);
  const gap = power + counter;
  const deep = t.deepShots;
  const short = Math.max(0, 1 - deep - S.intermediateShare);
  const attempts = pass * S.attemptShare;
  const blocking = { insideRun: run * inside, outsideRun: run * outside, contactAtLine: run };

  const receiver = (slot: TargetSlot): Partial<SituationShares> => {
    const onField = snaps[slot];
    const target = onField > 0 ? Math.min(1, (attempts * t.targets[slot]) / onField) : 0;
    const routes = pass * S.routeShare[slot];
    return {
      target,
      shortPass: target * Math.min(1, short * S.shortBias[slot]),
      deepPass: target * Math.min(1, deep * S.deepBias[slot]),
      contestedCatch: target * (S.contestedShare + deep * S.deepBias[slot] * S.contestedDeep),
      openField: target * S.catchOpenField * (1 + t.screen),
      versusMan: routes * S.leagueMan,
      versusZone: routes * (1 - S.leagueMan),
      playAction: routes * t.playAction,
      passRush: pass - routes,
      facingBlitz: pass * S.leagueBlitz
    };
  };

  const back = (slot: 'RB1' | 'RB2'): SituationShares => {
    const carry = run * (1 - t.qbRuns) * S.backCarryShare;
    const catching = receiver(slot);
    return shares({
      ...catching,
      carry,
      insideRun: carry * inside,
      outsideRun: carry * outside,
      openField: carry * (S.openFieldBase + S.openFieldOutside * outside) + (catching.openField ?? 0),
      contactAtLine: carry * (S.contactBase + S.contactGap * gap),
      playAction: pass * t.playAction
    });
  };

  const line = shares({
    ...blocking,
    passRush: pass * (1 - t.screen * S.screenRelease),
    facingBlitz: pass * S.leagueBlitz,
    playAction: pass * t.playAction
  });

  const profile = {} as OffenseProfile;
  profile.QB = shares({
    dropback: pass,
    shortPass: attempts * short,
    deepPass: attempts * deep,
    contestedCatch: attempts * S.contestedShare,
    playAction: pass * t.playAction,
    facingBlitz: pass * S.leagueBlitz,
    versusMan: pass * S.leagueMan,
    versusZone: pass * (1 - S.leagueMan),
    outsidePocket:
      pass *
        (S.outsidePocketBase +
          S.outsidePocketPlayAction * t.playAction +
          S.outsidePocketScramble * t.scramble) +
      run * t.qbRuns,
    carry: run * t.qbRuns,
    openField: run * t.qbRuns * S.openFieldBase + pass * t.scramble * S.outsidePocketScramble
  });
  profile.RB1 = back('RB1');
  profile.RB2 = back('RB2');
  const fbCarry = run * S.fullbackCarryShare;
  profile.FB = shares({ ...receiver('FB'), ...blocking, carry: fbCarry, contactAtLine: run });
  for (const slot of ['X', 'Z', 'SLOT'] as const)
    profile[slot] = shares({ ...receiver(slot), outsideRun: run * outside });
  for (const slot of ['TE1', 'TE2'] as const) profile[slot] = shares({ ...receiver(slot), ...blocking });
  for (const slot of ['LT', 'LG', 'C', 'RG', 'RT'] as const) profile[slot] = { ...line };
  return profile;
}

type DefenseGroup = keyof typeof S.defenseGroups;

const DEFENSE_GROUP: Record<DefenseSlot, DefenseGroup> = {
  LEDGE: 'edge', REDGE: 'edge', DT1: 'interior', DT2: 'interior', FLEX: 'flex', MIKE: 'mike', WILL: 'will',
  CB1: 'corner', CB2: 'corner', NCB: 'nickel', DIME: 'dime', FS: 'free', SS: 'strong'
}; // prettier-ignore

/** Estimated defensive profile from the scheme's tendencies, against a league-average offense. */
export function estimateDefenseProfile(t: DefenseTendencies): DefenseProfile {
  const pass = S.leaguePass;
  const run = 1 - pass;
  const attempts = pass * S.attemptShare;
  const short = 1 - S.leagueDeep - S.intermediateShare;
  const { cover1, cover2, cover3, cover4, cover6 } = t.shells;
  const singleHigh = cover1 + cover3;
  const twoHigh = cover2 + cover4 + cover6;
  const profile = {} as DefenseProfile;
  for (const slot of DEFENSE_SLOTS) {
    const g = S.defenseGroups[DEFENSE_GROUP[slot]];
    const rushShare = clamp01(
      (t.front === 3 ? g.rush3 : g.rush4) + g.blitz * t.blitz + g.sim * t.simPressure
    );
    const rushes = pass * rushShare;
    const covers = pass - rushes;
    profile[slot] = shares({
      passRush: rushes,
      coverage: covers,
      versusMan: covers * t.man,
      versusZone: covers * (1 - t.man),
      deepPass: attempts * S.leagueDeep * (g.deep + g.single * singleHigh + g.two * twoHigh),
      shortPass: covers * S.attemptShare * short * g.short * S.defenderShare,
      contestedCatch: attempts * S.contestedShare * g.contested * S.defenderShare,
      openField: (run + pass * S.openFieldPass) * g.openField * S.openFieldScale,
      insideRun: run * S.leagueInside * g.inside,
      outsideRun: run * (1 - S.leagueInside) * g.outside,
      contactAtLine: run * (g.atLine + g.penetration * t.runFit),
      playAction: covers * S.leaguePlayAction
    });
  }
  return profile;
}

const SP = S.special;

/** Special teams roles see the same situations in every scheme until M21's special teams philosophies. */
export const SPECIAL_PROFILE: Record<SpecialSlot, SituationShares> = {
  K: shares({ kick: 1 }),
  P: shares({ kick: 1 }),
  LS: shares({}),
  KR: shares({ carry: 1, openField: SP.kickReturnOpenField, contactAtLine: SP.kickReturnContact }),
  PR: shares({ carry: 1, openField: SP.puntReturnOpenField, contestedCatch: SP.puntReturnContested }),
  GUNNER: shares({ openField: SP.gunnerOpenField, coverage: 1 })
};

/** A slot's profile in a pair of offense and defense profiles. */
export function slotShares(offense: OffenseProfile, defense: DefenseProfile, slot: Slot): SituationShares {
  if ((OFFENSE_SLOTS as readonly string[]).includes(slot)) return offense[slot as OffenseSlot];
  if ((SPECIAL_SLOTS as readonly string[]).includes(slot)) return SPECIAL_PROFILE[slot as SpecialSlot];
  return defense[slot as DefenseSlot];
}
