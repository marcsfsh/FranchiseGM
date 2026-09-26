/**
 * The hub's card for a team that can't advance (D-46): each problem in words, with its fixes a tap away and
 * previewed before they're made (restructures and releases that free cap space, promotions and signings at
 * the minimum that fill the roster, and the moves that dress a game-day roster), and the staff's own fix,
 * listed move by move before it's made. Roster management on auto makes these fixes during the advance.
 */
import { makeLegal } from '../../engine/ai/decisions/compliance';
import { capSheet } from '../../engine/cap/sheet';
import type { TransactionKind } from '../../engine/league/transactions';
import type { League } from '../../engine/league/types';
import { fullName } from '../../engine/model/player';
import { stream } from '../../engine/rng';
import { minimumSalary } from '../../engine/rules/ruleset';
import {
  fillFixes,
  gameDayFixes,
  releaseFixes,
  restructureFixes,
  saved,
  type Fix
} from '../../engine/roster/fixes';
import { legalityProblems, type LegalityProblem } from '../../engine/roster/legality';
import type { Move } from '../../engine/roster/moves';
import { plural } from '../../engine/text';
import { h, type Child } from '../dom';
import { actionDialogFrame, openDialog, toast } from '../feedback';
import { money } from '../format';
import { href } from '../router';
import type { AppState } from '../state';
import { openMoveDialog } from './moves';

/** Fixes offered for each problem, at most. */
const SHOWN = 4;

const VERBS: Partial<Record<Move['kind'], string>> = {
  restructure: 'Restructure',
  release: 'Release',
  promote: 'Promote',
  sign: 'Sign',
  elevate: 'Elevate',
  injuredReserve: 'Injured reserve'
};

/** The staff's moves in its list, by what the transaction log calls them. */
const MADE: Partial<Record<TransactionKind, string>> = {
  released: 'Release',
  restructured: 'Restructure',
  promoted: 'Promote',
  signed: 'Sign',
  elevated: 'Elevate',
  injuredReserve: 'Injured reserve:'
};

/** A fix in a line: what it does and, for the cap, what it frees. */
function fixText(league: League, fix: Fix): string {
  const p = league.players[fix.move.playerId];
  const who = p ? `${fullName(p)} (${p.position}, ${p.ovr})` : 'This player';
  const m = fix.move;
  if (m.kind === 'restructure') return `Restructure ${who}: frees ${money(saved(fix))} this year.`;
  if (m.kind === 'release') return `Release ${who}: frees ${money(saved(fix))} this year.`;
  if (m.kind === 'promote') return `Promote ${who} from the practice squad at the minimum.`;
  if (m.kind === 'sign') return `Sign ${who} for ${money(m.offer.salary)} this year.`;
  if (m.kind === 'elevate') return `Elevate ${who} from the practice squad for this week's game.`;
  if (m.kind === 'injuredReserve') return `Move ${who}, out ${plural(p?.injury?.weeksOut ?? 0, 'week')}, to injured reserve to open a spot.`; // prettier-ignore
  return who;
}

/**
 * The fixes for one problem, and a note when there are none of its own: with too little cap space for a
 * minimum salary, the restructures that would make room.
 */
function fixesFor(league: League, problem: LegalityProblem): { fixes: Fix[]; note: string | null } {
  const abbr = league.meta.start.userTeam;
  if (problem.kind === 'cap') return { fixes: [...restructureFixes(league, abbr).slice(0, SHOWN), ...releaseFixes(league, abbr).slice(0, SHOWN)], note: null }; // prettier-ignore
  const fixes = problem.kind === 'minimum' ? fillFixes(league, abbr, SHOWN) : problem.kind === 'gameDay' ? gameDayFixes(league, abbr, SHOWN) : []; // prettier-ignore
  if (fixes.length || problem.kind === 'limit') return { fixes, note: null };
  if (capSheet(league, abbr).space < minimumSalary(league.rules, 0))
    return { fixes: restructureFixes(league, abbr).slice(0, SHOWN), note: "There's no cap room to sign or promote anyone. Restructure a contract to make room first." }; // prettier-ignore
  return { fixes, note: 'No free agent or practice squad player fits these spots right now. Free agency lists everyone available.' }; // prettier-ignore
}

/**
 * The staff's fix, listed before it's made: it runs on a copy of the league, and the same moves are made
 * on the league itself after the user confirms.
 */
