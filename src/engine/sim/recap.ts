/**
 * Recap v1 (spec 8.8): two to four paragraphs from templates, built from the result: who won and how,
 * the top performers, the turning point, and injuries.
 */
import type { PlayerLine } from './stats';
import type { GameResult, GameSetup, ScoringPlay, Side, SimPlayer } from './types';

const QUARTER_NAMES = ['first quarter', 'second quarter', 'third quarter', 'fourth quarter', 'overtime'];

function clockText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function top(
  lines: Record<string, PlayerLine>,
  players: Record<string, SimPlayer>,
  key: keyof PlayerLine
): { player: SimPlayer; line: PlayerLine } | null {
  let best: { player: SimPlayer; line: PlayerLine } | null = null;
  for (const [id, line] of Object.entries(lines)) {
    const player = players[id];
    if (player && line[key] > 0 && (!best || line[key] > best.line[key])) best = { player, line };
  }
  return best;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The biggest deficit the winner overcame, from the scoring summary. */
function comeback(scoring: readonly ScoringPlay[], winnerHome: boolean): number {
  let worst = 0;
  for (const s of scoring) worst = Math.max(worst, winnerHome ? s.away - s.home : s.home - s.away);
  return worst;
}

export function recap(result: GameResult, setup: GameSetup): string[] {
  const { home, away } = setup;
  const h = result.score.home;
  const a = result.score.away;
  const venue = setup.venue.name;
  const paragraphs: string[] = [];
  const ot = result.overtime ? ' in overtime' : '';
  if (h === a) {
    paragraphs.push(`The ${home.name} and the ${away.name} played to a ${h}-${a} tie at ${venue}.`);
  } else {
    const winSide: Side = h > a ? 'home' : 'away';
    const win = winSide === 'home' ? home : away;
    const lose = winSide === 'home' ? away : home;
    const ws = Math.max(h, a);
    const ls = Math.min(h, a);
    const margin = ws - ls;
    const verb = margin >= 21 ? 'rolled past' : margin <= 3 ? 'edged' : 'beat';
    const where = winSide === 'home' ? `at ${venue}` : `on the road at ${venue}`;
    let first = `The ${win.name} ${verb} the ${lose.name} ${ws}-${ls}${ot} ${where}.`;
    const behind = comeback(result.scoring, winSide === 'home');
    if (behind >= 10) first += ` They came back from ${behind} points down.`;
    paragraphs.push(first);

    // Top performers on the winning side, then the loser's best passer.
    const box = result.box[winSide].players;
    const players = win.players;
    const notes: string[] = [];
    const qb = top(box, players, 'passYds');
    if (qb)
      notes.push(
        `${qb.player.name} threw for ${qb.line.passYds} yards${qb.line.passTd ? ` and ${plural(qb.line.passTd, 'touchdown')}` : ''}${qb.line.passInt ? ` with ${plural(qb.line.passInt, 'interception')}` : ''}`
      );
    const rb = top(box, players, 'rushYds');
    if (rb && rb.line.rushYds >= 60)
      notes.push(`${rb.player.name} ran for ${rb.line.rushYds} yards on ${rb.line.rushAtt} carries`);
    const wr = top(box, players, 'recYds');
    if (wr && wr.line.recYds >= 70)
      notes.push(
        `${wr.player.name} caught ${plural(wr.line.receptions, 'pass', 'passes')} for ${wr.line.recYds} yards`
      );
    const sacker = top(box, players, 'sacks');
    if (sacker && sacker.line.sacks >= 2) notes.push(`${sacker.player.name} had ${sacker.line.sacks} sacks`);
    if (notes.length) {
      const last = notes.pop() as string;
      paragraphs.push(`${notes.length ? `${notes.join('; ')}; and ${last}` : last}.`);
    }

    // The turning point: the score that put the winner ahead for good.
    let decisive: ScoringPlay | null = null;
    for (const s of result.scoring) {
      const winLead = winSide === 'home' ? s.home - s.away : s.away - s.home;
      const before = winLead - (s.team === win.abbr ? s.points : -s.points);
      if (winLead > 0 && before <= 0) decisive = s;
    }
    if (decisive) {
      const quarter = QUARTER_NAMES[Math.min(decisive.quarter, 5) - 1] ?? 'overtime';
      paragraphs.push(
        `The go-ahead score for good came with ${clockText(decisive.clock)} left in the ${quarter}: ${decisive.description}.`
      );
    }
  }

  const hurt = result.injuries.filter(i => i.severity !== 'minor');
  if (hurt.length) {
    const names = hurt.slice(0, 3).map(i => {
      const p = home.players[i.playerId] ?? away.players[i.playerId];
      return `${p?.name ?? 'A player'} (${i.bodyPart})`;
    });
    paragraphs.push(`Injuries: ${names.join(', ')} left the game.`);
  }
  return paragraphs.slice(0, 4);
}
