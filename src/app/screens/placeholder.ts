import { h } from '../dom';
import type { Screen } from './types';
import { card, pageHead } from './common';

/** A destination that isn't built yet. It says so plainly instead of pretending to work. */
export function placeholderScreen(title: string, purpose: string): Screen {
  return {
    title,
    render: () =>
      h(
        'section',
        { class: 'view' },
        pageHead(title),
        card(
          'Not available yet',
          h('p', null, purpose),
          h('p', { class: 'muted' }, 'This screen arrives in a later build.')
        )
      )
  };
}
