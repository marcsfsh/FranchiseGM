/**
 * Prospects as the user sees them (spec 10.4), for the Scouting screen and the draft room: the rows of the
 * user's board, grades as the ranges they could still move, workout drills, and what the team has learned
 * about a prospect for his details dialog.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { ability } from '../../engine/abilities/catalog';
import type { DraftClass, Measurables, Prospect } from '../../engine/draft/class';
import { mediaBoard, roundProjector } from '../../engine/draft/media';
import { revealed, teamGrades, type Grade } from '../../engine/draft/scouting';
import type { League } from '../../engine/league/types';
import { calendarDay } from '../../engine/model/calendar';
import { ageOn, type Personality, type Player } from '../../engine/model/player';
import { TUNING } from '../../engine/tuning';
import { h } from '../dom';
import { ordinal } from '../format';
import { heightText, stat } from './players';
import { traitList } from './traits';

const S = TUNING.draft.scouting;

/** The workout drills (spec 10.4): each one's label, title, and how its results read. */
export const DRILLS: readonly {
  key: keyof Measurables;
  label: string;
  title: string;
  /** The result in a table cell, and in words. */
  cell: (v: number) => string;
  words: (v: number) => string;
  /** Timed drills: the lowest time is the best. */
  timed?: boolean;
}[] = [
  { key: 'forty', label: '40 (s)', title: '40-yard dash, seconds', cell: v => v.toFixed(2), words: v => `${v.toFixed(2)} seconds`, timed: true },
  { key: 'bench', label: 'Bench (reps)', title: 'Bench press, reps at 225 pounds', cell: String, words: v => `${v} reps` },
  { key: 'vertical', label: 'Vertical (in)', title: 'Vertical jump, inches', cell: v => v.toFixed(1), words: v => `${v.toFixed(1)} inches` },
  { key: 'broad', label: 'Broad (ft, in)', title: 'Broad jump, feet and inches', cell: heightText, words: heightText },
  { key: 'cone', label: '3-cone (s)', title: '3-cone drill, seconds', cell: v => v.toFixed(2), words: v => `${v.toFixed(2)} seconds`, timed: true },
  { key: 'shuttle', label: 'Shuttle (s)', title: 'Short shuttle, seconds', cell: v => v.toFixed(2), words: v => `${v.toFixed(2)} seconds`, timed: true }
]; // prettier-ignore

const CHARACTER: readonly [keyof Personality, string][] = [
  ['workEthic', 'Work ethic'],
  ['competitiveness', 'Competitiveness'],
  ['leadership', 'Leadership'],
  ['ego', 'Ego'],
  ['volatility', 'Volatility'],
  ['loyalty', 'Loyalty'],
  ['greed', 'Greed'],
  ['mediaStyle', 'Outspoken with the media'],
  ['socialActivity', 'Social life']
];
const level = (v: number): string =>
  v >= 80 ? 'Very high' : v >= 60 ? 'High' : v > 40 ? 'Average' : v > 20 ? 'Low' : 'Very low';

/** A prospect as the user's board shows him. */
export interface BoardRow {
  prospect: Prospect;
  player: Player;
  /** His place on the user's board, by grade, from 1. */
  rank: number;
  grade: Grade;
  /** His place on the media's big board, from 1, and the round it projects. */
  media: number;
  round: number | null;
  age: number;
  visited: boolean;
}

/**
 * The class on the user's board, best grade first. The media's places are its big board's, or once the draft
 * opens its final board's (D-48).
 */
export function boardRows(league: League, draft: DraftClass, abbr: TeamAbbr): BoardRow[] {
  const grades = teamGrades(league, draft, abbr);
  const media = new Map((draft.board ?? mediaBoard(draft).map(p => p.player.id)).map((id, i) => [id, i + 1]));
  const project = roundProjector(league, draft.year);
  const today = calendarDay(league.date);
  const visits = new Set(draft.scouting[abbr].visits);
  const graded = draft.prospects.map(prospect => ({ prospect, grade: grades.get(prospect.player.id) as Grade }));
  graded.sort((a, b) => b.grade.value - a.grade.value || (a.prospect.player.id < b.prospect.player.id ? -1 : 1));
  return graded.map(({ prospect, grade }, i) => {
    const id = prospect.player.id;
    const m = media.get(id) ?? draft.prospects.length;
    return { prospect, player: prospect.player, rank: i + 1, grade, media: m, round: project(m), age: ageOn(prospect.player.birthDate, today), visited: visits.has(id) };
  });
} // prettier-ignore

