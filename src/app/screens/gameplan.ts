/**
 * Game plan (spec 8.7): the week's opponent, the scouting report the staff plans from, the plan's dials
 * and player focus, and the switch that hands the plan to the coaching staff. Changes apply to the next
 * game and save shortly after; changing anything while the staff has the plan takes it back and says so.
 */
import type { ScheduledGame } from '../../data/schedule';
import { teamFullName, type TeamAbbr } from '../../data/team-colors';
import { scoutingReport, type ScoutedPlayer, type ScoutingReport } from '../../engine/ai/scouting';
import type { League } from '../../engine/league/types';
import { fullName, type Player } from '../../engine/model/player';
import type { Position } from '../../engine/model/positions';
import { PLAN_LIMITS, type GamePlan } from '../../engine/sim/plan';
import { h } from '../dom';
import { gameDay, kickoff } from '../format';
import { pageHead } from './common';
import type { Screen } from './types';

type Dial = 'passLean' | 'spread' | 'blitz' | 'man' | 'press' | 'twoHigh' | 'nickel';

/** The plan's dials: five settings each, evenly spaced across the plan's limits, normal in the middle. */
const DIALS: readonly { key: Dial; legend: string; hint: string; labels: readonly string[] }[] = [
  { key: 'passLean', legend: 'Run and pass balance', hint: 'On offense, every down.', labels: ['Run heavy', 'Lean run', 'Balanced', 'Lean pass', 'Pass heavy'] },
  { key: 'spread', legend: 'Personnel', hint: 'More receivers on the field, or more tight ends and backs.', labels: ['Heavy sets', 'Lean heavy', 'Normal', 'Lean spread', 'Spread'] },
  { key: 'blitz', legend: 'Blitzing', hint: 'How often extra rushers come.', labels: ['Rarely', 'Less', 'Normal', 'More', 'Often'] },
  { key: 'man', legend: 'Man or zone', hint: 'Your coverage mix.', labels: ['Mostly zone', 'Lean zone', 'Normal', 'Lean man', 'Mostly man'] },
  { key: 'press', legend: 'Press coverage', hint: 'Corners jamming receivers at the line in man.', labels: ['Play off', 'Less press', 'Normal', 'More press', 'Press often'] },
  { key: 'twoHigh', legend: 'Safety shells', hint: 'Two deep safeties against the deep ball, or one with a safety near the line.', labels: ['Single-high', 'Lean single-high', 'Normal', 'Lean two-high', 'Two-high'] },
  { key: 'nickel', legend: 'Defensive packages', hint: 'Extra defensive backs in place of linebackers.', labels: ['Base', 'Lean base', 'Normal', 'Lean nickel', 'Nickel and dime'] }
]; // prettier-ignore

const settingsOf = (key: Dial): number[] => {
  const [lo, hi] = PLAN_LIMITS[key];
  return [0, 1, 2, 3, 4].map(i => lo + ((hi - lo) * i) / 4);
};

/** The setting closest to a value. */
const nearest = (key: Dial, value: number): number => {
  const settings = settingsOf(key);
  return settings.reduce(
    (best, v, i) => (Math.abs(v - value) < Math.abs((settings[best] ?? 0) - value) ? i : best),
    0
  );
};

/** The next game for a team: this week's, or the first one still to play. */
function nextGame(league: League, abbr: TeamAbbr): ScheduledGame | null {
  return (
    league.schedule
      .filter(g => (g.home === abbr || g.away === abbr) && !league.season.results[g.id])
      .sort((a, b) => a.week - b.week || (a.date < b.date ? -1 : 1))[0] ?? null
  );
}

/** Rating points with a sign and one decimal: "+6.0", "−2.3". */
const points = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded < 0 ? `−${Math.abs(rounded).toFixed(1)}` : '0.0';
};

/** A matchup edge in words, with its points. */
function edgeText(value: number): string {
  const verdict = value >= 2 ? 'Edge to you' : value <= -2 ? 'Edge to them' : 'Even';
  return `${verdict} (${points(value)})`;
}

