/**
 * The draft room (spec 10.4; D-48). While the draft is on and the user is on the clock: the pick, the staff's
 * choice for it and for every pick left, the user's board of the prospects left, each with a Draft button
 * that previews his rookie deal, and every pick by round. Once it's over: the user's class with the media's
 * grade, every team's grade, and every pick. Before the next draft: the user's picks in it.
 */
import { teamFullName, TEAM_COLORS, type TeamAbbr } from '../../data/team-colors';
import { capSheet } from '../../engine/cap/sheet';
import { capHit } from '../../engine/contracts/cap';
import { contractSummary } from '../../engine/contracts/view';
import type { DraftClass } from '../../engine/draft/class';
import {
  draftUnderWay,
  onTheClock,
  rookieDeal,
  staffChoice,
  type ClassGrade
} from '../../engine/draft/draft';
import { needs } from '../../engine/draft/needs';
import { picksIn, type DraftPickRecord } from '../../engine/draft/picks';
import type { League } from '../../engine/league/types';
import { leagueYear } from '../../engine/model/calendar';
import { fullName, type Player } from '../../engine/model/player';
import { POSITION_GROUP, POSITIONS, type PositionGroup } from '../../engine/model/positions';
import { rosterCounts } from '../../engine/roster/rules';
import { draftRoomPick, type DraftRoomChoice } from '../../engine/season/offseason';
import { plural } from '../../engine/text';
import { h, mount, type Child } from '../dom';
import { actionDialogFrame, dialogFrame, openDialog, showBusy, toast } from '../feedback';
import { focusKeyOf, visibleMatch } from '../focus';
import { money, ordinal } from '../format';
import { href } from '../router';
import { previewDetails } from '../ui/moves';
import { GROUP_LABELS, playerLink, stat } from '../ui/players';
import { boardRows, gradeText, prospectDetails, unknownCell, type BoardRow } from '../ui/prospects';
import { sortableTable, type TableColumn } from '../ui/sortable';
import { card, pageHead } from './common';
import type { Screen } from './types';

const PAGE = 40;
/** The screen's choices, kept while the user moves around the app: the board's filter and page, the round. */
const kept = { group: 'all' as PositionGroup | 'all', shown: PAGE, round: 1 };

const nick = (abbr: TeamAbbr): string => TEAM_COLORS[abbr].name;
/** A team's need at a position, in a word (D-45). */
const needWord = (n: number): string => (n >= 0.6 ? 'High' : n >= 0.3 ? 'Some' : 'Low');
/** "Round 1, pick 14", or "Round 1" before the order is set. */
const pickText = (p: DraftPickRecord): string => `Round ${p.round}${p.number ? `, pick ${p.number}` : ''}`;
/** A letter grade in words: "B plus". */
const gradeWords = (letter: string): string => letter.replace('+', ' plus').replace('-', ' minus');

/** A media letter grade, with its plus or minus read as a word. */
function gradeLetter(letter: string): HTMLElement {
  return h(
    'span',
    null,
    h('span', { 'aria-hidden': 'true' }, letter.replace('-', '−')),
    h('span', { class: 'sr-only' }, gradeWords(letter))
  );
}

/** Lets the busy state paint before work that holds the page for a moment. */
const nextFrame = (): Promise<void> =>
  new Promise(resolve => requestAnimationFrame(() => window.setTimeout(resolve, 0)));

/** Ignores a double-click's second click, which would land on the redrawn screen. */
const single =
  (run: (button: HTMLButtonElement) => void) =>
  (event: MouseEvent): void => {
    if (event.detail > 1) return;
    run(event.currentTarget as HTMLButtonElement);
  };

type Rebuild = (key: string | null, fallback?: string) => void;
/** Makes a pick in the draft room from `button`, busy while it runs; `dialog` closes once it's made. */
type Pick = (choice: DraftRoomChoice, button: HTMLButtonElement, dialog?: HTMLDialogElement) => void;

