/**
 * A player's character and morale (spec 10.9, 19.3): the personality traits the user has learned, in words
 * and numbers, and his morale with what moves it.
 */
import type { League } from '../../engine/league/types';
import { characterKnown, isDisruptive, isLeader } from '../../engine/locker/room';
import type { Personality, Player } from '../../engine/model/player';
import { TUNING } from '../../engine/tuning';
import { h } from '../dom';
import { stat } from './players';

/** The traits in the order a scout reports them. */
export const CHARACTER: readonly [keyof Personality, string][] = [
  ['workEthic', 'Work ethic'],
  ['competitiveness', 'Competitiveness'],
  ['leadership', 'Leadership'],
  ['ego', 'Ego'],
  ['volatility', 'Volatility'],
  ['loyalty', 'Loyalty'],
  ['greed', 'Greed'],
  ['mediaStyle', 'Outspoken with the media'],
  ['socialActivity', 'Social life']
];

/** A 0 to 100 trait in words. */
export const level = (v: number): string =>
  v >= 80 ? 'Very high' : v >= 60 ? 'High' : v > 40 ? 'Average' : v > 20 ? 'Low' : 'Very low';

/** Morale in a word. */
export const moraleWord = (v: number): string =>
  v >= 80 ? 'Happy' : v >= 60 ? 'Content' : v >= 40 ? 'Unsettled' : 'Unhappy';

/** A player's traits as label and value rows. */
export const characterRows = (player: Player): HTMLElement =>
  h('div', { class: 'stack' }, ...CHARACTER.map(([key, label]) => h('div', { class: 'kv' }, h('span', { class: 'label' }, label), h('span', null, `${level(player.personality[key])}, ${player.personality[key]}`)))); // prettier-ignore

/** The player page's morale and character: his morale, his voice in the room, and his traits once known. */
export function characterBody(league: League, player: Player): HTMLElement[] {
  const known = characterKnown(league, player);
  const voice = !known ? null : isLeader(player) ? 'A leader: he lifts his teammates each week.' : isDisruptive(player) ? 'Disruptive: his unhappiness drags his teammates down each week.' : null; // prettier-ignore
  const weeks = TUNING.lockerRoom.revealWeek;
  return [
    h('div', { class: 'stat-grid' }, stat('Morale', `${moraleWord(player.morale)}, ${player.morale}`)),
    h('p', { class: 'hint' }, 'Morale moves each week with results, his role, his pay against his market value, and the locker room.'),
    ...(voice ? [h('p', null, voice)] : []),
    h('h3', null, 'Character'),
    known
      ? characterRows(player)
      : h('p', { class: 'muted' }, `— · Not known. A top-30 visit shows a prospect's character, and ${weeks} game weeks on your team show anyone's.`)
  ]; // prettier-ignore
}
