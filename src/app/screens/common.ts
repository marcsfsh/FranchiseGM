import { h, type Child } from '../dom';

/** Page heading with the broadcast name plate (style guide 11). Focused on screen change. */
export function pageHead(title: string, tag?: string, ...extra: Child[]): HTMLElement {
  return h(
    'div',
    { class: 'page-head' },
    h(
      'div',
      { class: 'nameplate' },
      tag ? h('span', { class: 'nameplate-tag' }, tag) : null,
      h('h1', { class: 'nameplate-name nameplate-title', tabindex: '-1' }, title)
    ),
    ...extra
  );
}

/** A dashboard card with a sign bar title. */
export function card(title: string, ...body: Child[]): HTMLElement {
  return h(
    'section',
    { class: 'card' },
    h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title' }, title)),
    h('div', { class: 'card-body' }, ...body)
  );
}
