/**
 * Shared pieces for stats tables (style guide 7.3): abbreviated headers that carry their full names to
 * assistive technology, cells with an accessible dash for undefined rates, a key to the abbreviations,
 * and a scroll region that becomes a labeled, focusable landmark only while its table overflows.
 */
import { h } from '../dom';
import { formatStat, type StatColumn } from './stat-columns';

/** A column header showing the short label, read out as the full name. */
export function statHeader(label: string, title: string, numeric = true): HTMLElement {
  return h(
    'th',
    { scope: 'col', class: numeric ? 'num' : null, title },
    h('span', { 'aria-hidden': 'true' }, label),
    h('span', { class: 'sr-only' }, title)
  );
}

/** A numeric cell; an undefined rate shows a dash and reads "Not applicable". */
export function statCell(value: number | null, format: StatColumn['format']): HTMLElement {
  const text = formatStat(value, format);
  return text === '—'
    ? h(
        'td',
        { class: 'num' },
        h('span', { 'aria-hidden': 'true' }, '—'),
        h('span', { class: 'sr-only' }, 'Not applicable')
      )
    : h('td', { class: 'num' }, text);
}

/** A key to the column abbreviations, closed by default. */
export function statKey(columns: readonly { label: string; title: string }[]): HTMLElement {
  const seen = new Map<string, string>();
  for (const c of columns) if (!seen.has(c.label)) seen.set(c.label, c.title);
  return h(
    'details',
    { class: 'stat-key' },
    h('summary', null, 'What the columns mean'),
    h('dl', null, ...[...seen].flatMap(([label, title]) => [h('dt', null, label), h('dd', null, title)]))
  );
}

/**
 * A horizontal scroll region for a wide table. While the table overflows, the region is a labeled,
 * focusable landmark with edge shadows and a hint; otherwise it is a plain wrapper.
 */
export function scrollRegion(label: string, table: HTMLElement): HTMLElement {
  const hint = h('p', { class: 'hint', hidden: true }, 'Scroll sideways for more columns.');
  const region = h('div', { class: 'table-scroll' }, table);
  const update = () => {
    const scrolls = region.scrollWidth > region.clientWidth + 1;
    region.classList.toggle('is-scrollable', scrolls);
    hint.hidden = !scrolls;
    if (scrolls) {
      region.setAttribute('role', 'region');
      region.setAttribute('aria-label', label);
      region.tabIndex = 0;
    } else {
      region.removeAttribute('role');
      region.removeAttribute('aria-label');
      region.removeAttribute('tabindex');
    }
  };
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(update);
    observer.observe(region);
    observer.observe(table);
  }
  requestAnimationFrame(update);
  return h('div', { class: 'stat-block' }, region, hint);
}
