/**
 * Contracts (spec 11.4, 11.5, 19.4): the user's expiring deals, with what each player asks to stay and what a
 * tag or tender would cost, the fifth-year options to decide, and the decisions made this league year, each a
 * sortable table (a list on phones). Extensions are open until free agency, negotiated in talks or settled by
 * the user's GM (spec 11.6); tags, tenders, and options are for the re-sign window. Each decision previews
 * its cap effect in a dialog before the user confirms it.
 */
import { teamFullName, type TeamAbbr } from '../../data/team-colors';
import { capHit } from '../../engine/contracts/cap';
import { askOf, counterWords, settledSalary, talks, termFor } from '../../engine/contracts/negotiation';
import {
  creditedNextYear,
  currentDeal,
  freeAgentKind,
  optionSalary,
  TAG_LABELS,
  tagSalary,
  TENDER_LABELS,
  tenderLevels,
  tenderSalary,
  windowDecisions,
  type FreeAgentKind,
  type TagKind,
  type TenderLevel
} from '../../engine/contracts/resign';
import type { League } from '../../engine/league/types';
import { calendarDay, leagueYear } from '../../engine/model/calendar';
import { ageOn, fullName, type Player } from '../../engine/model/player';
import { POSITIONS } from '../../engine/model/positions';
import { minimumSalary } from '../../engine/rules/ruleset';
import { plural } from '../../engine/text';
import { TUNING } from '../../engine/tuning';
import { h, mount } from '../dom';
import { money } from '../format';
import { href } from '../router';
import type { AppState } from '../state';
import { openMoveDialog, placeOf, refocus, type MoveChoice } from '../ui/moves';
import { estimateAdvice, offerTerms } from '../ui/offer-terms';
import { demandTag, playerLink, tierPlate } from '../ui/players';
import { sortableTable, type TableColumn } from '../ui/sortable';
import { card, pageHead } from './common';
import type { Screen } from './types';

const KIND_LABELS: Record<FreeAgentKind, string> = {
  unrestricted: 'Unrestricted',
  restricted: 'Restricted',
  exclusive: 'Exclusive rights'
};
const KIND_WORDS: Record<FreeAgentKind, string> = {
  unrestricted: 'an unrestricted free agent',
  restricted: 'a restricted free agent',
  exclusive: 'an exclusive-rights free agent'
};
const TIER_LABELS = {
  franchise: 'Franchise tag level',
  transition: 'Transition tag level',
  playingTime: 'Playing-time level',
  basic: 'Basic level'
} as const;
const DECIDE = 'Decide on ';

interface Decided {
  player: Player;
  words: string;
  /** What the decision pays him, and in which league year; null when it pays nothing more. */
  pays: { salary: number; year: number } | null;
}

/** The team's decisions this league year: deals signed to follow a current one, and fifth-year options. */
function decisionsMade(league: League, abbr: TeamAbbr): Decided[] {
  const year = leagueYear(league.date);
  const made: Decided[] = [];
  for (const player of Object.values(league.players)) {
    if (player.team !== abbr) continue;
    const pending = player.nextContractId ? league.contracts[player.nextContractId] : undefined;
    if (pending && !pending.ended) {
      const rights = pending.rights;
      const words =
        pending.type === 'extension'
          ? `Extension, ${plural(pending.years.length, 'year')}`
          : rights && rights in TAG_LABELS
            ? TAG_LABELS[rights as TagKind]
            : TENDER_LABELS[(rights ?? 'refusal') as TenderLevel];
      made.push({ player, words, pays: { salary: capHit(pending, year + 1, league.rules), year: year + 1 } });
      continue;
    }
    const deal = currentDeal(league, player);
    const option = deal?.type === 'rookie' && deal.years[2]?.year === year ? deal.fifthYearOption : null;
    const fifth = deal?.years.at(-1);
    if (option === 'exercised' && fifth)
      made.push({ player, words: 'Fifth-year option exercised', pays: { salary: fifth.base, year: fifth.year } });
    if (option === 'declined' && fifth)
      made.push({ player, words: `Fifth-year option declined: a free agent after ${fifth.year}`, pays: null });
  }
  return made.sort((a, b) => b.player.ovr - a.player.ovr || (a.player.id < b.player.id ? -1 : 1));
} // prettier-ignore

