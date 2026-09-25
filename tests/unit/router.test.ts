import { describe, expect, it } from 'vitest';
import { DESTINATIONS, PHONE_TABS, href, parseHash, sectionOf } from '../../src/app/router';

describe('hash router', () => {
  it('parses destinations and parameters', () => {
    expect(parseHash('')).toEqual({ name: 'home', params: {} });
    expect(parseHash('#/')).toEqual({ name: 'home', params: {} });
    expect(parseHash('#/roster')).toEqual({ name: 'roster', params: {} });
    expect(parseHash('#/player/p001')).toEqual({ name: 'player', params: { id: 'p001' } });
    expect(parseHash('#/team/MIN/roster')).toEqual({ name: 'team', params: { abbr: 'MIN', tab: 'roster' } });
  });

  it('sends unknown or malformed routes home', () => {
    expect(parseHash('#/nowhere').name).toBe('home');
    expect(parseHash('#/player/<script>').name).toBe('home');
    expect(parseHash('#main').name).toBe('home');
    expect(parseHash('#/player/%').name).toBe('home');
    expect(parseHash('#/team/%E0%A4%A/roster').name).toBe('home');
  });

  it('round-trips hrefs', () => {
    expect(href('team', { abbr: 'DET', tab: 'roster' })).toBe('#/team/DET/roster');
    for (const d of DESTINATIONS) expect(parseHash(href(d.route)).name).toBe(d.route);
    expect(parseHash(href('player', { id: 'x_1' }))).toEqual({ name: 'player', params: { id: 'x_1' } });
  });

  it('keeps the phone tab bar to four league destinations plus More, or Leagues without a league', () => {
    expect(PHONE_TABS).toEqual(['home', 'roster', 'staff', 'scouting', 'start']);
    expect(sectionOf(parseHash('#/player/p1'))).toBe('roster');
  });
});