function reportCard(report: ScoutingReport): HTMLElement {
  const item = (term: string, detail: string) => [h('dt', null, term), h('dd', null, detail)];
  const standout = (who: ScoutedPlayer | null, what: string) =>
    who ? `${who.name} (${who.position}), ${points(who.margin)} ${what}` : 'Nobody stands out';
  const percent = (share: number) => `${Math.round(share * 100)}%`;
  return h(
    'section',
    { class: 'card' },
    h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title' }, 'Scouting report')),
    h(
      'div',
      { class: 'card-body' },
      h(
        'p',
        { class: 'muted' },
        'Matchups in rating points, starter against starter; plus favors you. Your staff builds its plan from this report.'
      ),
      h(
        'dl',
        { class: 'report-list' },
        ...item('Your passing game against their pass defense', edgeText(report.passEdge)),
        ...item('Your running game against their run defense', edgeText(report.runEdge)),
        ...item('Their pass protection against your rush', edgeText(-report.protection)),
        ...item('Your man coverage against their receivers', edgeText(report.manEdge)),
        ...item('Your zone coverage against their receivers', edgeText(report.zoneEdge)),
        ...item(
          "Their quarterback's poise under pressure",
          `${points(report.poise)} against a typical starter`
        ),
        ...item("Their quarterback's escapability", `${points(report.escape)} against a typical starter`),
        ...item('Their deep passing threat', `${points(report.deepThreat)} against a typical starter`),
        ...item('Their three-receiver sets', percent(report.spreadShare)),
        ...item('Your top playmaker', standout(report.playmaker, 'over your other receivers')),
        ...item('Their top receiver', standout(report.topReceiver, 'over their other receivers')),
        ...item('Their top pass rusher', standout(report.topRusher, "against your line's blocking"))
      )
    )
  );
}

