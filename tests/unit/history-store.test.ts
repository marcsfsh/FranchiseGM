import { describe, expect, it } from 'vitest';
import type { TeamAbbr } from '../../src/data/team-colors';
import type { ContractRecord } from '../../src/engine/contracts/history';
import { emptyTotals } from '../../src/engine/sim/stats';
import type { GameRecord } from '../../src/engine/stats/record';
import { appendRows, emptyTable, encodeTable, type StatRow } from '../../src/engine/stats/table';
import { HistoryStore } from '../../src/storage/history';

const row = (playerId: string, gameId: string, team: TeamAbbr, values: Record<string, number>): StatRow => ({
  playerId,
  gameId,
  team,
  kind: 'regular',
  values
});

const game = (id: string, home: TeamAbbr, away: TeamAbbr, score: [number, number]): GameRecord =>
  ({
    id,
    home,
    away,
    season: Number(id.slice(0, 4)),
    week: Number(id.slice(5, 7)),
    kind: 'regular',
    score: { home: score[0], away: score[1] },
    totals: {
      home: { ...emptyTotals(), points: score[0], totalYards: 300 },
      away: { ...emptyTotals(), points: score[1], totalYards: 250 }
    }
  }) as unknown as GameRecord;

// The in-memory store (used when IndexedDB is blocked) answers the League screens' queries (spec 19.3).
describe('history queries for the League section', () => {
  it("reads a season's player totals, team stats, and one game's lines", async () => {
    const store = new HistoryStore(null);
    const rushing = appendRows(emptyTable(2026, 'rushing', ['rushAtt', 'rushYds']), [
      row('p1', '2026-01-GB-MIN', 'MIN', { rushAtt: 20, rushYds: 90 }),
      row('p2', '2026-01-GB-MIN', 'GB', { rushAtt: 12, rushYds: 40 }),
      row('p1', '2026-02-MIN-CHI', 'MIN', { rushAtt: 18, rushYds: 70 })
    ]);
    await store.importHistory('L', {
      tables: [encodeTable(rushing)],
      games: [
        game('2026-01-GB-MIN', 'MIN', 'GB', [24, 17]),
        game('2026-02-MIN-CHI', 'CHI', 'MIN', [10, 20]),
        game('2025-05-MIN-DET', 'DET', 'MIN', [3, 30])
      ],
      players: [],
      seasons: [],
      records: null
    });
    const totals = await store.seasonPlayerTotals('L', 2026);
    expect(totals.find(t => t.playerId === 'p1')).toEqual({
      playerId: 'p1',
      team: 'MIN',
      games: 2,
      totals: { rushAtt: 38, rushYds: 160 }
    });
    const teams = await store.teamStats('L', 2026);
    expect(teams.find(t => t.team === 'MIN')).toMatchObject({ games: 2, pointsFor: 44, pointsAgainst: 27 });
    const lines = await store.gameLines('L', 2026, '2026-01-GB-MIN');
    expect(lines.map(l => l.row.playerId)).toEqual(['p1', 'p2']);
    expect(await store.careerPlayerTotals('L')).toEqual([]);
  });
});

describe('contract history (D-35)', () => {
  it("adds deals that left the league to their players' histories, once each", async () => {
    const store = new HistoryStore(null);
    const record = (id: string, playerId: string, signed: number): ContractRecord => ({
      id,
      playerId,
      team: 'MIN',
      type: 'veteran',
      signed,
      from: signed,
      to: signed + 1,
      years: 2,
      total: 4_000_000,
      apy: 2_000_000,
      guaranteed: 1_000_000,
      capShare: 0.0066,
      ended: 'expired',
      endedYear: signed + 1
    });
    await store.recordContracts('L', [
      record('c2', 'p1', 2028),
      record('c1', 'p1', 2026),
      record('c3', 'p2', 2027)
    ]);
    await store.recordContracts('L', [record('c1', 'p1', 2026)]);
    expect((await store.playerHistory('L', 'p1'))?.contracts?.map(c => c.id)).toEqual(['c1', 'c2']);
    expect(await store.playerHistory('L', 'p2')).toMatchObject({
      id: 'p2',
      seasons: [],
      contracts: [{ id: 'c3' }]
    });
    expect(await store.playerHistory('M', 'p1')).toBeNull();
  });
});
