/** Inbox messages (spec 19.6, style guide 7.6): type, subject, summary, week, read state, and a box score link for results. */
import type { League } from '../../engine/league/types';
import type { InboxItem, InboxKind } from '../../engine/season/inbox';
import { h } from '../dom';
import { href } from '../router';
import { userGameIn, weekLabel } from './games';

export const INBOX_LABELS: Record<InboxKind, string> = {
  result: 'Game result',
  injury: 'Injury update',
  award: 'Award',
  milestone: 'Milestone',
  playoffs: 'Playoffs',
  waivers: 'Waivers'
};

/** Newest week first; within a week, in the order filed (the result leads). */
export const inboxOrder = (items: readonly InboxItem[]): InboxItem[] =>
  [...items].sort((a, b) => b.season - a.season || b.week - a.week);

/** One message as a list item; lists of them go in `inboxList`, so readers can move message by message. */
export function inboxMessage(league: League, item: InboxItem): HTMLElement {
  const game = item.kind === 'result' ? userGameIn(league, item.season, item.week) : undefined;
  return h(
    'li',
    { class: `inbox-item${item.read ? '' : ' is-unread'}` },
    h('p', { class: 'label' }, `${INBOX_LABELS[item.kind]} · ${weekLabel(league, item.week)}${item.read ? '' : ' · New'}`),
    h('p', null, h('strong', null, item.title)),
    item.body ? h('p', { class: 'muted' }, item.body) : null,
    game ? h('a', { class: 'inbox-link', href: href('game', { id: game.id }), 'aria-label': `Box score: ${item.title}` }, 'Box score') : null
  ); // prettier-ignore
}

/** Messages as a list. */
export const inboxList = (league: League, items: readonly InboxItem[], label: string): HTMLElement =>
  h('ul', { class: 'inbox-list', 'aria-label': label }, ...items.map(item => inboxMessage(league, item)));
