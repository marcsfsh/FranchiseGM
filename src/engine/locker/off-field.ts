/**
 * Off-field events (spec 10.9; D-59), while the setting is on. Each regular-season week a player on an
 * active roster may be suspended under the policy on performance-enhancing drugs (the rule set's games for
 * a first violation) or the conduct policy (more likely for the volatile), and a player on a roster or a
 * practice squad may turn up in the news in a legal matter (flavor, with no discipline) or do charity work
 * that counts toward the Man of the Year. A suspended player goes on the suspended list, off the active
 * roster and unpaid, and returns to it once his team has played the games.
 */
import { TEAM_COLORS, type TeamAbbr } from '../../data/team-colors';
import { recordTransaction } from '../league/transactions';
import type { League } from '../league/types';
import { fullName, type Player } from '../model/player';
import type { Rng } from '../rng';
import { plural } from '../text';
import { TUNING } from '../tuning';

const O = TUNING.offField;

/** An off-field event, for the inbox and the news. */
export interface OffFieldEvent {
  player: Player;
  team: TeamAbbr;
  kind: 'ped' | 'conduct' | 'legal' | 'charity' | 'reinstated';
  /** A suspension's games. */
  games?: number;
}

/** A trait's weight: 0.5 at 0, 1.5 at 100. */
const weigh = (trait: number): number => 0.5 + trait / 100;

/** Puts a player on the suspended list for `games` games. */
function suspend(
  league: League,
  player: Player,
  team: TeamAbbr,
  reason: 'ped' | 'conduct',
  games: number
): void {
  player.suspension = { games, reason };
  player.status = 'suspended';
  recordTransaction(league, team, 'suspended', player.id, reason === 'ped' ? `${plural(games, 'game')} under the drug policy` : `${plural(games, 'game')} under the conduct policy`); // prettier-ignore
}

/**
 * A game week's off-field events (spec 10.9): suspensions served for the games `played`, then, in the
 * regular season (`fresh`), the week's new events. Returns what happened.
 */
export function offFieldWeek(
  league: League,
  played: ReadonlySet<TeamAbbr>,
  fresh: boolean,
  rng: Rng
): OffFieldEvent[] {
  const events: OffFieldEvent[] = [];
  const players = Object.values(league.players).sort((a, b) => (a.id < b.id ? -1 : 1));
  // Suspensions count down by the games each team played; one a player carried to a new team starts there.
  for (const p of players) {
    const s = p.suspension;
    if (!s || !p.team || !played.has(p.team)) continue;
    if (p.status === 'active') p.status = 'suspended';
    if (p.status !== 'suspended') continue;
    s.games--;
    if (s.games > 0) continue;
    p.status = 'active';
    delete p.suspension;
    recordTransaction(league, p.team, 'reinstated', p.id, 'his suspension served');
    events.push({ player: p, team: p.team, kind: 'reinstated' });
  }
  if (!fresh || !league.settings.drama.offField) return events;
  for (const p of players) {
    const team = p.team;
    if (!team || (p.status !== 'active' && p.status !== 'practice')) continue;
    const traits = p.personality;
    const active = p.status === 'active';
    if (active && rng.float() < O.ped) {
      const games = league.rules.roster.pedSuspensionGames;
      suspend(league, p, team, 'ped', games);
      events.push({ player: p, team, kind: 'ped', games });
    } else if (active && rng.float() < O.conduct * weigh(traits.volatility)) {
      const games = rng.int(O.conductGames[0], O.conductGames[1]);
      suspend(league, p, team, 'conduct', games);
      events.push({ player: p, team, kind: 'conduct', games });
    } else if (rng.float() < O.legal * weigh(traits.volatility)) {
      events.push({ player: p, team, kind: 'legal' });
    } else if (rng.float() < O.charity * weigh(traits.leadership) * weigh(traits.socialActivity)) {
      p.community = (p.community ?? 0) + 1;
      events.push({ player: p, team, kind: 'charity' });
    }
  }
  return events;
}

const nick = (team: TeamAbbr): string => TEAM_COLORS[team].name;
const named = (p: Player): string => `${fullName(p)} (${p.position})`;

/** An off-field event in the user's inbox, or null for another team's or a charity event. */
export function offFieldMessage(league: League, e: OffFieldEvent): { title: string; body: string } | null {
  if (e.team !== league.meta.start.userTeam) return null;
  const who = named(e.player);
  const games = plural(e.games ?? 0, 'game');
  switch (e.kind) {
    case 'ped':
      return { title: `${who} is suspended ${games}`, body: `He violated the league's policy on performance-enhancing drugs. He's on the suspended list, off your active roster and unpaid, until you've played ${games}.` };
    case 'conduct':
      return { title: `${who} is suspended ${games}`, body: `He violated the league's personal conduct policy. He's on the suspended list, off your active roster and unpaid, until you've played ${games}.` };
    case 'legal':
      return { title: `${who} is in the news off the field`, body: 'He faces a legal matter away from football. The league is looking into it; no discipline has come of it.' };
    case 'reinstated':
      return { title: `${who} is back from his suspension`, body: 'He returns to your active roster; a move may be needed to keep it within the limit.' };
    case 'charity':
      return null;
  }
} // prettier-ignore

/** An off-field event's headline, for a player rated `newsFrom` or more; null for the rest. */
export function offFieldHeadline(e: OffFieldEvent): string | null {
  if (e.player.ovr < O.newsFrom) return null;
  const who = named(e.player);
  switch (e.kind) {
    case 'ped':
      return `${who} of the ${nick(e.team)} is suspended ${plural(e.games ?? 0, 'game')} under the drug policy`;
    case 'conduct':
      return `${who} of the ${nick(e.team)} is suspended ${plural(e.games ?? 0, 'game')} under the conduct policy`;
    case 'legal':
      return `${who} of the ${nick(e.team)} faces a legal matter off the field`;
    case 'charity':
      return `${who} of the ${nick(e.team)} is honored for his charity work`;
    case 'reinstated':
      return null;
  }
}