export function draftScreen(): Screen {
  let off: (() => void) | null = null;
  return {
    title: 'Draft room',
    dispose: () => off?.(),
    render: ({ app }) => {
      const view = h('section', { class: 'view' });
      if (!app.league) return view;
      // Rebuilds replace the content; the status stays put, so screen readers hear what changed.
      const content = h('div');
      const status = h('p', { class: 'sr-only', role: 'status' });
      view.append(content, status);
      let shownLeague: League | null = null;
      let picking = false;
      const rebuild: Rebuild = (key, fallback) => {
        build();
        if (!key) return;
        (visibleMatch(view, key) ?? (fallback ? visibleMatch(view, fallback) : null) ?? view.querySelector<HTMLElement>('h1'))?.focus(); // prettier-ignore
      };
      // An advance while the screen is open can open the draft or finish it.
      off = app.onChange(() => {
        if (!app.league || app.league === shownLeague) return;
        rebuild(focusKeyOf(view));
      });

      // The picks that follow the user's run here, so the button shows it's busy first. The result is said
      // once, in a toast.
      const pick: Pick = (choice, button, dialog) => {
        if (picking || !app.league) return;
        picking = true;
        const idle = showBusy(button, 'Picking…');
        void nextFrame().then(() => {
          let outcome: ReturnType<typeof draftRoomPick> | null = null;
          app.edit(
            l => {
              outcome = draftRoomPick(l, choice);
            },
            ['draft', choice]
          );
          idle();
          picking = false;
          dialog?.close();
          const result = outcome as ReturnType<typeof draftRoomPick> | null;
          if (!result?.ok) {
            toast(result?.reason ?? "The pick couldn't be made.", { persistent: true });
            return;
          }
          rebuild(null);
          view.querySelector<HTMLElement>('h1')?.focus();
          toast(pickMessage(app.league as League, choice, result.value));
        });
      };

      const build = (): void => {
        const league = app.league;
        if (!league) return;
        shownLeague = league;
        const draft = draftUnderWay(league);
        const clock = onTheClock(league);
        const grades =
          !draft && league.draftGrades?.year === leagueYear(league.date) ? league.draftGrades : null;
        const upcoming = league.draft?.year ?? leagueYear(league.date) + 1;
        const tag = draft ? `${draft.year} draft` : grades ? `${grades.year} draft` : `${upcoming} draft`;
        const cards: Child[] =
          draft && clock
            ? [clockCard(league, draft, clock, pick, view), boardCard(league, draft, clock, pick, view, status, rebuild), roundCard(league, draft.year, status, rebuild)]
            : grades
              ? [classCard(league, grades.year, grades.teams), gradesCard(league, grades.teams, status), roundCard(league, grades.year, status, rebuild), nextCard(league, upcoming)]
              : [nextCard(league, upcoming)]; // prettier-ignore
        mount(content, pageHead('Draft room', tag), h('div', { class: 'stack' }, ...cards));
      };
      build();
      return view;
    }
  };
}

/** What a draft room pick did, in a line: the user's pick or the staff's, and what comes next. */
function pickMessage(league: League, choice: DraftRoomChoice, made: readonly DraftPickRecord[]): string {
  const user = league.meta.start.userTeam;
  const mine = made.filter(p => p.owner === user);
  const first = mine[0];
  const player = first?.playerId ? league.players[first.playerId] : undefined;
  const who = player ? `${player.position} ${fullName(player)}` : 'a prospect';
  const took =
    'staff' in choice && choice.staff === 'rest'
      ? `Your staff made your ${plural(mine.length, 'pick')} left.`
      : `${'staff' in choice ? 'Your staff drafted' : 'You drafted'} ${who} with the ${ordinal(first?.number ?? 0)} pick.`;
  const clock = onTheClock(league);
  const grade = league.draftGrades?.teams.find(g => g.team === user);
  const next = clock
    ? `You're on the clock again with the ${ordinal(clock.number ?? 0)} pick.`
    : `The draft is over${grade ? `: the media give your class ${gradeWords(grade.letter)}` : ''}.`;
  return `${took} ${next}`;
}

