/**
 * New leagues (spec 3.2). On the no-CSV path the only data source is the fictional league: the 32 real
 * franchises with generated players, coaches, staff, and owners. The league starts at week 1 of the
 * 2026 regular season with rosters set.
 */
import { defaultRotation, NEUTRAL_PLAN } from '../sim/plan';
import { generateClass } from '../draft/class';
import { issuePicks } from '../draft/picks';
import { defaultDraftSettings } from '../draft/settings';
import { defaultDevelopment } from '../progression/settings';
import { defaultTraining } from '../progression/training';
import { defaultPauses } from '../season/inbox';
import { emptySeason } from '../season/state';
import type { ScheduledGame } from '../../data/schedule';
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { generateFictionalLeague } from '../generate/league';
import type { NameData } from '../generate/player';
import { createLeagueRandom, stream } from '../rng';
import { DEFAULT_RULES, type RuleSet } from '../rules/ruleset';
import type { StaffRole } from '../model/staff';
import { coordinatorFit } from '../fit/cohesion';
import { DEFENSE_SCHEMES, OFFENSE_SCHEMES } from '../schemes/ids';
import { named, type TeamSchemes } from '../schemes/resolve';
import { defaultSliders } from '../sim/sliders';
import { TUNING } from '../tuning';
import { newId } from './transactions';
import { SAVE_SCHEMA_VERSION, type League, type StartOptions, type TeamState } from './types';

export interface NewLeagueInput {
  /** Unique save ID, supplied by the app. */
  id: string;
  name: string;
  start: StartOptions;
  gameVersion: string;
  names: NameData;
  schedule: readonly ScheduledGame[];
  rules?: RuleSet;
  /** Fixed mode for tests and the dev menu (spec 8.9). */
  fixed?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export class LeagueCreationError extends Error {}

const byId = <T extends { id: string }>(items: readonly T[]): Record<string, T> =>
  Object.fromEntries(items.map(item => [item.id, item]));

/** Next free number for each ID prefix, from IDs like p2508. */
function idCounters(ids: readonly string[]): Record<string, number> {
  const next: Record<string, number> = {};
  for (const id of ids) {
    const match = /^([a-z]+)(\d+)$/.exec(id);
    if (!match) continue;
    const prefix = match[1] as string;
    next[prefix] = Math.max(next[prefix] ?? 1, Number(match[2]) + 1);
  }
  return next;
}

export function createLeague(input: NewLeagueInput): League {
  const { start } = input;
  if (start.dataSource !== 'fictional') {
    throw new LeagueCreationError(
      "Real-data leagues need the Madden roster file, which this build doesn't include."
    );
  }
  if (start.startingRosters !== 'actual') {
    throw new LeagueCreationError('Fantasy drafts arrive in a later build.');
  }
  if (!TEAM_ABBRS.includes(start.userTeam)) throw new LeagueCreationError(`Unknown team ${start.userTeam}.`);
  const name = input.name.trim() || 'My league';
  const rules = input.rules ?? DEFAULT_RULES;
  const generated = generateFictionalLeague({
    seed: start.seed,
    season: start.startSeason,
    names: input.names,
    rules,
    ...(input.onProgress ? { onTeam: input.onProgress } : {})
  });

  const teams = {} as Record<TeamAbbr, TeamState>;
  for (const abbr of TEAM_ABBRS) {
    const owner = generated.owners.find(o => o.team === abbr);
    if (!owner) throw new LeagueCreationError(`No owner generated for ${abbr}.`);
    const members = generated.staff.filter(s => s.team === abbr);
    const staff: Partial<Record<StaffRole, string[]>> = {};
    for (const member of members) (staff[member.role] ??= []).push(member.id);
    // The head coach runs his preferred schemes (spec 7.6); coordinators who prefer others lose morale.
    const hc = members.find(m => m.role === 'HC');
    const schemes: TeamSchemes = {
      offense: named(hc?.offenseScheme ?? OFFENSE_SCHEMES[0]),
      defense: named(hc?.defenseScheme ?? DEFENSE_SCHEMES[0])
    };
    for (const member of members) {
      const mismatch = coordinatorFit(member, schemes);
      if (mismatch) member.morale = Math.max(0, member.morale + mismatch.morale);
    }
    teams[abbr] = {
      abbr,
      ownerId: owner.id,
      staff,
      schemes,
      resting: [],
      depth: { auto: true, order: {} },
      plan: { auto: true, plan: { ...NEUTRAL_PLAN } },
      rotation: defaultRotation(TUNING.situations.rb1Share),
      training: defaultTraining(),
      carryover: 0,
      spending: []
    };
  }

  const league: League = {
    schema: SAVE_SCHEMA_VERSION,
    meta: { id: input.id, name, start: { ...start }, edited: false, createdBy: input.gameVersion },
    date: { season: start.startSeason, phase: 'regularSeason', week: 1 },
    random: createLeagueRandom(start.seed, input.fixed ?? false),
    rules: structuredClone(rules),
    caps: { [start.startSeason]: rules.cap.amount },
    settings: {
      version: 1,
      fitCap: TUNING.fit.cap,
      sim: defaultSliders(),
      pause: defaultPauses(),
      auto: { roster: false, contracts: false, scouting: true, draft: false },
      development: defaultDevelopment(),
      draft: defaultDraftSettings(),
      commissioner: { enforceRules: true }
    },
    teams,
    players: byId(generated.players),
    contracts: byId(generated.contracts),
    staff: byId(generated.staff),
    owners: byId(generated.owners),
    schedule: input.schedule.filter(g => g.season === start.startSeason).map(g => ({ ...g })),
    seedSchedule: input.schedule.filter(g => g.season === start.startSeason).map(g => ({ ...g })),
    upcoming: null,
    preseason: null,
    season: emptySeason(start.startSeason),
    draft: null,
    picks: [1, 2, 3].flatMap(ahead => issuePicks(rules.season.draftRounds, start.startSeason + ahead)),
    draftGrades: null,
    udfaOffers: {},
    inbox: [],
    waivers: [],
    nextId: idCounters([
      ...generated.players.map(p => p.id),
      ...generated.contracts.map(c => c.id),
      ...generated.staff.map(s => s.id),
      ...generated.owners.map(o => o.id)
    ])
  };
  // The next spring's draft class, to scout all season (spec 10.3).
  const year = start.startSeason + 1;
  const rng = stream(start.seed, 'draftClass', year);
  league.draft = generateClass(
    league,
    year,
    { names: input.names, rng, newId: () => newId(league, 'p') },
    rng
  );
  return league;
}

/** Defaults for the start-only choices (spec 3.2). */
export function defaultStartOptions(userTeam: TeamAbbr, seed: number): StartOptions {
  return {
    dataSource: 'fictional',
    startingRosters: 'actual',
    userTeam,
    startSeason: 2026,
    seed,
    relocation: 'user',
    rebrand: 'user',
    styleDrift: true,
    aiOwnersProposeRules: true
  };
}
