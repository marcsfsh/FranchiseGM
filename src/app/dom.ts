/**
 * Small DOM helpers. Text always goes in through text nodes, never HTML strings (style guide 13).
 */

export type Child = Node | string | number | null | undefined | false;
type AttrValue = string | number | boolean | null | undefined;
export interface Attrs {
  [name: string]: AttrValue | EventListener | Record<string, EventListener> | undefined;
  on?: Record<string, EventListener>;
}

export function append(parent: Node, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Creates an element. `class` sets className; `on` adds listeners; true sets an empty attribute. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [name, value] of Object.entries(attrs)) {
      if (name === 'on' && value && typeof value === 'object') {
        for (const [event, listener] of Object.entries(value)) node.addEventListener(event, listener);
      } else if (value === true) {
        node.setAttribute(name, '');
      } else if (value !== false && value !== null && value !== undefined && typeof value !== 'function') {
        node.setAttribute(name === 'className' ? 'class' : name, String(value));
      }
    }
  }
  append(node, children);
  return node;
}

/** Replaces all children of a node. */
export function mount(parent: Element, ...children: Child[]): void {
  parent.replaceChildren();
  append(parent, children);
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}
