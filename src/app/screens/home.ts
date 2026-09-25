/** Team hub (spec 19.2). M2 shows the franchise and the next game; later milestones add the full hub. */
import { TEAM_COLORS, teamFullName } from '../../data/team-colors';
import { h } from '../dom';
import { gameDay, kickoff, record } from '../format';
import { dateLine } from '../shell';
import { card, pageHead } from './common';
import type { Screen } from './types';

export function homeScreen(): Screen {
  return {
    title: 'Team hub',
    render: ({ app }) => {
      const league = app.league;
      if (!league) return h('section', { class: 'view' }, pageHead('Team hub'));
      const team = league.meta.start.userTeam;
      const players = Object.values(league.players).filter(p => p.team === team);
      const next = league.schedule
        .filter(g => (g.home === team || g.away === team) && g.week >= league.date.week)
        .sort((a, b) => a.week - b.week)[0];
      const opponent = next ? (next.home === team ? next.away : next.home) : null;
      // No games have been played before the season loop (M7), so both records start at 0-0.
      const nextCard =
        next && opponent
          ? card(
              'Next game',
              h('p', { class: 'label' }, `Week ${next.week} · ${next.home === team ? 'Home' : 'Away'}`),
              h('p', { class: 'hero-title' }, teamFullName(opponent)),
              h('p', null, `Your record: ${record(0, 0)} · ${TEAM_COLORS[opponent].name}: ${record(0, 0)}`),
              h('p', null, `${gameDay(next.date, next.day)} · ${kickoff(next.timeEt)}`),
              h('p', { class: 'muted' }, 'Game plans and results arrive with the season loop.')
            )
          : card('Next game', h('p', null, 'No games left on the schedule.'));
      return h(
        'section',
        { class: 'view' },
        pageHead('Team hub', dateLine(league)),
        h(
          'div',
          { class: 'cards-host' },
          h(
            'div',
            { class: 'cards' },
            nextCard,
            card(
              'Your franchise',
              h('p', null, `You're the general manager of the ${teamFullName(team)}.`),
              h(
                'p',
                null,
                `${players.filter(p => p.status === 'active').length} active players and ${players.filter(p => p.status === 'practice').length} on the practice squad.`
              ),
              h(
                'p',
                { class: 'muted' },
                'Roster, inbox, standings, and cap cards fill in as later builds arrive.'
              )
            )
          )
        )
      );
    }
  };
}
