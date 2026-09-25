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

/** Draws each trait from its [mean, sd] in the table. */
function traits<K extends string>(
  rng: Rng,
  table: Readonly<Record<K, readonly [number, number]>>
): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const key of Object.keys(table) as K[]) {
    const [mean, sd] = table[key];
    out[key] = clamp(rng.normal(mean, sd));
  }
  return out;
}

const tendencies = (rng: Rng): CoachTendencies => traits(rng, S.tendencies);

const REGIONS = ['Northeast', 'Southeast', 'South', 'Midwest', 'Southwest', 'West'];

export function generateStaffMember(ctx: GenContext, role: StaffRole, team: TeamAbbr | null): StaffMember {
  const { rng } = ctx;
  const [ageMean, ageSd] = S.age[role];
  const age = Math.max(S.ageRange[0], Math.min(S.ageRange[1], Math.round(rng.normal(ageMean, ageSd))));
  const quality = rng.normal();
  const ratings: Record<string, number> = {};
  for (const key of STAFF_RATING_KEYS[role])
    ratings[key] = clamp(
      S.ratingMean +
        S.ratingSd * (S.ratingLoading * quality + Math.sqrt(1 - S.ratingLoading ** 2) * rng.normal())
    );
  const values = Object.values(ratings);
  const overall = clamp(values.reduce((a, b) => a + b, 0) / values.length);
  const coach = ['HC', 'OC', 'DC'].includes(role);
  const [salaryLow, salaryHigh] = S.salary[role];
  const salary = Math.round((salaryLow + (salaryHigh - salaryLow) * (overall / 99) ** 2) / 10_000) * 10_000;
  const name = staffName(ctx, age);
  const contractYears = coach ? S.coachContractYears : S.staffContractYears;
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
    personality: traits(rng, S.personality),
    tendencies: role === 'HC' ? tendencies(rng) : null,
    morale: S.startMorale,
    contract: { years: rng.int(contractYears[0], contractYears[1]), salary },
    record: emptyRecord(),
    yearsInRole: Math.max(
      0,
      Math.min(
        age - S.firstJobAge,
        Math.round(
          rng.range(0, (age - S.firstJobAge) / (coach ? S.coachTenureDivisor : S.staffTenureDivisor))
        )
      )
    ),
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
  const age = Math.max(
    S.ownerAgeRange[0],
    Math.min(S.ownerAgeRange[1], Math.round(rng.normal(S.ownerAge[0], S.ownerAge[1])))
  );
  const name = staffName(ctx, age);
  return {
    id: ctx.newId(),
    ...name,
    team,
    wealth: rng.weighted([1, 2, 3, 4, 5], S.ownerWealthWeights),
    personality: traits(rng, S.owner)
  };
}