/** The pick on the clock, with the staff's choice for it and for every pick left. */
function clockCard(
  league: League,
  draft: DraftClass,
  clock: DraftPickRecord,
  pick: Pick,
  view: HTMLElement
): HTMLElement {
  const user = league.meta.start.userTeam;
  if (clock.owner !== user)
    return card('On the clock', h('p', null, `The ${nick(clock.owner)} are on the clock with the ${ordinal(clock.number ?? 0)} pick.`)); // prettier-ignore
  const left = picksIn(league, draft.year).filter(p => p.owner === user && !p.playerId);
  const staffId = staffChoice(league, user);
  const choice = draft.prospects.find(p => p.player.id === staffId)?.player;
  const staff = h(
    'button',
    { class: 'btn btn-outline', type: 'button', 'data-focus': 'staffPick' },
    'Let your staff pick'
  );
  staff.addEventListener(
    'click',
    single(button => pick({ staff: 'pick' }, button))
  );
  const rest = h(
    'button',
    { class: 'btn btn-outline', type: 'button', 'data-focus': 'staffRest', 'aria-haspopup': 'dialog' },
    'Auto-draft the rest'
  );
  rest.addEventListener(
    'click',
    single(() => {
      const confirm = h(
        'button',
        { class: 'btn btn-primary', type: 'button' },
        `Auto-draft ${plural(left.length, 'pick')}`
      );
      const cancel = h(
        'button',
        { class: 'btn btn-outline', type: 'button', 'data-close': true, 'data-autofocus': true },
        'Cancel'
      );
      const dialog = actionDialogFrame(
        'autoDraftDialog',
        'Auto-draft the rest',
        [
          h(
            'p',
            null,
            `Your staff makes your ${plural(left.length, 'pick')} left, each by its grades and your needs, and the draft runs to its end.`
          ),
          h(
            'ul',
            { class: 'preview-list', 'aria-label': 'Your picks left' },
            ...left.map(p => h('li', null, pickText(p)))
          )
        ],
        [confirm, cancel]
      );
      confirm.addEventListener(
        'click',
        single(button => pick({ staff: 'rest' }, button, dialog))
      );
      document.getElementById('autoDraftDialog')?.remove();
      document.body.append(dialog);
      dialog.addEventListener('close', () => window.setTimeout(() => dialog.remove(), 0));
      openDialog(dialog, rest, () => view.querySelector<HTMLElement>('h1'));
    })
  );
  return card(
    'On the clock',
    h('p', { class: 'label' }, pickText(clock)),
    h('p', { class: 'hero-title' }, "You're on the clock"),
    choice ? h('p', null, `Your staff would take ${choice.position} ${fullName(choice)} (${choice.college}), the prospect worth most to you by your grades and needs.`) : null,
    h('p', { class: 'muted' }, `Your picks: ${left.map(pickText).join('; ')}.`),
    h('div', { class: 'btn-row' }, staff, rest)
  ); // prettier-ignore
}

