import { describe, expect, it } from 'vitest';
import type { TeamAbbr } from '../../src/data/team-colors';
import type { League } from '../../src/engine/league/types';
import { stream } from '../../src/engine/rng';
import { gameScore, lineText, playersOfTheWeek } from '../../src/engine/season/awards';
import { addToInbox, INBOX_LIMIT, pausing, weekInbox, type InboxItem } from '../../src/engine/season/inbox';
import { addToTotals, weekNews } from '../../src/engine/season/news';
import { emptyLine, emptyTotals, type PlayerLine } from '../../src/engine/sim/stats';
import type { GameResult, InjuryEvent } from '../../src/engine/sim/types';
import { situationLeague } from '../helpers/situations';

const fresh = (): League => structuredClone(situationLeague);
const line = (change: Partial<PlayerLine>): PlayerLine => ({ ...emptyLine(), ...change });
const starterOf = (league: League, team: TeamAbbr, position: string) =>
  Object.values(league.players)
    .filter(p => p.team === team && p.status === 'active' && p.position === position)
    .sort((a, b) => b.ovr - a.ovr)[0]?.id as string;

/** A finished game with the given player lines. */
function game(
  home: TeamAbbr,
  away: TeamAbbr,
  score: [number, number],
  players: { home?: Record<string, PlayerLine>; away?: Record<string, PlayerLine> } = {},
  injuries: InjuryEvent[] = []
): GameResult {
  return {
    id: `${home}-${away}`,
    home,
    away,
    score: { home: score[0], away: score[1] },
    overtime: false,
    box: {
      home: { totals: emptyTotals(), players: players.home ?? {} },
      away: { totals: emptyTotals(), players: players.away ?? {} }
    },
    injuries
  } as unknown as GameResult;
}

describe('players of the week (spec 18.4)', () => {
  it('picks the best offensive, defensive, and special teams game in each conference', () => {
    const results = [
      game('MIN', 'GB', [31, 17], {
        home: {
          qb: line({ passAtt: 35, passCmp: 27, passYds: 342, passTd: 3 }),
          lb: line({ tackles: 9, sacks: 2 }),
          k: line({ fgAtt: 4, fgMade: 4, fgMade50: 1, fgLong: 52, xpAtt: 4, xpMade: 4 })
        },
        away: { rb: line({ rushAtt: 20, rushYds: 90 }) }
      }),
      game('KC', 'BUF', [20, 27], { home: { wr: line({ receptions: 11, recYds: 210, recTd: 2 }) } })
    ];
    const awards = playersOfTheWeek(2026, 3, results);
    const find = (conference: string, category: string) =>
      awards.find(a => a.conference === conference && a.category === category);
    expect(find('NFC', 'offense')?.playerId).toBe('qb');
    expect(find('NFC', 'offense')?.line).toBe('27 of 35 for 342 yards and 3 touchdown passes');
    expect(find('NFC', 'defense')?.playerId).toBe('lb');
    expect(find('NFC', 'special')?.line).toBe('4 of 4 field goals, long 52');
    expect(find('AFC', 'offense')?.playerId).toBe('wr');
    expect(find('AFC', 'offense')?.team).toBe('KC');
  });

  it('scores turnovers against a player and gives a small edge to winners', () => {
    const clean = gameScore.offense(line({ passYds: 250, passTd: 2 }));
    const sloppy = gameScore.offense(line({ passYds: 250, passTd: 2, passInt: 3 }));
    expect(sloppy).toBeLessThan(clean);
    expect(lineText('defense', line({ sacks: 1, defInt: 2, tackles: 5 }))).toBe(
      '1 sack, 2 interceptions, and 5 tackles'
    );
  });
});

