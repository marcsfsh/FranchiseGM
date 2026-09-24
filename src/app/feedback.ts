/** Dialog lifecycle and toasts (style guide 7.7 and 13.6). */
import { h } from './dom';

const triggers = new WeakMap<HTMLDialogElement, Element | null>();

/** Opens a native modal dialog and restores focus to the trigger when it closes. */
export function openDialog(
  dialog: HTMLDialogElement,
  trigger: Element | null = document.activeElement
): void {
  if (dialog.open) return;
  triggers.set(dialog, trigger);
  if (!dialog.dataset.wired) {
    dialog.dataset.wired = '1';
    dialog.addEventListener('close', () => {
      const back = triggers.get(dialog);
      if (back instanceof HTMLElement && back.isConnected && back.getClientRects().length) back.focus();
    });
    dialog.addEventListener('click', event => {
      const close = (event.target as Element).closest('[data-close]');
      if (close) {
        event.preventDefault();
        dialog.close();
      }
    });
  }
  dialog.showModal();
  const first =
    dialog.querySelector<HTMLElement>('[data-autofocus]') ??
    dialog.querySelector<HTMLElement>('[data-close]');
  first?.focus();
}

/** A dialog frame with a team-colored head, a title, and a Close button. */
export function dialogFrame(id: string, title: string, ...body: Node[]): HTMLDialogElement {
  const titleId = `${id}-title`;
  return h(
    'dialog',
    { id, 'aria-labelledby': titleId },
    h(
      'div',
      { class: 'dialog-frame' },
      h(
        'div',
        { class: 'dialog-head on-team' },
        h('h2', { class: 'dialog-title', id: titleId }, title),
        h('button', { class: 'btn btn-outline', type: 'button', 'data-close': true }, 'Close')
      ),
      h('div', { class: 'dialog-body' }, ...body)
    )
  );
}

let region: HTMLElement | null = null;

export function toastRegion(): HTMLElement {
  region ??= h('div', {
    class: 'toast-region',
    id: 'toastRegion',
    'aria-live': 'polite',
    'aria-atomic': 'false'
  });
  return region;
}

/** Routine confirmations disappear after five seconds; persistent toasts stay until dismissed. */
export function toast(message: string, { persistent = false }: { persistent?: boolean } = {}): void {
  const text = h('span', null, message);
  const close = h(
    'button',
    { class: 'btn btn-text', type: 'button', 'aria-label': `Dismiss: ${message}` },
    'Dismiss'
  );
  const box = h('div', { class: 'toast' }, text, close);
  toastRegion().append(box);
  let timer = 0;
  const stop = () => window.clearTimeout(timer);
  const schedule = () => {
    stop();
    if (!persistent && !box.matches(':hover') && !box.contains(document.activeElement)) {
      timer = window.setTimeout(() => box.remove(), 5000);
    }
  };
  close.addEventListener('click', () => {
    stop();
    box.remove();
  });
  box.addEventListener('mouseenter', stop);
  box.addEventListener('mouseleave', schedule);
  box.addEventListener('focusin', stop);
  box.addEventListener('focusout', () => window.setTimeout(schedule, 0));
  schedule();
}