function openStaffFix(app: AppState, trigger: HTMLElement, done: () => void): void {
  const league = app.league;
  if (!league) return;
  const abbr = league.meta.start.userTeam;
  const seed = (l: League) =>
    stream(l.random.baseSeed, 'staffFix', l.season.season, l.season.transactions.length);
  const copy = structuredClone(league);
  const before = copy.season.transactions.length;
  makeLegal(copy, abbr, seed(copy));
  const moves = copy.season.transactions.slice(before).filter(t => t.team === abbr);
  const left = legalityProblems(copy, abbr);
  const confirm = h(
    'button',
    { class: 'btn btn-primary', type: 'button' },
    `Make ${plural(moves.length, 'move')}`
  );
  const cancel = h('button', { class: 'btn btn-outline', type: 'button', 'data-close': true, 'data-autofocus': true }, 'Cancel'); // prettier-ignore
  const body = [
    h('p', null, moves.length ? 'Your staff would make these moves, each checked like your own:' : "Your staff can't find moves that fix this. Make the moves yourself from your roster and contracts."),
    moves.length ? h('ul', { class: 'preview-list', 'aria-label': 'Moves your staff would make' }, ...moves.map(t => {
      const p = copy.players[t.playerId];
      return h('li', null, `${MADE[t.kind] ?? t.kind} ${p ? `${fullName(p)} (${p.position})` : ''}`);
    })) : null,
    left.length ? h('p', { class: 'hint' }, `Still to fix after them: ${left.map(p => p.fact).join('; ')}.`) : null
  ].filter(n => n !== null); // prettier-ignore
  confirm.disabled = moves.length === 0;
  const dialog = actionDialogFrame('staffFixDialog', 'Let your staff fix it', body, [confirm, cancel]);
  confirm.addEventListener('click', () => {
    app.edit(l => makeLegal(l, abbr, seed(l)), ['staffFix']);
    dialog.close();
    toast(`Your staff made ${plural(moves.length, 'move')}.`);
    done();
  });
  document.getElementById('staffFixDialog')?.remove();
  document.body.append(dialog);
  dialog.addEventListener('close', () => window.setTimeout(() => dialog.remove(), 0));
  openDialog(dialog, trigger, () => document.querySelector<HTMLElement>('main h1'));
}

/** The card, or null when the user's team can advance (or the staff fixes it on auto, or rules are off). */
export function legalityCard(app: AppState, league: League, done: () => void): HTMLElement | null {
  if (!league.settings.commissioner.enforceRules || league.settings.auto.roster) return null;
  const problems = legalityProblems(league, league.meta.start.userTeam);
  if (!problems.length) return null;
  const item = (fix: Fix): HTMLElement => {
    const verb = VERBS[fix.move.kind] ?? 'Make the move';
    const p = league.players[fix.move.playerId];
    const name = p ? fullName(p) : 'him';
    const button = h('button', { class: 'btn btn-outline', type: 'button', 'aria-label': `${verb} ${name}`, 'data-focus': `fix-${fix.move.kind}-${fix.move.playerId}` }, verb); // prettier-ignore
    button.addEventListener(
      'click',
      () =>
      openMoveDialog(app, { id: 'fixDialog', title: `${verb} ${name}`, intro: fixText(league, fix), choices: [{ label: verb, confirm: `${verb} ${name}`, danger: fix.move.kind === 'release', move: () => fix.move }] }, button, done) // prettier-ignore
    );
    return h('li', null, h('span', null, fixText(league, fix)), button);
  };
  const sections: Child[] = problems.map(problem => {
    const { fixes, note } = fixesFor(league, problem);
    return h(
      'div',
      { class: 'stack' },
      h('p', { class: 'delta-bad' }, problem.text),
      note ? h('p', { class: 'hint' }, note) : null,
      fixes.length ? h('ul', { class: 'preview-list', 'aria-label': `Fixes: ${problem.fact}` }, ...fixes.map(item)) : null,
      problem.kind === 'limit' ? h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-outline', href: href('roster') }, 'Roster')) : null
    ); // prettier-ignore
  });
  const staff = h(
    'button',
    { class: 'btn btn-solid', type: 'button', 'data-focus': 'staffFix' },
    'Let your staff fix it'
  );
  staff.addEventListener('click', () => openStaffFix(app, staff, done));
  return h(
    'section',
    { class: 'card span-2' },
    h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title' }, 'Before you can advance')),
    h('div', { class: 'card-body stack' }, ...sections, h('div', { class: 'btn-row' }, staff))
  );
}