/**
 * The extension choices (spec 11.6): the user's own offer, with every term, which he answers when it's sent
 * with a yes, a no, or a counter; or the extension the user's GM settles.
 */
function extensionChoices(app: AppState, league: League, player: Player): MoveChoice[] {
  const team = league.meta.start.userTeam;
  const name = fullName(player);
  const minimum = minimumSalary(league.rules, creditedNextYear(league, player));
  const start = Math.min(3, TUNING.contracts.acceptance.maxYears);
  const ask = askOf(league, player, team, start, true);
  const terms = offerTerms({
    id: 'extend',
    lengthLabel: 'Extension length',
    minimum,
    salaryHint: `His minimum then is ${money(minimum, true)}.`,
    prorationMax: league.rules.pay.prorationYearsMax,
    finalHint: 'He answers yes or no, with no counter, and a no ends your talks until you advance.',
    start: talks(league, team, player.id).counter ?? { years: start, salary: ask, signingBonus: 0 },
    advice: estimateAdvice(league, team, player, true)
  });
  const state = h('p', null);
  const showTalks = () => {
    const now = talks(app.league ?? league, team, player.id);
    state.textContent = now.closed
      ? "He's broken off talks with you until you advance."
      : now.counter
        ? `He's turned down ${plural(now.rounds, 'offer')} from you. His last counter: ${counterWords(now.counter)}, on the rest of your terms.`
        : `His agent asks for ${money(ask, true)} a year over ${plural(start, 'year')} to stay, and comes down as you talk.`;
  };
  showTalks();
  const years = termFor(ageOn(player.birthDate, calendarDay(league.date)));
  const settled = settledSalary(league, player, team, years, true);
  return [
    {
      label: 'Offer an extension',
      confirm: `Extend ${name}`,
      inputs: h('div', { class: 'stack' }, state, terms.element),
      incomplete: 'Fix the highlighted details to see what this extension does.',
      move: () => {
        const offer = terms.read();
        return offer ? { kind: 'extend', team, playerId: player.id, offer, talks: true } : null;
      },
      refused: () => {
        const counter = talks(app.league ?? league, team, player.id).counter;
        if (counter) terms.set(counter);
        showTalks();
      }
    },
    {
      label: `Have your GM negotiate: ${money(settled, true)} a year for ${plural(years, 'year')}`,
      confirm: `Extend ${name}`,
      move: () => ({ kind: 'extend', team, playerId: player.id, offer: { years, salary: settled, signingBonus: 0 } })
    }
  ];
} // prettier-ignore

function openExpiring(
  app: AppState,
  league: League,
  player: Player,
  trigger: HTMLElement,
  done: () => void
): void {
  const team = league.meta.start.userTeam;
  const name = fullName(player);
  const kind = freeAgentKind(league, player);
  const window = league.date.phase === 'resign';
  const next = leagueYear(league.date) + 1;
  const choices: MoveChoice[] = extensionChoices(app, league, player);
  if (window) {
    for (const tag of ['exclusive', 'nonExclusive', 'transition'] as TagKind[])
      choices.push({ label: `${TAG_LABELS[tag]}: ${money(tagSalary(league, player, tag), true)} for ${next}`, confirm: `Tag ${name}`, move: () => ({ kind: 'tag', team, playerId: player.id, tag }) });
    for (const level of tenderLevels(league, player))
      choices.push({ label: `${TENDER_LABELS[level]}: ${money(tenderSalary(league, player, level), true)} for ${next}`, confirm: `Tender ${name}`, move: () => ({ kind: 'tender', team, playerId: player.id, level }) });
  } // prettier-ignore
  openMoveDialog(
    app,
    {
      id: 'resignDialog',
      title: `Keep ${name}`,
      intro: `${name}, ${player.position}, OVR ${player.ovr}. His deal runs out when the ${next} league year opens; he'd be ${KIND_WORDS[kind]} then.${player.demand?.kind === 'holdout' ? " He's holding out for a new deal: an extension ends it." : player.demand ? ' He has asked to be traded: an extension can win him back.' : ''}${window ? '' : ' Tags and tenders open in the re-sign window.'}`,
      choices
    },
    trigger,
    done
  ); // prettier-ignore
}

