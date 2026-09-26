/** Traits in words for the player page and the prospect details (spec 6.4). */
import type { Player } from '../../engine/model/player';
import type { Traits } from '../../engine/model/traits';

const TRAIT_TEXT: { [K in keyof Traits]?: (value: Traits[K]) => string | null } = {
  qbStyle: v => `${{ pocket: 'Pocket', balanced: 'Balanced', scrambling: 'Scrambling' }[v]} passer`,
  sensePressure: v =>
    ({
      paranoid: 'Paranoid under pressure',
      triggerHappy: 'Trigger-happy under pressure',
      ideal: 'Senses pressure',
      average: null,
      oblivious: 'Oblivious to pressure'
    })[v],
  forcesPasses: v => ({ conservative: 'Protects the ball', ideal: null, aggressive: 'Forces passes' })[v],
  coversBall: v =>
    ({
      never: 'Fumble prone',
      onBigHits: null,
      onMediumHits: 'Covers the ball on medium hits',
      forAllHits: 'Covers the ball on all hits',
      always: 'Always secures the ball'
    })[v],
  playsBall: v => ({ conservative: 'Plays the man', balanced: null, aggressive: 'Plays the ball' })[v],
  penalty: v => ({ disciplined: 'Disciplined', normal: null, undisciplined: 'Undisciplined' })[v],
  lbStyle: v => ({ passRush: 'Pass-rush linebacker', balanced: null, cover: 'Coverage linebacker' })[v],
  throwAway: v => (v ? 'Throws the ball away' : null),
  tightSpiral: v => (v ? 'Tight spiral' : null),
  fightForYards: v => (v ? 'Fights for yards' : null),
  feetInBounds: v => (v ? 'Feet in bounds' : null),
  dropsOpenPasses: v => (v ? 'Drops open passes' : null),
  possessionCatch: v => (v ? 'Possession catch' : null),
  aggressiveCatch: v => (v ? 'Aggressive catch' : null),
  yacCatch: v => (v ? 'YAC catch' : null),
  highMotor: v => (v ? 'High motor' : null),
  bigHitter: v => (v ? 'Big hitter' : null),
  stripsBall: v => (v ? 'Strips the ball' : null),
  clutch: v => (v ? 'Clutch' : null),
  predictable: v => (v ? 'Predictable' : null),
  dlSwim: v => (v ? 'Swim move' : null),
  dlSpin: v => (v ? 'Spin move' : null),
  dlBullRush: v => (v ? 'Bull rush' : null)
};

/** Traits worth showing: yes-or-no traits the player has, and style traits away from the middle. */
export function traitList(player: Player): string[] {
  const out: string[] = [];
  for (const [key, text] of Object.entries(TRAIT_TEXT) as [keyof Traits, (v: unknown) => string | null][]) {
    if (key === 'qbStyle' && player.position !== 'QB') continue;
    if ((key === 'sensePressure' || key === 'forcesPasses') && player.position !== 'QB') continue;
    if (key === 'lbStyle' && !['LOLB', 'MLB', 'ROLB'].includes(player.position)) continue;
    const line = text(player.traits[key]);
    if (line) out.push(line);
  }
  return out;
}