/** A grade as the range it could still move, on the ratings scale. */
export function rangeOf(g: Grade): [low: number, high: number] {
  const clamp = (x: number) => Math.max(0, Math.min(99, Math.round(x)));
  return [clamp(g.value - g.spread), clamp(g.value + g.spread)];
}

/** "66–78", read as "66 to 78". */
export function gradeText(g: Grade): HTMLElement {
  const [low, high] = rangeOf(g);
  return h(
    'span',
    null,
    h('span', { 'aria-hidden': 'true' }, `${low}–${high}`),
    h('span', { class: 'sr-only' }, `${low} to ${high}`)
  );
}

export const scoutedText = (g: Grade): string => `${Math.round(g.scouted * 100)}%`;
export const roundText = (round: number | null): string => (round ? `${ordinal(round)} round` : 'Undrafted');

/** An unknown value in a table (style guide 9): a dash, with its reason for assistive technology. */
export const unknownCell = (why: string): HTMLElement =>
  h('span', null, h('span', { 'aria-hidden': 'true' }, '—'), h('span', { class: 'sr-only' }, why));

/** What the team has learned about a prospect, for his details dialog. */
export function prospectDetails(league: League, row: BoardRow, abbr: TeamAbbr): HTMLElement[] {
  const draft = league.draft as DraftClass;
  const { player, prospect, grade } = row;
  const known = revealed(draft, abbr, player.id);
  const where = prospect.region ? `${player.college} (${prospect.region})` : player.college;
  const bio = `${player.position} · ${where} · Age ${row.age} · ${heightText(player.height)}, ${player.weight} lb`;
  const visitsOpen = draft.prospects.some(p => p.workout);

  const workout = prospect.measurables
    ? [
        h('p', { class: 'hint' }, prospect.workout === 'combine' ? 'At the combine.' : 'At his pro day.'),
        h('div', { class: 'stat-grid' }, ...DRILLS.map(d => stat(d.title.replace(/,.*$/, ''), d.words((prospect.measurables as Measurables)[d.key]))))
      ]
    : [h('p', { class: 'muted' }, ['K', 'P', 'LS'].includes(player.position) ? "— · Not measured. Specialists don't run the drills." : '— · Not yet measured. Prospects work out at the combine and at pro days in the offseason.')]; // prettier-ignore

  const traits = traitList(player);
  const abilities = player.abilities.flatMap(id => ability(id) ?? []);
  const unscouted = (at: number) => `— · Not yet scouted. Your scouts learn this at ${Math.round((at / S.fullPoints) * 100)}% scouted.`; // prettier-ignore
  return [
    h('p', null, bio),
    h('div', { class: 'stat-grid' }, stat('Your grade', h('span', { class: 'value' }, gradeText(grade))), stat('Scouted', scoutedText(grade)), stat('Your board', ordinal(row.rank)), stat('Media board', ordinal(row.media)), stat('Media projection', roundText(row.round))),
    h('p', { class: 'hint' }, 'Grades use the ratings scale, blending how good he is now with how good he could become. The range is how far your grade could still move as your scouts work on him.'),
    h('h3', null, 'Workout'),
    ...workout,
    h('h3', null, 'Traits'),
    !known.traits ? h('p', { class: 'muted' }, unscouted(S.traitsAt))
      : traits.length ? h('ul', { class: 'preview-list', 'aria-label': 'Traits' }, ...traits.map(t => h('li', null, t)))
      : h('p', { class: 'muted' }, 'No notable traits.'),
    h('h3', null, 'Abilities'),
    !known.abilities ? h('p', { class: 'muted' }, unscouted(S.abilitiesAt))
      : abilities.length ? h('ul', { class: 'preview-list', 'aria-label': 'Abilities' }, ...abilities.map(a => h('li', null, h('strong', null, a.name), h('span', { class: 'chip' }, `Tier ${a.tier}`))))
      : h('p', { class: 'muted' }, 'No abilities.'),
    h('h3', null, 'Character'),
    known.personality
      ? h('div', { class: 'stack' }, ...CHARACTER.map(([key, label]) => h('div', { class: 'kv' }, h('span', { class: 'label' }, label), h('span', null, `${level(player.personality[key])}, ${player.personality[key]}`))))
      : h('p', { class: 'muted' }, visitsOpen ? '— · Not known. A top-30 visit shows you his character.' : '— · Not known. Top-30 visits, which show a prospect\'s character, open after the combine.')
  ]; // prettier-ignore
}