/** The Draft confirmation: who he is, the rookie deal the pick brings, and what it does to the cap and roster. */
function draftDialog(league: League, row: BoardRow, clock: DraftPickRecord, need: string): HTMLDialogElement {
  const user = league.meta.start.userTeam;
  const name = fullName(row.player);
  const deal = rookieDeal(league, clock, row.player.id);
  const summary = contractSummary(deal, league.date);
  const year = clock.year;
  const before = capSheet(league, user, year).space;
  const after = capSheet(league, user, year, { add: [{ contract: deal, status: 'active' }] }).space;
  const counts = rosterCounts(league, user);
  const notes = [
    after < 0 ? `That puts you ${money(-after, true)} over the ${year} cap: get under it before the league moves on.` : null,
    counts.active + 1 > counts.limit ? `That puts you over the ${counts.limit}-player limit: release a player before the league moves on.` : null
  ].filter((n): n is string => n !== null); // prettier-ignore
  const detail = (label: string, value: string) =>
    h('div', { class: 'kv' }, h('span', { class: 'label' }, label), h('span', null, value));
  const confirm = h('button', { class: 'btn btn-primary', type: 'button' }, `Draft ${name}`);
  const cancel = h('button', { class: 'btn btn-outline', type: 'button', 'data-close': true, 'data-autofocus': true }, 'Cancel'); // prettier-ignore
  return actionDialogFrame(
    'draftDialog',
    `Draft ${name}?`,
    [
      h('p', null, `${row.player.position} · ${row.player.college} · Age ${row.age}`),
      h('div', { class: 'stat-grid' }, stat('Your grade', h('span', { class: 'value' }, gradeText(row.grade))), stat('Your board', ordinal(row.rank)), stat('Media board', ordinal(row.media)), stat('Your need', need)),
      h('h3', null, `His rookie deal, with the ${ordinal(clock.number ?? 0)} pick`),
      h('div', { class: 'stack' }, detail('Total', `${money(summary.total, true)} over ${plural(summary.years, 'year')}`), detail('Signing bonus', money(deal.signingBonus, true)), detail(`${year} cap hit`, money(capHit(deal, year, league.rules), true))),
      previewDetails({ year, spaceBefore: before, spaceAfter: after, deadNow: 0, deadNext: 0, active: counts.active + 1, limit: counts.limit, practice: counts.practice, notes })
    ],
    [confirm, cancel]
  ); // prettier-ignore
}

