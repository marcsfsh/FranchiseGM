/**
 * Tabs (style guide 7.2): a true tab interface with tab and panel semantics. Arrow keys move between tabs,
 * Home and End jump to the ends, and only the selected tab is in the tab order.
 */
import { h } from '../dom';

export interface TabSpec {
  id: string;
  label: string;
  /** Builds the panel's content each time the tab is selected. */
  render(): Node;
}

export interface Tabs {
  element: HTMLElement;
  /** Selects a tab by ID and renders its panel. */
  select(id: string, focus?: boolean): void;
  /** Re-renders the selected panel. */
  refresh(): void;
  readonly selected: string;
}

export function tabs(
  name: string,
  specs: readonly TabSpec[],
  initial: string,
  onSelect?: (id: string) => void
): Tabs {
  const list = h('div', { class: 'tabs', role: 'tablist', 'aria-label': name });
  const panel = h('div', { class: 'tab-panel', role: 'tabpanel', tabindex: '0' });
  const buttons = specs.map(spec =>
    h(
      'button',
      {
        class: 'tab',
        type: 'button',
        role: 'tab',
        id: `tab-${spec.id}`,
        'aria-controls': `panel-${name.replace(/\W+/g, '-').toLowerCase()}`,
        'aria-selected': 'false',
        tabindex: '-1'
      },
      spec.label
    )
  );
  panel.id = `panel-${name.replace(/\W+/g, '-').toLowerCase()}`;
  let selected = specs.some(s => s.id === initial) ? initial : (specs[0]?.id ?? '');

  const render = () => {
    const spec = specs.find(s => s.id === selected);
    panel.setAttribute('aria-labelledby', `tab-${selected}`);
    panel.replaceChildren(spec ? spec.render() : '');
  };
  const apply = (id: string, focus: boolean) => {
    selected = id;
    buttons.forEach((b, i) => {
      const on = specs[i]?.id === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    render();
  };
  const select = (id: string, focus = false) => {
    apply(id, focus);
    onSelect?.(id);
  };

  buttons.forEach((button, i) => {
    button.addEventListener('click', () => select(specs[i]?.id ?? selected));
    button.addEventListener('keydown', event => {
      const last = buttons.length - 1;
      const to =
        event.key === 'ArrowRight' ? (i === last ? 0 : i + 1)
        : event.key === 'ArrowLeft' ? (i === 0 ? last : i - 1)
        : event.key === 'Home' ? 0
        : event.key === 'End' ? last
        : null; // prettier-ignore
      if (to === null) return;
      event.preventDefault();
      select(specs[to]?.id ?? selected, true);
    });
  });
  list.append(...buttons);
  apply(selected, false);
  return {
    element: h('div', { class: 'tabs-block' }, list, panel),
    select,
    refresh: render,
    get selected() {
      return selected;
    }
  };
}
