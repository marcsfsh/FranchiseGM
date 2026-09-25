/** Fit breakdown copy (spec 7.3): "Good fit for Zone runner: +3 ratings (vision, agility), ...". */
import type { RoleRating } from '../../engine/fit/role-rating';
import { RATING_LABELS } from '../../engine/model/ratings';
import { TUNING } from '../../engine/tuning';
import { h } from '../dom';
import { signed } from './players';

const F = TUNING.fit;

/** Fit this far from zero either way is a good or poor fit; closer is fair (the copy and colors agree). */
const CLEAR_FIT = 3;

export function fitVerdict(fit: number): string {
  return fit >= CLEAR_FIT ? 'Good fit' : fit <= -CLEAR_FIT ? 'Poor fit' : 'Fair fit';
}

/** A fit value. Color follows the verdict, not the sign: a fair fit stays neutral (style guide 9). */
export const fitNode = (fit: number): HTMLElement =>
  h(
    'span',
    { class: fit >= CLEAR_FIT ? 'delta-good' : fit <= -CLEAR_FIT ? 'delta-bad' : 'muted' },
    signed(fit)
  );

function frequency(ratio: number): string {
  if (ratio >= F.oftenRatio) return 'triggers often here';
  if (ratio <= F.rarelyRatio) return 'triggers rarely here';
  return 'triggers as often as in most schemes';
}

/** The parts of a role rating that move it away from the player's overall, largest first. */
export function fitParts(r: RoleRating): string[] {
  const parts: { points: number; text: string }[] = [];
  const ratingPoints = Math.round(r.parts.ratings);
  if (ratingPoints !== 0) {
    const names = r.ratingEffects
      .filter(e => Math.sign(e.points) === Math.sign(ratingPoints))
      .slice(0, F.namedRatings)
      .map(e => RATING_LABELS[e.key].toLowerCase());
    parts.push({ points: ratingPoints, text: `${signed(ratingPoints)} ratings (${names.join(', ')})` });
  }
  for (const sign of [1, -1]) {
    const traits = r.traits.filter(t => Math.sign(t.points) === sign);
    const points = Math.round(traits.reduce((sum, t) => sum + t.points, 0));
    if (points !== 0)
      parts.push({ points, text: `${signed(points)} traits (${traits.map(t => t.label).join(', ')})` });
  }
  const abilityPoints = Math.round(r.parts.abilities);
  if (abilityPoints !== 0) {
    const names = r.abilities.map(a => `${a.name}, ${frequency(a.ratio)}`).join('; ');
    parts.push({ points: abilityPoints, text: `${signed(abilityPoints)} abilities (${names})` });
  }
  return parts.sort((a, b) => b.points - a.points).map(p => p.text);
}

export function fitSentence(r: RoleRating, cap: number): string {
  const parts = fitParts(r);
  const head = `${fitVerdict(r.fit)} for ${r.label}`;
  const body = parts.length
    ? `${head}: ${parts.join(', ')}.`
    : `${head}: plays it like a typical player at the position.`;
  return r.capped ? `${body} Fit is capped at ${cap} points either way.` : body;
}
