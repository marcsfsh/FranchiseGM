/** Generated coaches, staff, and owners for every team (spec 6.6), since the Madden file covers players only. */
import type { TeamAbbr } from '../../data/team-colors';
import type { Rng } from '../rng';
import { DEFENSE_SCHEMES, OFFENSE_SCHEMES } from '../schemes/ids';
import {
  STAFF_RATING_KEYS,
  emptyRecord,
  type CoachTendencies,
  type Owner,
  type StaffMember,
  type StaffRole
} from '../model/staff';
import { TUNING } from '../tuning';
import { weightedDraw, type GenContext } from './player';

const S = TUNING.staff;

const clamp = (value: number) => Math.max(1, Math.min(99, Math.round(value)));

function staffName(ctx: GenContext, age: number): { firstName: string; lastName: string; birthDate: string } {
  const { rng, names } = ctx;
  const month = rng.int(1, 12);
  const day = rng.int(1, 28);
  const year = ctx.season - age;
  // Coaches were born before the name data starts; use its earliest bucket.
  const bucket = Math.max(
    0,
    Math.min(names.first.buckets.length - 1, Math.floor((year - (names.first.buckets[0] ?? 1975)) / 5))
  );
  for (let attempt = 0; attempt < 40; attempt++) {
    const firstName = names.first.names[weightedDraw(rng, names.first.weights[bucket] as number[])] as string;
    const lastName = names.surnames.names[weightedDraw(rng, names.surnames.weights)] as string;
    if (!ctx.usedNames.has(`${firstName} ${lastName}`)) {
      ctx.usedNames.add(`${firstName} ${lastName}`);
      return {
        firstName,
        lastName,
        birthDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      };
    }
  }
  throw new Error('Could not find an unused staff name');
}

function tendencies(rng: Rng): CoachTendencies {
  return {
    aggressiveness: clamp(rng.normal(50, 18)),
    passLean: clamp(rng.normal(55, 15)),
    clockManagement: clamp(rng.normal(55, 15)),
    youthLean: clamp(rng.normal(50, 20)),
    rigidity: clamp(rng.normal(50, 18)),
    playerRelationships: clamp(rng.normal(55, 16)),
    personnelPower: clamp(rng.normal(45, 20))
  };
}

const REGIONS = ['Northeast', 'Southeast', 'South', 'Midwest', 'Southwest', 'West'];

export function generateStaffMember(ctx: GenContext, role: StaffRole, team: TeamAbbr | null): StaffMember {
  const { rng } = ctx;
  const [ageMean, ageSd] = S.age[role];
  const age = Math.max(28, Math.min(75, Math.round(rng.normal(ageMean, ageSd))));
  const quality = rng.normal();
  const ratings: Record<string, number> = {};
  for (const key of STAFF_RATING_KEYS[role])
    ratings[key] = clamp(S.ratingMean + S.ratingSd * (0.7 * quality + 0.71 * rng.normal()));
  const values = Object.values(ratings);
  const overall = clamp(values.reduce((a, b) => a + b, 0) / values.length);
  const coach = ['HC', 'OC', 'DC'].includes(role);
  const [salaryLow, salaryHigh] = S.salary[role];
  const salary = Math.round((salaryLow + (salaryHigh - salaryLow) * (overall / 99) ** 2) / 10_000) * 10_000;
  const name = staffName(ctx, age);
  return {
    id: ctx.newId(),
    ...name,
    role,
    team,
    ratings,
    overall,
    abilities: [],
    offenseScheme: role === 'HC' || role === 'OC' ? rng.pick(OFFENSE_SCHEMES) : null,
    defenseScheme: role === 'HC' || role === 'DC' ? rng.pick(DEFENSE_SCHEMES) : null,
    personality: {
      riskTolerance: clamp(rng.normal(50, 18)),
      patience: clamp(rng.normal(50, 18)),
      loyalty: clamp(rng.normal(50, 18)),
      analyticsLean: clamp(rng.normal(50, 20)),
      ambition: clamp(rng.normal(55, 18))
    },
    tendencies: role === 'HC' ? tendencies(rng) : null,
    contract: { years: rng.int(1, coach ? 5 : 3), salary },
    record: emptyRecord(),
    yearsInRole: Math.max(0, Math.min(age - 30, Math.round(rng.range(0, (age - 30) / (coach ? 2.5 : 1.5))))),
    region: role === 'SCOUT' ? rng.pick(REGIONS) : null
  };
}

/** The roles every team fills, with scouts repeated. */
export const TEAM_STAFF: readonly StaffRole[] = [
  'HC', 'OC', 'DC', 'STC', 'QBC', 'RBC', 'WRC', 'TEC', 'OLC', 'DLC', 'LBC', 'DBC', 'DOS', 'DOP', 'GM',
  'SCOUT', 'SCOUT', 'SCOUT', 'SCOUT'
]; // prettier-ignore

export function generateTeamStaff(ctx: GenContext, team: TeamAbbr): StaffMember[] {
  const staff = TEAM_STAFF.map(role => generateStaffMember(ctx, role, team));
  // Coordinators usually run the head coach's scheme on his side of the ball.
  const hc = staff[0] as StaffMember;
  for (const member of staff) {
    if (member.role === 'OC' && ctx.rng.chance(S.coordinatorMatchesHead))
      member.offenseScheme = hc.offenseScheme;
    if (member.role === 'DC' && ctx.rng.chance(S.coordinatorMatchesHead))
      member.defenseScheme = hc.defenseScheme;
  }
  return staff;
}

export function generateOwner(ctx: GenContext, team: TeamAbbr): Owner {
  const { rng } = ctx;
  const age = Math.max(35, Math.min(92, Math.round(rng.normal(66, 11))));
  const name = staffName(ctx, age);
  return {
    id: ctx.newId(),
    ...name,
    team,
    wealth: rng.weighted([1, 2, 3, 4, 5], [10, 25, 30, 25, 10]),
    personality: {
      patience: clamp(rng.normal(50, 20)),
      meddling: clamp(rng.normal(40, 20)),
      spending: clamp(rng.normal(55, 18)),
      relocationAppetite: clamp(rng.normal(20, 15)),
      tradition: clamp(rng.normal(55, 20)),
      competitiveness: clamp(rng.normal(60, 18))
    }
  };
}
