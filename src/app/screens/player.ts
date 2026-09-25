/**
 * Player page (style guide 11): profile, fit in the user's schemes with the breakdown (spec 7.3, 7.7),
 * ratings, traits, abilities, career stats with game logs (spec 9), and the contract (spec 11.2).
 */
import { teamFullName } from '../../data/team-colors';
import { ability, type Ability } from '../../engine/abilities/catalog';
import { rolesFor, type FitContext, type RoleRating } from '../../engine/fit/role-rating';
import { leagueFitContext } from '../../engine/league/fit';
import { calendarDay, playoffRoundName } from '../../engine/model/calendar';
import { ageOn, fullName, type Player } from '../../engine/model/player';
import { RATING_GROUPS, RATING_LABELS, type RatingKey } from '../../engine/model/ratings';
import type { Traits } from '../../engine/model/traits';
import { HAND_SET_FORMULAS } from '../../engine/ratings/overall';
import { DEFENSE_LIST, OFFENSE_LIST } from '../../engine/schemes/catalog';
import { named, resolveDefense, resolveOffense } from '../../engine/schemes/resolve';
import { CONTEXT_TRIGGERS, TRIGGER_LABELS } from '../../engine/schemes/situations';
import { DEFENSE_SLOTS, DUTY_SLOTS, FIT_SLOTS, OFFENSE_SLOTS } from '../../engine/schemes/slots';
import { h, mount } from '../dom';
import { careerCard } from '../ui/career';
import { contractCard } from '../ui/contract';
import { href } from '../router';
import { fitNode, fitSentence } from '../ui/fit';
import { attributeRow, devTag, heightText, injuryTag, stat, statusTag, tierPlate } from '../ui/players';
import { card, pageHead } from './common';
import type { Screen } from './types';

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
function traitList(player: Player): string[] {
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

function triggerText(a: Ability): string {
  const plays = a.triggers.map(t => TRIGGER_LABELS[t]).join(' or ');
  const contexts = (a.contexts ?? []).filter(c => (CONTEXT_TRIGGERS as readonly string[]).includes(c));
  return contexts.length ? `${plays}, ${contexts.map(c => TRIGGER_LABELS[c]).join(' or ')}` : plays;
}

function roleRows(roles: readonly RoleRating[], label: string, withFit: boolean): HTMLElement {
  return h(
    'ul',
    { class: 'preview-list', 'aria-label': label },
    ...roles.map(r =>
      h(
        'li',
        null,
        h('span', { class: 'pos' }, r.slot),
        h('span', null, r.label),
        tierPlate(r.rating, { what: 'Role rating' }),
        withFit ? h('span', null, 'Fit ', fitNode(r.fit)) : null
      )
    )
  );
}

function schemeLine(ctx: FitContext): string {
  return `${ctx.offense.name} offense and ${ctx.defense.name} defense`;
}

export function playerScreen(): Screen {
  const screen: Screen = {
    title: 'Player',
    render: screenCtx => {
      const { app, route } = screenCtx;
      const league = app.league;
      const player = league?.players[route.params.id ?? ''];
      // The document title follows the page heading (WCAG 2.4.2).
      screen.title = player ? fullName(player) : 'Player not found';
      if (!league || !player) {
        return h(
          'section',
          { class: 'view' },
          pageHead('Player not found'),
          h(
            'p',
            { class: 'empty' },
            "This player isn't in the league. Go back to the roster to choose another."
          ),
          h('p', null, h('a', { class: 'btn btn-outline', href: href('roster') }, 'Back to roster'))
        );
      }
      const userTeam = league.meta.start.userTeam;
      const ctx = leagueFitContext(league, userTeam);
      const age = ageOn(player.birthDate, calendarDay(league.date));
      const tag = [
        player.position,
        `#${player.jersey}`,
        player.team ? teamFullName(player.team) : 'Free agent'
      ].join(' · ');
      const head = h(
        'article',
        { class: 'card' },
        h(
          'div',
          { class: 'player-head on-team' },
          h(
            'div',
            { class: 'nameplate' },
            h('span', { class: 'nameplate-tag' }, tag),
            h('h1', { class: 'nameplate-name nameplate-on-team', tabindex: '-1' }, fullName(player))
          ),
          h('span', { class: 'twill', 'aria-hidden': 'true' }, player.jersey)
        ),
        h('div', { class: 'stripes', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
        h(
          'div',
          { class: 'card-body' },
          h(
            'div',
            { class: 'stat-grid' },
            stat('Overall', tierPlate(player.ovr, { large: true })),
            stat('Development', devTag(player.dev)),
            stat('Age', age),
            stat('Height and weight', `${heightText(player.height)}, ${player.weight} lb`),
            stat(
              'Experience',
              player.experience === 0
                ? 'Rookie'
                : `${player.experience} ${player.experience === 1 ? 'season' : 'seasons'}`
            ),
            stat('College', player.college || '— · Not known'),
            stat('Status', statusTag(player.status)),
            // The injury he carries (spec 19.3): its designation, what's hurt, and how long he's out.
            player.injury && injuryTag(player)
              ? stat(
                  'Injury',
                  h(
                    'span',
                    { class: 'injury-line' },
                    injuryTag(player),
                    ` ${player.injury.bodyPart}${player.injury.lingering > 0 && player.injury.weeksOut === 0 ? ', playing through it' : ''}`
                  )
                )
              : null
          )
        )
      );

      // Fit in the user's schemes, with a comparison against any named scheme on the player's side.
      const mine = rolesFor(player, ctx, FIT_SLOTS);
      const side = mine[0]
        ? (OFFENSE_SLOTS as readonly string[]).includes(mine[0].slot)
          ? 'offense'
          : (DEFENSE_SLOTS as readonly string[]).includes(mine[0].slot)
            ? 'defense'
            : 'special'
        : 'special';
      const fitBody = h('div', { class: 'stack' });
      const drawFit = (choice: string) => {
        let view = ctx;
        if (choice !== 'mine' && side === 'offense')
          view = { ...ctx, offense: resolveOffense(named(choice as (typeof OFFENSE_LIST)[number]['id'])) };
        if (choice !== 'mine' && side === 'defense')
          view = { ...ctx, defense: resolveDefense(named(choice as (typeof DEFENSE_LIST)[number]['id'])) };
        const roles = rolesFor(player, view, FIT_SLOTS);
        const best = roles[0];
        const duties = rolesFor(player, view, DUTY_SLOTS);
        mount(
          fitBody,
          best
            ? h('p', null, fitSentence(best, league.settings.fitCap))
            : h('p', { class: 'empty' }, 'No role in these schemes suits his position.'),
          roles.length ? roleRows(roles, 'Roles he can play', true) : null,
          duties.length ? h('h3', null, 'Return and coverage duties') : null,
          duties.length ? roleRows(duties, 'Return and coverage duties', false) : null
        );
      };
      const schemes = side === 'offense' ? OFFENSE_LIST : side === 'defense' ? DEFENSE_LIST : [];
      const compare = schemes.length
        ? (() => {
            const select = h(
              'select',
              { class: 'select', id: 'fitScheme' },
              h('option', { value: 'mine' }, 'Your scheme'),
              ...schemes.map(s => h('option', { value: s.id }, s.name))
            );
            select.addEventListener('change', () => drawFit(select.value));
            return h('div', { class: 'field' }, h('label', { for: 'fitScheme' }, 'Show fit in'), select);
          })()
        : null;
      drawFit('mine');
      const fitCard = card(
        'Scheme fit',
        h(
          'p',
          { class: 'muted' },
          `Your team runs the ${schemeLine(ctx)}. Fit is his role rating minus his overall.`
        ),
        compare,
        fitBody
      );

      // Ratings: the ones his overall weighs first, then every group behind a toggle.
      const key = (Object.entries(HAND_SET_FORMULAS[player.position].coefficients) as [RatingKey, number][])
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => k);
      const all = h(
        'div',
        { class: 'stack', id: 'allRatings', hidden: true },
        ...Object.entries(RATING_GROUPS).map(([group, keys]) =>
          h(
            'div',
            { class: 'stack' },
            h('h3', null, group),
            ...keys.map(k => attributeRow(RATING_LABELS[k], player.ratings[k]))
          )
        )
      );
      const toggle = h(
        'button',
        { class: 'btn btn-outline', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'allRatings' },
        'Show all ratings'
      );
      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? 'Hide all ratings' : 'Show all ratings';
        all.hidden = !open;
      });
      const ratingsCard = card(
        'Ratings',
        h('h3', null, `Key ratings for his position (${player.position})`),
        h('div', { class: 'stack' }, ...key.map(k => attributeRow(RATING_LABELS[k], player.ratings[k]))),
        toggle,
        all
      );

      const abilities = player.abilities.flatMap(id => {
        const a = ability(id);
        return a ? [a] : [];
      });
      const traits = traitList(player);
      const traitsCard = card(
        'Abilities and traits',
        h('h3', null, 'Abilities'),
        abilities.length
          ? h(
              'ul',
              { class: 'preview-list' },
              ...abilities.map(a =>
                h(
                  'li',
                  null,
                  h('strong', null, a.name),
                  h('span', { class: 'chip' }, `Tier ${a.tier}`),
                  h('span', { class: 'hint' }, `${a.description} Triggers ${triggerText(a)}.`)
                )
              )
            )
          : h('p', { class: 'muted' }, 'No abilities.'),
        h('h3', null, 'Traits'),
        traits.length
          ? h('ul', { class: 'preview-list', 'aria-label': 'Traits' }, ...traits.map(t => h('li', null, t)))
          : h('p', { class: 'muted' }, 'No notable traits.')
      );

      // The contract, with the user's roster moves; a move redraws the whole page (his status changes too).
      const contractSlot = contractCard(app, league, player, () => {
        const next = screen.render(screenCtx) as HTMLElement;
        page.replaceWith(next);
        const heading = [...next.querySelectorAll<HTMLElement>('h2')].find(e => e.textContent === 'Contract');
        heading?.setAttribute('tabindex', '-1');
        heading?.focus();
      });

      // Career stats load from the history store (spec 9.3).
      const history = app.store.history;
      const leagueId = league.meta.id;
      const careerSlot = h(
        'div',
        null,
        card('Career stats', h('p', { class: 'muted' }, 'Loading career stats…'))
      );
      history.playerHistory(leagueId, player.id).then(
        found =>
          mount(
            careerSlot,
            careerCard({
              position: player.position,
              history: found,
              loadLog: season => history.gameLog(leagueId, player.id, season),
              roundName: week => playoffRoundName(week, league.rules.season)
            })
          ),
        () =>
          mount(
            careerSlot,
            card(
              'Career stats',
              h(
                'p',
                { class: 'empty' },
                "Career stats couldn't be read from this browser's storage. Reload the page to try again."
              )
            )
          )
      );

      const page = h(
        'section',
        { class: 'view' },
        h('p', null, h('a', { class: 'btn btn-outline', href: href('roster') }, 'Back to roster')),
        h('div', { class: 'stack' }, head, contractSlot, fitCard, ratingsCard, traitsCard, careerSlot)
      );
      return page;
    }
  };
  return screen;
}
