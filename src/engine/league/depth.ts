/**
 * Depth chart orders (spec 12.2): for each slot, the players the head coach or the user put in order. The
 * auto depth chart lists only each slot's starter; the user can order the backups too.
 */
import type { Slot } from '../schemes/slots';

export type DepthOrder = Partial<Record<Slot, string[]>>;

/** Each slot's starter: the first listed player who can play, or the first listed when `can` is omitted. */
export function startersOf(order: DepthOrder, can?: (id: string) => boolean): Partial<Record<Slot, string>> {
  const starters: Partial<Record<Slot, string>> = {};
  for (const [slot, ids] of Object.entries(order) as [Slot, string[] | undefined][]) {
    const first = (ids ?? []).find(id => !can || can(id));
    if (first) starters[slot] = first;
  }
  return starters;
}

/** An order that names only the starters. */
export function orderOf(starters: Partial<Record<Slot, string>>): DepthOrder {
  const order: DepthOrder = {};
  for (const [slot, id] of Object.entries(starters) as [Slot, string | undefined][])
    if (id) order[slot] = [id];
  return order;
}
