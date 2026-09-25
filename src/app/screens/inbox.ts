/**
 * The inbox (spec 19.6): every message the league has sent the user this season and the last, newest week
 * first, with the unread ones marked and a filter for them.
 */
import type { League } from '../../engine/league/types';
import { h, mount } from '../dom';
import { weekLabel } from '../ui/games';
import { inboxMessage, inboxOrder } from '../ui/inbox';
import { card, pageHead } from './common';
import type { Screen } from './types';

/** Whether only unread messages show, kept for the session. */
let unreadOnly = false;

export function inboxScreen(): Screen {
  let off: (() => void) | null = null;
  return {
    title: 'Inbox',
    dispose: () => off?.(),
    render: ({ app }) => {
      const view = h('section', { class: 'view' });
      if (!app.league) return view;
      const status = h('p', { class: 'sr-only', role: 'status' });
      const body = h('div', { class: 'stack' });
      const markRead = h(
        'button',
        { class: 'btn btn-outline', type: 'button', id: 'inboxMarkRead' },
        'Mark all as read'
      );
      markRead.addEventListener('click', () => {
        const unread = app.league?.inbox.filter(i => !i.read).length ?? 0;
        if (!unread) {
          status.textContent = 'No new messages.';
          return;
        }
        app.edit(l => {
          for (const item of l.inbox) item.read = true;
        }, 'inboxRead');
        draw();
        status.textContent = 'All messages marked as read.';
      });
      const filter = h(
        'fieldset',
        { class: 'view-switch' },
        h('legend', { class: 'field-label' }, 'Show'),
        h('div', { class: 'seg' }, ...([['all', 'All messages'], ['unread', 'Unread only']] as const).map(([value, label]) => {
          const input = h('input', { type: 'radio', id: `inbox-${value}`, name: 'inboxFilter', value, checked: (value === 'unread') === unreadOnly });
          input.addEventListener('change', () => {
            unreadOnly = value === 'unread';
            draw();
            const shown = (app.league?.inbox ?? []).filter(i => !unreadOnly || !i.read).length;
            status.textContent = `${shown} ${shown === 1 ? 'message' : 'messages'}.`;
          });
          return h('label', null, input, label);
        }))
      ); // prettier-ignore
      const draw = () => {
        const league: League | null = app.league;
        if (!league) return;
        const items = inboxOrder(league.inbox).filter(i => !unreadOnly || !i.read);
        const weeks: { key: string; label: string; items: typeof items }[] = [];
        for (const item of items) {
          const key = `${item.season}-${item.week}`;
          let group = weeks.at(-1);
          if (group?.key !== key) {
            group = { key, label: `${item.season} · ${weekLabel(league, item.week)}`, items: [] };
            weeks.push(group);
          }
          group.items.push(item);
        }
        mount(
          body,
          ...(weeks.length
            ? weeks.map(w => card(w.label, ...w.items.map(item => inboxMessage(league, item))))
            : [h('p', { class: 'empty' }, unreadOnly ? 'No unread messages.' : 'No messages yet. Results, injuries, and awards for your team arrive here each week.')])
        ); // prettier-ignore
      };
      off = app.onChange(() => draw());
      draw();
      mount(view, pageHead('Inbox'), h('div', { class: 'btn-row' }, markRead), filter, status, body);
      return view;
    }
  };
}