function openOption(
  app: AppState,
  league: League,
  player: Player,
  trigger: HTMLElement,
  done: () => void
): void {
  const team = league.meta.start.userTeam;
  const name = fullName(player);
  const option = optionSalary(league, player);
  const fifth = (currentDeal(league, player)?.years.at(-1)?.year ?? leagueYear(league.date) + 1) + 1;
  openMoveDialog(
    app,
    {
      id: 'optionDialog',
      title: `${name}'s fifth-year option`,
      intro: `${name}, ${player.position}, OVR ${player.ovr}. His option pays at the ${TIER_LABELS[option.tier].toLowerCase()}: ${money(option.salary, true)} for ${fifth}, fully guaranteed once exercised.`,
      choices: [
        { label: 'Exercise his option', confirm: `Exercise ${name}'s option`, move: () => ({ kind: 'option', team, playerId: player.id, exercise: true }) },
        { label: 'Decline his option', confirm: `Decline ${name}'s option`, danger: true, move: () => ({ kind: 'option', team, playerId: player.id, exercise: false }) }
      ]
    },
    trigger,
    done
  ); // prettier-ignore
}

export function contractsScreen(): Screen {
  let off: (() => void) | null = null;
  return {
    title: 'Contracts',
    dispose: () => off?.(),
    render: ({ app }) => {
      const view = h('section', { class: 'view' });
      if (!app.league) return view;
      // Rebuilds replace the content; the status stays put, so screen readers hear each change.
      const content = h('div');
      const status = h('p', { class: 'sr-only', role: 'status' });
      view.append(content, status);
      let shown: League | null = null;
      // A step played in the background: rebuild, keeping focus on the same control.
      off = app.onChange(() => {
        if (!app.league || app.league === shown) return;
        const label = document.activeElement?.getAttribute('aria-label') ?? null;
        build();
        refocus(view, label, null, 0);
      });
      /** After a decision its row leaves the list: focus goes to the next row's Decide button. */
      const after = (trigger: HTMLElement) => {
        const index = placeOf(view, trigger, DECIDE);
        return () => {
          build();
          refocus(view, null, DECIDE, index);
        };
      };

      const build = (): void => {
        const league = app.league;
        if (!league) return;
        shown = league;
        const abbr = league.meta.start.userTeam;
        const today = calendarDay(league.date);
        const year = leagueYear(league.date);
        const window = league.date.phase === 'resign';
        const auto = league.settings.auto.contracts;
        const { expiring, options } = windowDecisions(league, abbr);
        const age = (p: Player) => ageOn(p.birthDate, today);
        const hit = (p: Player) => {
          const c = currentDeal(league, p);
          return c ? capHit(c, year, league.rules) : 0;
        };
        const asks = new Map(expiring.map(p => [p.id, askOf(league, p, abbr, 1, true)]));
        const optionPay = new Map(options.map(p => [p.id, optionSalary(league, p).salary]));

        // Each call makes a fresh button: the table and the phone list both show one.
        const decide = (p: Player, open: typeof openExpiring): HTMLElement => {
          const button = h('button', { class: 'btn btn-outline', type: 'button', 'aria-label': `${DECIDE}${fullName(p)}` }, 'Decide');
          button.addEventListener('click', () => open(app, league, p, button, after(button)));
          return button;
        }; // prettier-ignore
        const listRow = (p: Player, sub: string, action: HTMLElement | null) =>
          h('li', { class: 'list-row' }, h('span', { class: 'pos' }, p.position), h('div', { class: 'list-main' }, playerLink(p), h('p', { class: 'list-sub' }, sub)), tierPlate(p.ovr), action ? h('div', { class: 'btn-row' }, action) : null); // prettier-ignore
        const common: TableColumn<Player>[] = [
          { id: 'position', label: 'Pos', title: 'Position', name: 'position', type: 'number', first: 'asc', words: ['quarterbacks first', 'specialists first'], className: 'pos-col', value: p => POSITIONS.indexOf(p.position), cell: p => h('td', null, p.position) },
          { id: 'player', label: 'Player', name: 'player', type: 'text', value: p => `${p.lastName} ${p.firstName}`, cell: p => h('th', { scope: 'row' }, playerLink(p)) },
          { id: 'age', label: 'Age', name: 'age', type: 'number', numeric: true, className: 'age-col', value: age, cell: p => h('td', { class: 'num' }, String(age(p))) },
          { id: 'ovr', label: 'OVR', title: 'Overall', name: 'overall', type: 'rating', className: 'ovr-col', value: p => p.ovr, cell: p => h('td', null, tierPlate(p.ovr)) }
        ]; // prettier-ignore

        const expiringList = h('ul', { class: 'roster-list', 'aria-label': 'Expiring contracts' });
        const demanding = (p: Player) =>
          p.demand ? `${p.demand.kind === 'holdout' ? 'holding out' : 'wants a trade'} · ` : '';
        const expiringItems = new Map(
          expiring.map(p => [
            p.id,
            listRow(
              p,
              `${demanding(p)}Age ${age(p)} · ${KIND_LABELS[freeAgentKind(league, p)].toLowerCase()} · asks ${money(asks.get(p.id) ?? 0)} a year`,
              decide(p, openExpiring)
            )
          ])
        );
        const expiringTable = sortableTable({
          key: 'contracts.expiring', name: 'expiring contracts', caption: `Contracts that run out when the ${year + 1} league year opens`, captionClass: 'sr-only', className: 'roster-table', status,
          columns: [
            ...common.map(c => (c.id === 'player' ? { ...c, cell: (p: Player) => h('th', { scope: 'row' }, playerLink(p), demandTag(p) ? ' ' : null, demandTag(p)) } : c)),
            { id: 'kind', label: 'Free agent', name: 'free agent kind', type: 'text', value: p => KIND_LABELS[freeAgentKind(league, p)], cell: p => h('td', null, KIND_LABELS[freeAgentKind(league, p)]) },
            { id: 'hit', label: `${year} cap hit`, name: `${year} cap hit`, type: 'money', numeric: true, className: 'cap-col', value: hit, cell: p => h('td', { class: 'num' }, money(hit(p))) },
            { id: 'ask', label: 'Asks a year', name: 'asking salary', type: 'money', numeric: true, className: 'cap-col', value: p => asks.get(p.id), cell: p => h('td', { class: 'num' }, money(asks.get(p.id) ?? 0)) },
            { id: 'decide', label: 'Decision', name: 'decision', type: 'custom', sortable: false, hideLabel: true, className: 'claim-col', cell: p => h('td', null, decide(p, openExpiring)) }
          ],
          rows: expiring, rowId: p => p.id, defaultOrder: 'by overall, highest first',
          onSort: ordered => expiringList.replaceChildren(...ordered.map(p => expiringItems.get(p.id) as HTMLElement))
        }); // prettier-ignore

        const optionsList = h('ul', { class: 'roster-list', 'aria-label': 'Fifth-year options to decide' });
        const optionItems = new Map(
          options.map(p => [
            p.id,
            listRow(
              p,
              `Age ${age(p)} · option pays ${money(optionPay.get(p.id) ?? 0)}`,
              window ? decide(p, openOption) : null
            )
          ])
        );
        const optionsTable = sortableTable({
          key: 'contracts.options', name: 'fifth-year options', caption: window ? 'Fifth-year options to decide' : 'Fifth-year options to decide in the re-sign window', captionClass: 'sr-only', className: 'roster-table', status,
          columns: [
            ...common,
            { id: 'salary', label: 'Option salary', name: 'option salary', type: 'money', numeric: true, className: 'cap-col', value: p => optionPay.get(p.id), cell: p => h('td', { class: 'num' }, money(optionPay.get(p.id) ?? 0)) },
            ...(window ? [{ id: 'decide', label: 'Decision', name: 'decision', type: 'custom', sortable: false, hideLabel: true, className: 'claim-col', cell: p => h('td', null, decide(p, openOption)) } satisfies TableColumn<Player>] : [])
          ],
          rows: options, rowId: p => p.id, defaultOrder: 'by overall, highest first',
          onSort: ordered => optionsList.replaceChildren(...ordered.map(p => optionItems.get(p.id) as HTMLElement))
        }); // prettier-ignore

        const made = decisionsMade(league, abbr);
        const paysText = (d: Decided) =>
          d.pays ? `${money(d.pays.salary)} in ${d.pays.year}` : 'Nothing more';
        const madeList = h('ul', { class: 'roster-list', 'aria-label': 'Decisions made' });
        const madeItems = new Map(
          made.map(d => [d.player.id, listRow(d.player, `${d.words} · ${paysText(d).toLowerCase()}`, null)])
        );
        const madeTable = sortableTable<Decided>({
          key: 'contracts.decided', name: 'decisions made', caption: `Decisions made in the ${year} league year`, captionClass: 'sr-only', className: 'roster-table', status,
          columns: [
            { id: 'position', label: 'Pos', title: 'Position', name: 'position', type: 'number', first: 'asc', words: ['quarterbacks first', 'specialists first'], className: 'pos-col', value: d => POSITIONS.indexOf(d.player.position), cell: d => h('td', null, d.player.position) },
            { id: 'player', label: 'Player', name: 'player', type: 'text', value: d => `${d.player.lastName} ${d.player.firstName}`, cell: d => h('th', { scope: 'row' }, playerLink(d.player)) },
            { id: 'ovr', label: 'OVR', title: 'Overall', name: 'overall', type: 'rating', className: 'ovr-col', value: d => d.player.ovr, cell: d => h('td', null, tierPlate(d.player.ovr)) },
            { id: 'decision', label: 'Decision', name: 'decision', type: 'text', value: d => d.words, cell: d => h('td', null, d.words) },
            { id: 'pays', label: 'Pays', name: 'salary it pays', type: 'money', numeric: true, value: d => d.pays?.salary ?? 0, cell: d => h('td', { class: 'num' }, paysText(d)) }
          ],
          rows: made, rowId: d => d.player.id, defaultOrder: 'by overall, highest first',
          onSort: ordered => madeList.replaceChildren(...ordered.map(d => madeItems.get(d.player.id) as HTMLElement))
        }); // prettier-ignore

        const intro = auto
          ? h('p', null, window ? 'Your staff makes the contract decisions you leave open when the re-sign window closes. You can still decide any player here first. ' : 'Your staff makes your contract decisions in the re-sign window. You can still extend players here. ', h('a', { href: href('settings') }, 'Change this under Automation in Settings'), '.')
          : h('p', null, window ? 'The re-sign window is open: extend, tag, or tender your players before their deals run out, and decide your fifth-year options.' : `Extensions are open until the ${year + 1} league year starts; tags, tenders, and options wait for the re-sign window after the season.`); // prettier-ignore
        mount(
          content,
          pageHead('Contracts', teamFullName(abbr)),
          intro,
          h('div', { class: 'stack' },
            card('Expiring contracts', expiring.length ? h('div', { class: 'roster-region' }, expiringTable.element, expiringList) : h('p', { class: 'empty' }, `No contracts run out when the ${year + 1} league year opens.`)),
            card('Fifth-year options', options.length && !window ? h('p', { class: 'muted' }, 'Fifth-year options are decided in the re-sign window after the season.') : null, options.length ? h('div', { class: 'roster-region' }, optionsTable.element, optionsList) : h('p', { class: 'empty' }, window ? 'No fifth-year options to decide this year.' : 'Fifth-year options are decided in the re-sign window after the season.')),
            card('Decided this year', made.length ? h('div', { class: 'roster-region' }, madeTable.element, madeList) : h('p', { class: 'empty' }, 'No extensions, tags, tenders, or options yet this league year.')))
        ); // prettier-ignore
      };
      build();
      return view;
    }
  };
}