/** The prospects left on the user's board, each a pick away. */
function boardCard(
  league: League,
  draft: DraftClass,
  clock: DraftPickRecord,
  pick: Pick,
  view: HTMLElement,
  status: HTMLElement,
  rebuild: Rebuild
): HTMLElement {
  const user = league.meta.start.userTeam;
  const rows = boardRows(league, draft, user);
  const needAt = needs(league, user);
  const need = (r: BoardRow) => needAt.get(r.player.position) ?? 0;
  const shown = rows.filter(r => kept.group === 'all' || POSITION_GROUP[r.player.position] === kept.group);

  const openProspect = (row: BoardRow, trigger: HTMLElement): void => {
    const dialog = dialogFrame('draftProspectDialog', fullName(row.player), h('div', { class: 'stack' }, ...prospectDetails(league, row, user))); // prettier-ignore
    document.getElementById('draftProspectDialog')?.remove();
    document.body.append(dialog);
    dialog.addEventListener('close', () => window.setTimeout(() => dialog.remove(), 0));
    openDialog(dialog, trigger);
  };
  const nameButton = (row: BoardRow): HTMLElement => {
    const button = h('button', { class: 'btn btn-text prospect-name', type: 'button', 'aria-haspopup': 'dialog', 'data-focus': `prospect-${row.player.id}` }, fullName(row.player)); // prettier-ignore
    button.addEventListener('click', () => openProspect(row, button));
    return button;
  };
  // Each call makes a fresh button: the table and the phone list both show one.
  const draftButton = (row: BoardRow): HTMLElement => {
    const button = h('button', { class: 'btn btn-solid', type: 'button', 'aria-label': `Draft ${fullName(row.player)}`, 'aria-haspopup': 'dialog', 'data-focus': `draft-${row.player.id}` }, 'Draft'); // prettier-ignore
    button.addEventListener('click', single(() => {
      const dialog = draftDialog(league, row, clock, needWord(need(row)));
      dialog.querySelector<HTMLButtonElement>('.dialog-actions .btn-primary')?.addEventListener('click', single(b => pick({ prospectId: row.player.id }, b, dialog)));
      document.getElementById('draftDialog')?.remove();
      document.body.append(dialog);
      dialog.addEventListener('close', () => window.setTimeout(() => dialog.remove(), 0));
      openDialog(dialog, button, () => view.querySelector<HTMLElement>('h1'));
    })); // prettier-ignore
    return button;
  };

  const columns: TableColumn<BoardRow>[] = [
    { id: 'rank', label: 'Rank', title: 'Rank on your board', name: 'rank on your board', type: 'number', first: 'asc', words: ['best first', 'worst first'], numeric: true, className: 'wide rank-col', value: r => r.rank, cell: r => h('td', { class: 'wide num' }, r.rank) },
    { id: 'position', label: 'Pos', title: 'Position', name: 'position', type: 'number', first: 'asc', words: ['quarterbacks first', 'specialists first'], className: 'pos-col', value: r => POSITIONS.indexOf(r.player.position), cell: r => h('td', null, r.player.position) },
    { id: 'prospect', label: 'Prospect', name: 'prospect', type: 'text', value: r => `${r.player.lastName} ${r.player.firstName}`, cell: r => h('th', { scope: 'row' }, nameButton(r)) },
    { id: 'college', label: 'College', name: 'college', type: 'text', className: 'widest college-col', value: r => r.player.college, cell: r => h('td', { class: 'widest' }, r.player.college) },
    { id: 'age', label: 'Age', name: 'age', type: 'number', numeric: true, className: 'age-col', value: r => r.age, cell: r => h('td', { class: 'num' }, r.age) },
    { id: 'grade', label: 'Grade', title: 'Your grade', name: 'your grade', type: 'number', numeric: true, className: 'grade-col', value: r => r.grade.value, cell: r => h('td', { class: 'num' }, gradeText(r.grade)) },
    { id: 'media', label: 'Media', title: "Place on the media's final big board", name: "media's board", type: 'number', first: 'asc', words: ['highest first', 'lowest first'], numeric: true, className: 'wide round-col', value: r => r.media, cell: r => h('td', { class: 'wide num' }, ordinal(r.media)) },
    { id: 'need', label: 'Need', title: 'Your need at his position', name: 'your need', type: 'number', words: ['lowest first', 'highest first'], className: 'wide need-col', value: r => need(r), cell: r => h('td', { class: 'wide' }, needWord(need(r))) },
    { id: 'actions', label: 'Draft', name: 'draft', type: 'custom', sortable: false, hideLabel: true, className: 'draft-actions-col', cell: r => h('td', null, draftButton(r)) }
  ]; // prettier-ignore
  const list = h('ul', { class: 'roster-list', 'aria-label': 'Prospects left' });
  const items = new Map<string, HTMLElement>();
  const item = (r: BoardRow): HTMLElement => {
    let li = items.get(r.player.id);
    if (!li) {
      li = h('li', { class: 'list-row' }, h('span', { class: 'pos' }, r.player.position), h('div', { class: 'list-main' }, nameButton(r), h('p', { class: 'list-sub' }, `${r.rank}. ${r.player.college} · Age ${r.age} · Media ${ordinal(r.media)} · Need: ${needWord(need(r)).toLowerCase()}`)), h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Grade'), h('span', { class: 'value' }, gradeText(r.grade))), h('div', { class: 'btn-row' }, draftButton(r))); // prettier-ignore
      items.set(r.player.id, li);
    }
    return li;
  };
  const table = shown.length
    ? sortableTable({ key: 'draft.board', name: 'prospects left', caption: 'Prospects left on your board', captionClass: 'sr-only', className: 'roster-table draft-table', columns, rows: shown, rowId: r => r.player.id, defaultOrder: 'by your grade, best first', status, limit: kept.shown, onSort: ordered => list.replaceChildren(...ordered.map(item)) }) // prettier-ignore
    : null;
  const group = h('select', { class: 'select', id: 'draft-group' }, h('option', { value: 'all' }, 'All positions'), ...(Object.keys(GROUP_LABELS) as PositionGroup[]).map(g => h('option', { value: g }, GROUP_LABELS[g]))); // prettier-ignore
  group.value = kept.group;
  group.addEventListener('change', () => {
    kept.group = group.value as PositionGroup | 'all';
    kept.shown = PAGE;
    rebuild('#draft-group');
    status.textContent = view.querySelector('.draft-count')?.textContent ?? '';
  });
  const moreCount = Math.min(PAGE, shown.length - kept.shown);
  const more = moreCount > 0 ? h('button', { class: 'btn btn-outline', type: 'button', 'data-focus': 'draft-more' }, `Show ${moreCount} more`) : null; // prettier-ignore
  more?.addEventListener('click', () => {
    const page = kept.shown;
    kept.shown += PAGE;
    rebuild(null);
    [...view.querySelectorAll<HTMLElement>('.draft-board .prospect-name')].filter(b => b.getClientRects().length > 0).at(page)?.focus(); // prettier-ignore
  });
  const where = kept.group === 'all' ? '' : ` among the ${GROUP_LABELS[kept.group].toLowerCase()}`;
  const empty = kept.group === 'all' ? 'No prospects are left in the class.' : 'No prospects left at these positions. Choose another position to see the rest.'; // prettier-ignore
  return h(
    'section',
    { class: 'card draft-board' },
    h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title' }, 'Your board')),
    h('div', { class: 'card-body stack' },
      h('div', { class: 'filterbar' }, h('div', { class: 'field' }, h('label', { for: 'draft-group' }, 'Position'), group)),
      h('p', { class: 'draft-count' }, `${plural(shown.length, 'prospect')} left${where}.`),
      h('p', { class: 'hint' }, "Ranked by your grades. Need is how much your roster needs his position; your staff's choice weighs both."),
      table ? h('div', { class: 'roster-region' }, table.element, list) : h('p', { class: 'empty' }, empty),
      more)
  ); // prettier-ignore
}

interface PickRow {
  number: number;
  round: number;
  team: TeamAbbr;
  player: Player | null;
  clock: boolean;
}

/** Every pick in a round: during the draft from the pick records, after it from the drafted players. */
function roundCard(league: League, year: number, status: HTMLElement, rebuild: Rebuild): HTMLElement {
  const user = league.meta.start.userTeam;
  const clock = onTheClock(league);
  const records = picksIn(league, year).filter(p => p.number !== null);
  const rows: PickRow[] = records.length
    ? records.map(p => ({ number: p.number as number, round: p.round, team: p.owner, player: p.playerId ? (league.players[p.playerId] ?? null) : null, clock: clock?.id === p.id })) // prettier-ignore
    : Object.values(league.players).flatMap(p =>
        'round' in p.draft && p.draft.year === year ? [{ number: p.draft.pick, round: p.draft.round, team: p.draft.team, player: p, clock: false }] : []
      ); // prettier-ignore
  const rounds = [...new Set(rows.map(r => r.round))].sort((a, b) => a - b);
  const round = rounds.includes(kept.round) ? kept.round : (rounds[0] ?? 1);
  const shown = rows.filter(r => r.round === round).sort((a, b) => a.number - b.number);
  const teamText = (r: PickRow) => `${teamFullName(r.team)}${r.team === user ? ' (you)' : ''}`;
  const waiting = (r: PickRow): Child => (r.clock ? 'On the clock' : unknownCell('Not yet picked'));
  const columns: TableColumn<PickRow>[] = [
    { id: 'pick', label: 'Pick', name: 'pick', type: 'number', first: 'asc', words: ['first pick first', 'last pick first'], numeric: true, className: 'rank-col', value: r => r.number, cell: r => h('th', { scope: 'row', class: 'num' }, r.number) },
    { id: 'team', label: 'Team', name: 'team', type: 'text', value: r => teamFullName(r.team), cell: r => h('td', null, teamText(r)) },
    { id: 'player', label: 'Player', name: 'player', type: 'text', value: r => (r.player ? `${r.player.lastName} ${r.player.firstName}` : null), cell: r => h('td', null, r.player ? playerLink(r.player) : waiting(r)) },
    { id: 'position', label: 'Pos', title: 'Position', name: 'position', type: 'number', first: 'asc', words: ['quarterbacks first', 'specialists first'], className: 'pos-col', value: r => (r.player ? POSITIONS.indexOf(r.player.position) : null), cell: r => h('td', null, r.player?.position ?? unknownCell('Not yet picked')) },
    { id: 'college', label: 'College', name: 'college', type: 'text', className: 'wide college-col', value: r => r.player?.college ?? null, cell: r => h('td', { class: 'wide' }, r.player?.college ?? unknownCell('Not yet picked')) }
  ]; // prettier-ignore
  const list = h('ol', { class: 'roster-list', 'aria-label': `Round ${round} picks` });
  const items = new Map<number, HTMLElement>();
  const item = (r: PickRow): HTMLElement => {
    let li = items.get(r.number);
    if (!li) {
      li = h('li', { class: 'list-row' }, h('span', { class: 'pos' }, r.player?.position ?? unknownCell('Not yet picked')), h('div', { class: 'list-main' }, h('p', { class: 'list-sub' }, `${r.number}. ${teamText(r)}`), r.player ? playerLink(r.player) : h('p', null, r.clock ? 'On the clock' : 'Not yet picked'), r.player ? h('p', { class: 'list-sub' }, r.player.college) : null)); // prettier-ignore
      items.set(r.number, li);
    }
    return li;
  };
  const select = h('select', { class: 'select', id: 'draft-round' }, ...rounds.map(r => h('option', { value: String(r) }, `Round ${r}`))); // prettier-ignore
  select.value = String(round);
  select.addEventListener('change', () => {
    kept.round = Number(select.value);
    rebuild('#draft-round');
    status.textContent = `Round ${kept.round}: ${plural(rows.filter(r => r.round === kept.round).length, 'pick')}.`;
  });
  return card(
    'Every pick',
    h('div', { class: 'filterbar' }, h('div', { class: 'field' }, h('label', { for: 'draft-round' }, 'Round'), select)),
    shown.length
      ? h('div', { class: 'roster-region' }, sortableTable({ key: 'draft.round', name: 'picks', caption: `Round ${round} picks`, captionClass: 'sr-only', className: 'roster-table picks-table', columns, rows: shown, rowId: r => String(r.number), defaultOrder: 'in pick order', status, onSort: ordered => list.replaceChildren(...ordered.map(item)) }).element, list)
      : h('p', { class: 'empty' }, 'No picks in this round.')
  ); // prettier-ignore
}

/** The user's class from the draft just held, with the media's grade. */
function classCard(league: League, year: number, grades: readonly ClassGrade[]): HTMLElement {
  const user = league.meta.start.userTeam;
  const grade = grades.find(g => g.team === user);
  const mine = Object.values(league.players)
    .filter(p => 'round' in p.draft && p.draft.year === year && p.draft.team === user)
    .sort((a, b) => ('pick' in a.draft ? a.draft.pick : 0) - ('pick' in b.draft ? b.draft.pick : 0));
  const line = (p: Player): HTMLElement =>
    h('li', null, h('span', { class: 'pos' }, p.position), h('span', { class: 'list-main' }, playerLink(p)), h('span', { class: 'muted' }, 'round' in p.draft ? `Round ${p.draft.round}, pick ${p.draft.pick}` : '')); // prettier-ignore
  return card(
    `Your ${year} class`,
    grade ? h('p', { class: 'label' }, "The media's grade") : null,
    grade ? h('p', { class: 'hero-title' }, gradeLetter(grade.letter)) : null,
    grade ? h('p', null, grade.blurb) : h('p', null, 'You had no picks in this draft, so the media had nothing to grade.'),
    mine.length ? h('ul', { class: 'preview-list', 'aria-label': 'Your draft class' }, ...mine.map(line)) : null
  ); // prettier-ignore
}

/** Every team's grade from the media, best first: a table where there's room, a list on phones. */
function gradesCard(league: League, grades: readonly ClassGrade[], status: HTMLElement): HTMLElement {
  const user = league.meta.start.userTeam;
  const teamText = (g: ClassGrade) => `${teamFullName(g.team)}${g.team === user ? ' (you)' : ''}`;
  const columns: TableColumn<ClassGrade>[] = [
    { id: 'team', label: 'Team', name: 'team', type: 'text', value: g => teamFullName(g.team), cell: g => h('th', { scope: 'row' }, teamText(g)) },
    { id: 'grade', label: 'Grade', name: 'grade', type: 'number', words: ['worst first', 'best first'], className: 'grade-col', value: g => g.score, cell: g => h('td', null, gradeLetter(g.letter)) },
    { id: 'blurb', label: 'What the media said', name: 'what the media said', type: 'text', sortable: false, className: 'blurb-col', value: g => g.blurb, cell: g => h('td', null, g.blurb) }
  ]; // prettier-ignore
  const list = h('ul', { class: 'roster-list', 'aria-label': "The media's grades" });
  const items = new Map<TeamAbbr, HTMLElement>();
  const item = (g: ClassGrade): HTMLElement => {
    let li = items.get(g.team);
    if (!li) {
      li = h('li', { class: 'list-row' }, h('span', { class: 'pos' }, g.team), h('div', { class: 'list-main' }, h('p', { class: 'list-name' }, teamText(g)), h('p', { class: 'list-sub' }, g.blurb)), h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Grade'), h('span', { class: 'value' }, gradeLetter(g.letter)))); // prettier-ignore
      items.set(g.team, li);
    }
    return li;
  };
  return card(
    "The media's grades",
    h('p', { class: 'hint' }, "Each class is graded by where its players sat on the media's final big board against the picks spent on them."),
    h('div', { class: 'roster-region' }, sortableTable({ key: 'draft.grades', name: 'draft grades', caption: "The media's draft grades", captionClass: 'sr-only', className: 'roster-table grades-table', columns, rows: [...grades], rowId: g => g.team, defaultOrder: 'best first', status, onSort: ordered => list.replaceChildren(...ordered.map(item)) }).element, list)
  ); // prettier-ignore
}

/** The user's picks in the next draft, before it opens. */
function nextCard(league: League, year: number): HTMLElement {
  const user = league.meta.start.userTeam;
  const mine = picksIn(league, year).filter(p => p.owner === user);
  const numbered = mine.some(p => p.number !== null);
  const line = (p: DraftPickRecord): HTMLElement =>
    h('li', null, pickText(p), p.original !== user ? h('span', { class: 'muted' }, ` (from the ${nick(p.original)})`) : null); // prettier-ignore
  return card(
    `The ${year} draft`,
    h('p', null, `The draft opens after the pro days in the offseason. ${league.settings.auto.draft ? 'Your staff makes your picks: Draft picks is on in Automation in Settings.' : 'You make your picks here, or let your staff make them.'}`),
    mine.length ? h('ul', { class: 'preview-list', 'aria-label': `Your picks in the ${year} draft` }, ...mine.map(line)) : h('p', { class: 'empty' }, `You have no picks in the ${year} draft.`),
    numbered ? null : h('p', { class: 'hint' }, `The order is set when the ${year - 1} season ends: the worst record picks first, the champion last.`),
    h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-outline', href: href('scouting') }, 'Scouting'))
  ); // prettier-ignore
}
