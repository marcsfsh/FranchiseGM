/** Dialog lifecycle and toasts (style guide 7.7 and 13.6). */
import { h } from './dom';

interface Return {
  trigger: Element | null;
  fallback: (() => HTMLElement | null) | undefined;
}

const returns = new WeakMap<HTMLDialogElement, Return>();

const focusable = (node: Element | null | undefined): node is HTMLElement =>
  node instanceof HTMLElement && node.isConnected && node.getClientRects().length > 0;

/**
 * Opens a native modal dialog and restores focus to the trigger when it closes. If the trigger is gone
 * (the dialog's action removed it), focus goes to `fallback`, then to the page heading.
 */
export function openDialog(
  dialog: HTMLDialogElement,
  trigger: Element | null = document.activeElement,
  fallback?: () => HTMLElement | null
): void {
  if (dialog.open) return;
  returns.set(dialog, { trigger, fallback });
  if (!dialog.dataset.wired) {
    dialog.dataset.wired = '1';
    dialog.addEventListener('close', () => {
      // Restore focus to the trigger unless something else (like a new screen's heading) already took it.
      const active = document.activeElement;
      if (active && active !== document.body && !dialog.contains(active)) return;
      const back = returns.get(dialog);
      if (focusable(back?.trigger)) back.trigger.focus();
      else {
        const next = back?.fallback?.();
        if (focusable(next)) next.focus();
        else document.querySelector<HTMLElement>('main h1')?.focus();
      }
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

export interface ToastAction {
  label: string;
  run: () => void;
}

/**
 * Routine confirmations disappear after five seconds; persistent toasts stay until dismissed. An action
 * button offers the way out of a problem, such as exporting a league that couldn't be saved.
 */
export function toast(
  message: string,
  { persistent = false, action }: { persistent?: boolean; action?: ToastAction } = {}
): void {
  const text = h('span', null, message);
  const close = h(
    'button',
    { class: 'btn btn-text', type: 'button', 'aria-label': `Dismiss: ${message}` },
    'Dismiss'
  );
  const act = action ? h('button', { class: 'btn btn-outline', type: 'button' }, action.label) : null;
  act?.addEventListener('click', () => action?.run());
  const box = h('div', { class: 'toast' }, text, act, close);
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

/**
 * Runs a task behind a button: marks it busy, shows `label` while it runs, and ignores clicks until the
 * task ends. The button stays enabled so it keeps focus (style guide 7.1).
 */
export async function whileBusy<T>(
  button: HTMLButtonElement,
  label: string,
  task: () => Promise<T>
): Promise<T | undefined> {
  if (button.getAttribute('aria-busy') === 'true') return undefined;
  const idle = button.textContent ?? '';
  button.setAttribute('aria-busy', 'true');
  button.textContent = label;
  try {
    return await task();
  } finally {
    button.removeAttribute('aria-busy');
    button.textContent = idle;
  }
}