export function gamePlanScreen(): Screen {
  return {
    title: 'Game plan',
    render: ({ app }) => {
      const league = app.league;
      if (!league) return h('section', { class: 'view' }, pageHead('Game plan'));
      const abbr = league.meta.start.userTeam;
      const team = league.teams[abbr];
      const game = nextGame(league, abbr);
      const opponent = game ? (game.home === abbr ? game.away : game.home) : null;
      const status = h('p', { class: 'sr-only', role: 'status' });
      const announce = (message: string) => {
        status.textContent = message;
      };

      const autoHint = h('p', { class: 'muted', id: 'plan-auto-hint' });
      const autoSwitch = h('button', {
        class: 'switch',
        type: 'button',
        role: 'switch',
        'aria-labelledby': 'plan-auto-label',
        'aria-describedby': 'plan-auto-hint'
      });
      const syncAuto = () => {
        autoSwitch.setAttribute('aria-checked', String(team.plan.auto));
        autoHint.textContent = team.plan.auto
          ? 'Your coordinators build a plan for each opponent from the scouting report. Any change you make takes the plan back.'
          : 'You set the plan. Turn this on to hand it to your coordinators; they plan the next game before kickoff.';
      };
      autoSwitch.addEventListener('click', () => {
        app.edit(l => {
          l.teams[abbr].plan.auto = !l.teams[abbr].plan.auto;
        });
        syncAuto();
        announce(
          team.plan.auto
            ? 'Your coordinators will build the plan before the next game.'
            : 'You set the game plan now.'
        );
      });
      syncAuto();

      /** Applies a user change to the plan, taking it back from the staff if they had it. */
      const change = (apply: (plan: GamePlan) => void, message: string) => {
        const took = team.plan.auto;
        app.edit(l => {
          apply(l.teams[abbr].plan.plan);
          l.teams[abbr].plan.auto = false;
        });
        if (took) syncAuto();
        announce(
          message + (took ? ' You now set the game plan; your coordinators stopped making changes.' : '')
        );
      };

      const dialField = (dial: (typeof DIALS)[number]) => {
        const current = nearest(dial.key, team.plan.plan[dial.key]);
        const settings = settingsOf(dial.key);
        return h(
          'fieldset',
          { class: 'plan-dial', 'aria-describedby': `dial-${dial.key}-hint` },
          h('legend', { class: 'field-label' }, dial.legend),
          h('p', { class: 'muted', id: `dial-${dial.key}-hint` }, dial.hint),
          h(
            'div',
            { class: 'seg' },
            ...dial.labels.map((label, i) => {
              const input = h('input', {
                type: 'radio',
                name: `dial-${dial.key}`,
                value: String(i),
                checked: i === current
              });
              input.addEventListener('change', () =>
                change(plan => {
                  plan[dial.key] = settings[i] ?? plan[dial.key];
                }, `${dial.legend}: ${label}.`)
              );
              return h('label', null, input, label);
            })
          )
        );
      };

      const roster = (abbrOf: TeamAbbr, positions: readonly Position[]) =>
        Object.values(league.players)
          .filter(p => p.team === abbrOf && p.status === 'active' && positions.includes(p.position))
          .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
      // The menus change nothing until Apply, so browsing one with the arrow keys is safe.
      const focusSelects: {
        key: 'feature' | 'shadow' | 'doubleReceiver' | 'doubleRusher';
        label: string;
        select: HTMLSelectElement;
      }[] = [];
      const applyFocus = h('button', { class: 'btn btn-solid', type: 'button' }, 'Apply player focus');
      applyFocus.addEventListener('click', () => {
        const changed = focusSelects.filter(f => (f.select.value || null) !== team.plan.plan[f.key]);
        if (!changed.length) {
          announce('Player focus is unchanged.');
          return;
        }
        change(plan => {
          for (const f of changed) plan[f.key] = f.select.value || null;
        }, changed.map(f => `${f.label}: ${f.select.value ? fullName(league.players[f.select.value] as Player) : 'nobody'}.`).join(' '));
      }); // prettier-ignore
      const focusField = (key: 'feature' | 'shadow' | 'doubleReceiver' | 'doubleRusher', label: string, hint: string, players: Player[]) => {
        const id = `focus-${key}`;
        const select = h(
          'select',
          { class: 'select', id, 'aria-describedby': `${id}-hint` },
          h('option', { value: '' }, 'Nobody'),
          ...players.map(p => h('option', { value: p.id, selected: team.plan.plan[key] === p.id }, `${fullName(p)} (${p.position}, OVR ${p.ovr})`))
        );
        focusSelects.push({ key, label, select });
        return h('div', { class: 'field' }, h('label', { for: id }, label), select, h('p', { class: 'muted', id: `${id}-hint` }, hint));
      }; // prettier-ignore

      const spy = h('input', { type: 'checkbox', id: 'focus-spy', checked: team.plan.plan.spy });
      spy.addEventListener('change', () =>
        change(
          plan => {
            plan.spy = spy.checked;
          },
          spy.checked ? 'A spy will shadow their quarterback.' : 'No spy on their quarterback.'
        )
      );

      const header = game && opponent
        ? `Week ${game.week}: ${game.home === abbr ? 'against' : 'at'} the ${teamFullName(opponent)}, ${gameDay(game.date, game.day)} at ${kickoff(game.timeEt)}.`
        : 'No game left to play this season.'; // prettier-ignore

      return h(
        'section',
        { class: 'view' },
        pageHead('Game plan', teamFullName(abbr)),
        h('p', null, header),
        h(
          'div',
          { class: 'card depth-auto' },
          h('div', { class: 'switch-row' }, h('span', { class: 'field-label', id: 'plan-auto-label' }, 'Coordinators set the game plan'), autoSwitch),
          autoHint
        ),
        opponent ? reportCard(scoutingReport(league, abbr, opponent)) : null,
        h(
          'section',
          { class: 'card' },
          h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title' }, 'The plan')),
          h('div', { class: 'card-body plan-dials' }, ...DIALS.map(dialField))
        ),
        h(
          'section',
          { class: 'card' },
          h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title' }, 'Player focus')),
          h(
            'div',
            { class: 'card-body plan-focus' },
            focusField('feature', 'Feature', 'More targets for a receiver, or more carries for a back.', roster(abbr, ['WR', 'TE', 'HB', 'FB'])),
            ...(opponent
              ? [
                  focusField('shadow', 'Shadow with your top corner', 'Your top cornerback follows him wherever he lines up.', roster(opponent, ['WR', 'TE'])),
                  focusField('doubleReceiver', 'Double-team a receiver', 'A safety helps on him every pass, which leaves a little room elsewhere.', roster(opponent, ['WR', 'TE'])),
                  focusField('doubleRusher', 'Chip a pass rusher', 'A back or tight end hits him before running his route.', roster(opponent, ['LE', 'RE', 'DT', 'LOLB', 'ROLB']))
                ]
              : []),
            h('div', { class: 'btn-row' }, applyFocus),
            h('label', { class: 'check-target check-left' }, spy, 'Spy their quarterback')
          )
        ),
        status
      ); // prettier-ignore
    }
  };
}
