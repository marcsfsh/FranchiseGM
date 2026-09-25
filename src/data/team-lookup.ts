/** Resolves team names from imports: abbreviations, full names, city names, and nicknames. */
import { TEAM_ABBRS, TEAM_COLORS, type TeamAbbr } from './team-colors';

const key = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

const TABLE = new Map<string, TeamAbbr | null>();
for (const abbr of TEAM_ABBRS) {
  const t = TEAM_COLORS[abbr];
  TABLE.set(key(abbr), abbr);
  TABLE.set(key(t.name), abbr);
  TABLE.set(key(`${t.city} ${t.name}`), abbr);
}
// Cities shared by two teams can't identify a team; other cities can.
const cityCounts = new Map<string, number>();
for (const abbr of TEAM_ABBRS)
  cityCounts.set(key(TEAM_COLORS[abbr].city), (cityCounts.get(key(TEAM_COLORS[abbr].city)) ?? 0) + 1);
for (const abbr of TEAM_ABBRS) {
  const city = key(TEAM_COLORS[abbr].city);
  if (cityCounts.get(city) === 1) TABLE.set(city, abbr);
}
for (const [alias, abbr] of Object.entries({
  la: 'LAR',
  lar: 'LAR',
  wsh: 'WAS',
  jac: 'JAX',
  lvr: 'LV',
  oak: 'LV',
  sd: 'LAC',
  gnb: 'GB',
  kan: 'KC',
  nwe: 'NE',
  nor: 'NO',
  sfo: 'SF',
  tam: 'TB'
} as const)) {
  TABLE.set(alias, abbr);
}
for (const fa of ['fa', 'freeagent', 'freeagents', 'none', '']) TABLE.set(fa, null);

/** A team, null for a free agent, or undefined when the name isn't recognized. */
export function lookupTeam(text: string): TeamAbbr | null | undefined {
  return TABLE.get(key(text));
}
