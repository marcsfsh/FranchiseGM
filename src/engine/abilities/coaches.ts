/**
 * Coach abilities (spec 13.1, 7.6). Some open up trigger situations for their side of the ball, which
 * makes players' abilities trigger more often; some boost players with a trait; development abilities
 * take effect with player development (M10). Starter catalog, recorded in DECISIONS.md.
 */
import type { Position } from '../model/positions';
import type { StaffMember, StaffRole } from '../model/staff';
import type { Traits } from '../model/traits';
import type { PlayTrigger } from '../schemes/situations';

export interface CoachAbility {
  id: string;
  name: string;
  /** Staff roles that can hold it; it works for the team only while the holder is in one of these roles. */
  roles: readonly StaffRole[];
  description: string;
  /** Trigger situations the coach creates more of, by side of the ball. */
  triggers?: { side: 'offense' | 'defense'; trigger: PlayTrigger; multiplier: number }[];
  /** Role rating points for players with a trait. */
  traits?: {
    trait: keyof Traits;
    value: string | boolean;
    points: number;
    positions: readonly Position[];
    label: string;
  }[];
  /** Offseason progression bonus for a position (applies from M10). */
  development?: { positions: readonly Position[]; points: number };
}

const OFFENSE_SKILL: readonly Position[] = ['HB', 'FB', 'WR', 'TE'];
const EVERYONE: readonly Position[] = [
  'QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'LE', 'RE', 'DT', 'LOLB', 'MLB', 'ROLB', 'CB', 'FS', 'SS'
]; // prettier-ignore
const RUSHERS: readonly Position[] = ['LE', 'RE', 'DT', 'LOLB', 'ROLB'];

export const COACH_ABILITIES: readonly CoachAbility[] = [
  {
    id: 'qbWhisperer',
    name: 'QB Whisperer',
    roles: ['HC', 'OC', 'QBC'],
    description: 'Quarterbacks gain 2 extra progression points each offseason.',
    development: { positions: ['QB'], points: 2 }
  },
  {
    id: 'verticalArchitect',
    name: 'Vertical Architect',
    roles: ['HC', 'OC'],
    description: 'Designs more deep shots and play-action looks.',
    triggers: [
      { side: 'offense', trigger: 'deepPass', multiplier: 1.25 },
      { side: 'offense', trigger: 'playAction', multiplier: 1.15 }
    ]
  },
  {
    id: 'runGameGuru',
    name: 'Run Game Guru',
    roles: ['HC', 'OC', 'OLC', 'RBC'],
    description: 'Builds the offense around the run game and its blocking angles.',
    triggers: [
      { side: 'offense', trigger: 'insideRun', multiplier: 1.15 },
      { side: 'offense', trigger: 'outsideRun', multiplier: 1.15 }
    ]
  },
  {
    id: 'screenDesigner',
    name: 'Screen Designer',
    roles: ['OC', 'RBC', 'WRC'],
    description: 'Gets playmakers the ball in space.',
    triggers: [{ side: 'offense', trigger: 'openField', multiplier: 1.2 }]
  },
  {
    id: 'pressureDesigner',
    name: 'Pressure Designer',
    roles: ['HC', 'DC', 'LBC', 'DLC'],
    description: 'Dials up pressure from every angle.',
    triggers: [{ side: 'defense', trigger: 'passRush', multiplier: 1.15 }]
  },
  {
    id: 'coverageProfessor',
    name: 'Coverage Professor',
    roles: ['DC', 'DBC'],
    description: 'Teaches zone spacing and eyes on the quarterback.',
    triggers: [
      { side: 'defense', trigger: 'versusZone', multiplier: 1.15 },
      { side: 'defense', trigger: 'deepPass', multiplier: 1.1 }
    ]
  },
  {
    id: 'islandBuilder',
    name: 'Island Builder',
    roles: ['DC', 'DBC'],
    description: 'Trusts his corners in man coverage.',
    triggers: [{ side: 'defense', trigger: 'versusMan', multiplier: 1.2 }]
  },
  {
    id: 'disciplinarian',
    name: 'Disciplinarian',
    roles: ['HC'],
    description: 'Undisciplined players commit fewer penalties.',
    traits: [
      {
        trait: 'penalty',
        value: 'undisciplined',
        points: 1,
        positions: EVERYONE,
        label: 'penalties coached out'
      }
    ]
  },
  {
    id: 'ballSecurity',
    name: 'Ball Security',
    roles: ['HC', 'RBC'],
    description: 'Fumble-prone ball carriers learn to protect the ball.',
    traits: [
      {
        trait: 'coversBall',
        value: 'never',
        points: 1,
        positions: OFFENSE_SKILL,
        label: 'ball security coaching'
      }
    ]
  },
  {
    id: 'passRushTechnician',
    name: 'Pass Rush Technician',
    roles: ['DC', 'DLC'],
    description: 'Sharpens the moves of rushers who already have them.',
    traits: [
      { trait: 'dlSwim', value: true, points: 1, positions: RUSHERS, label: 'rush move coaching' },
      { trait: 'dlSpin', value: true, points: 1, positions: RUSHERS, label: 'rush move coaching' },
      { trait: 'dlBullRush', value: true, points: 1, positions: RUSHERS, label: 'rush move coaching' }
    ]
  }
];

const BY_ID = new Map(COACH_ABILITIES.map(a => [a.id, a]));

export const coachAbility = (id: string): CoachAbility | undefined => BY_ID.get(id);

/** What a team's staff abilities do to its players' role ratings. */
export interface CoachEffects {
  offense: Partial<Record<PlayTrigger, number>>;
  defense: Partial<Record<PlayTrigger, number>>;
  traits: NonNullable<CoachAbility['traits']>;
  /** The abilities in effect, with the coach who holds each. */
  sources: { ability: CoachAbility; coach: StaffMember }[];
}

export const NO_COACH_EFFECTS: CoachEffects = { offense: {}, defense: {}, traits: [], sources: [] };

/**
 * Combines the abilities of a team's staff. Trigger multipliers from different coaches multiply; the
 * same ability held twice counts once.
 */
export function coachEffects(staff: readonly StaffMember[]): CoachEffects {
  const effects: CoachEffects = { offense: {}, defense: {}, traits: [], sources: [] };
  const seen = new Set<string>();
  for (const coach of staff) {
    for (const id of coach.abilities) {
      const ab = BY_ID.get(id);
      if (!ab || seen.has(id) || !ab.roles.includes(coach.role)) continue;
      seen.add(id);
      effects.sources.push({ ability: ab, coach });
      for (const t of ab.triggers ?? []) {
        const side = effects[t.side];
        side[t.trigger] = (side[t.trigger] ?? 1) * t.multiplier;
      }
      effects.traits.push(...(ab.traits ?? []));
    }
  }
  return effects;
}
