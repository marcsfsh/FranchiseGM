/** Player display helpers (style guide 7.5, 13.4): overall plates, development tags, and rating rows. */
import type { DevTrait, Player, RosterStatus } from '../../engine/model/player';
import { fullName } from '../../engine/model/player';
import { h } from '../dom';
import { href } from '../router';

const knownRating = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 99 ? value : null;

type Tier = 'elite' | 'starter' | 'depth' | 'low' | 'unknown';

export function tierOf(value: unknown): Tier {
  const n = knownRating(value);
  return n === null ? 'unknown' : n >= 90 ? 'elite' : n >= 80 ? 'starter' : n >= 70 ? 'depth' : 'low';
}

const TIER_NAMES: Record<Exclude<Tier, 'unknown'>, string> = {
  elite: 'Elite',
  starter: 'Starter',
  depth: 'Depth',
  low: 'Low overall'
};

/** An overall rating plate; `what` names the rating for screen readers ("Overall", "Role rating"). */
export function tierPlate(value: unknown, { large = false, what = 'Overall' } = {}): HTMLElement {
  const n = knownRating(value);
  const tier = tierOf(value);
  return h(
    'span',
    {
      class: `tier tier-${tier}${large ? ' tier-lg' : ''}`,
      'aria-label':
        n === null ? `${what} not known` : `${what} ${n}, ${TIER_NAMES[tier as Exclude<Tier, 'unknown'>]}`
    },
    n === null ? '—' : n
  );
}

const DEV_SLUGS: Record<DevTrait, string> = {
  'X-Factor': 'xfactor',
  Superstar: 'superstar',
  Star: 'star',
  Normal: 'normal'
};

export const devTag = (dev: DevTrait): HTMLElement => h('span', { class: `dev dev-${DEV_SLUGS[dev]}` }, dev);

export const STATUS_LABELS: Record<RosterStatus, string> = {
  active: 'Active',
  practice: 'Practice squad',
  ir: 'Injured reserve',
  pup: 'Physically unable to perform',
  nfi: 'Non-football injury',
  suspended: 'Suspended',
  freeAgent: 'Free agent',
  retired: 'Retired',
  removed: 'Removed'
};

export const statusTag = (status: RosterStatus): HTMLElement =>
  h(
    'span',
    { class: `status status-${status === 'ir' || status === 'suspended' ? 'bad' : 'neutral'}` },
    STATUS_LABELS[status]
  );

/** A rating row with a bar; the number repeats the bar's meaning, so the bar is hidden from readers. */
export function attributeRow(label: string, value: number): HTMLElement {
  const n = knownRating(value);
  const bar = h('div', { class: 'bar', 'aria-hidden': 'true' });
  if (n !== null) {
    const fill = h('i', { class: `tier-fill-${tierOf(n)}` });
    fill.style.width = `${(n / 99) * 100}%`;
    bar.append(fill);
  }
  return h(
    'div',
    { class: 'attr' },
    h('span', null, label),
    bar,
    h('span', { class: 'num' }, n ?? '— · Not known')
  );
}

export const stat = (label: string, value: Node | string | number): HTMLElement =>
  h(
    'div',
    { class: 'stat' },
    h('span', { class: 'label' }, label),
    value instanceof Node ? value : h('span', { class: 'value' }, value)
  );

export const playerLink = (p: Pick<Player, 'id' | 'firstName' | 'lastName'>): HTMLAnchorElement =>
  h('a', { class: 'list-name', href: href('player', { id: p.id }) }, fullName(p));

/** A signed number of points: "+3", "−2", or "0". */
export const signed = (points: number): string =>
  points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : '0';

/** A fit value, colored by meaning (a positive fit is good for the team). */
export const fitNode = (fit: number, label?: string): HTMLElement =>
  h(
    'span',
    { class: fit > 0 ? 'delta-good' : fit < 0 ? 'delta-bad' : 'muted', 'aria-label': label ?? null },
    signed(fit)
  );

/** Height in feet and inches: 6'3". */
export const heightText = (inches: number): string => `${Math.floor(inches / 12)}'${inches % 12}"`;