describe('the news feed (spec 18.1)', () => {
  it('writes headlines from the week and marks upsets and milestones', () => {
    const league = fresh();
    const rusher = starterOf(league, 'MIN', 'HB');
    const results = [
      game('MIN', 'GB', [27, 24], { home: { [rusher]: line({ rushAtt: 28, rushYds: 190, rushTd: 2 }) } }),
      game('KC', 'BUF', [10, 38])
    ];
    const before = { [rusher]: { rushYds: 900 } };
    const after = addToTotals(before, results);
    expect(after[rusher]?.rushYds).toBe(1090);
    const news = weekNews(
      league,
      { week: 9, results, awards: [], before, after, moves: [] },
      stream(1, 'news')
    );
    const headlines = news.map(n => n.headline);
    expect(headlines.some(h => /Vikings .*Packers 27–24/.test(h))).toBe(true);
    expect(headlines.some(h => /Bills .*Chiefs 38–10/.test(h))).toBe(true);
    expect(news.some(n => n.kind === 'performance' && n.players.includes(rusher))).toBe(true);
    const milestone = news.find(n => n.kind === 'milestone');
    expect(milestone?.headline).toMatch(/1,000 rushing yards/);
    expect(news.every(n => !/'s' /.test(n.headline) && !/ a [AEIOUaeiou]/.test(n.headline))).toBe(true);
  });

  it("doesn't give a team the same headline template twice within four weeks", () => {
    const league = fresh();
    const results = [game('MIN', 'GB', [24, 17])];
    const templates = new Set<string>();
    for (let week = 1; week <= 3; week++) {
      const news = weekNews(
        league,
        { week, results, awards: [], before: {}, after: {}, moves: [] },
        stream(week, 'news')
      );
      league.season.news.push(...news);
      const result = news.find(n => n.kind === 'result');
      expect(templates.has(result?.template ?? '')).toBe(false);
      templates.add(result?.template ?? '');
    }
  });
});

describe('the inbox and pause rules (spec 19.6)', () => {
  it("reports the user's game and pauses for a starter's injury, not a backup's", () => {
    const league = fresh();
    const user = league.meta.start.userTeam;
    const starter = starterOf(league, user, 'QB');
    const backup = Object.values(league.players).find(p => p.team === user && p.position === 'WR')
      ?.id as string;
    const injuries: InjuryEvent[] = [
      { playerId: starter, team: user, severity: 'medium', weeks: 3, bodyPart: 'ankle' } as InjuryEvent,
      { playerId: backup, team: user, severity: 'minor', weeks: 1, bodyPart: 'knee' } as InjuryEvent
    ];
    const results = [
      game(
        user,
        'GB',
        [20, 23],
        { home: { [starter]: line({ started: 1, passAtt: 30 }), [backup]: line({}) } },
        injuries
      )
    ];
    league.season.results[results[0]?.id ?? ''] = {
      id: results[0]?.id ?? '', week: 1, home: user, away: 'GB', homeScore: 20, awayScore: 23, homeTd: 2, awayTd: 3,
      playoff: false, overtime: false
    }; // prettier-ignore
    const items = weekInbox(league, { week: 1, results, awards: [], news: [] });
    expect(items[0]?.title).toMatch(/^Loss against the Packers, 20–23$/);
    expect(items[0]?.body).toBe('Your record is 0–1.');
    const hurt = items.filter(i => i.kind === 'injury');
    expect(hurt).toHaveLength(2);
    expect(hurt.find(i => i.players.includes(starter))?.event).toBe('starterInjuries');
    expect(hurt.find(i => i.players.includes(backup))?.event).toBeNull();
    expect(hurt[0]?.body).toMatch(/^An ankle injury/);
    expect(pausing(items, league.settings.pause)).toHaveLength(1);
    expect(pausing(items, { ...league.settings.pause, starterInjuries: false })).toHaveLength(0);
  });

  it('keeps the inbox to its limit by dropping the oldest read messages', () => {
    const item = (i: number, read: boolean): InboxItem => ({
      id: String(i), season: 2026, week: 1, kind: 'result', event: null, title: '', body: '', read, players: []
    }); // prettier-ignore
    const old = Array.from({ length: INBOX_LIMIT }, (_, i) => item(i, i % 2 === 0));
    const next = addToInbox(old, [item(1000, false), item(1001, false)]);
    expect(next).toHaveLength(INBOX_LIMIT);
    expect(next.some(i => i.id === '0')).toBe(false);
    expect(next.some(i => i.id === '1')).toBe(true);
    expect(next.at(-1)?.id).toBe('1001');
  });
});
