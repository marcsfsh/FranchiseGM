/**
 * Keeping keyboard focus through a redraw (style guide 8, 14.4): a key that finds the same control in the
 * new markup, by its data-focus name, its id, or a link's address and text, and a way to wait for content
 * that loads after the redraw.
 */

/** A key for the focused control inside `within`, or null when focus is elsewhere. */
export function focusKeyOf(within: Element): string | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !within.contains(active) || active === within) return null;
  if (active.dataset.focus) return `[data-focus="${CSS.escape(active.dataset.focus)}"]`;
  if (active.id) return `#${CSS.escape(active.id)}`;
  const address = active.getAttribute('href');
  if (active instanceof HTMLAnchorElement && address) return `a[href="${CSS.escape(address)}"]`;
  return null;
}

/** Focuses the control a key names inside `within`; false when it isn't there (yet). */
export function refocus(within: Element, key: string | null): boolean {
  if (!key) return false;
  const found = within.querySelector<HTMLElement>(key);
  if (!found || (found instanceof HTMLButtonElement && found.disabled)) return false;
  found.focus();
  return true;
}

/**
 * Refocuses a control now, or once content that loads later brings it back; after `wait` milliseconds
 * without it, focuses `fallback` instead, so focus never drops to the page.
 */
export function refocusWhenReady(
  within: Element,
  key: string | null,
  fallback: () => void,
  wait = 2000
): void {
  if (!key) return;
  if (refocus(within, key)) return;
  const observer = new MutationObserver(() => {
    if (!refocus(within, key)) return;
    observer.disconnect();
    clearTimeout(timer);
  });
  observer.observe(within, { childList: true, subtree: true });
  const timer = setTimeout(() => {
    observer.disconnect();
    if (!within.contains(document.activeElement)) fallback();
  }, wait);
}
