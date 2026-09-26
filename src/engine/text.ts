/** Small English helpers for generated text: news, the inbox, and awards. */

/** "1 yard", "2,105 yards". */
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** "the Vikings'" for plural names, "Hunt's" otherwise. */
export const possessive = (name: string): string => (name.endsWith('s') ? `${name}'` : `${name}'s`);

/** "a knee", "an ankle", "an Achilles". */
export const withArticle = (word: string): string => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;

/** The article a number takes when read aloud: "an 18–3 win", "an 8-yard gain", "a 21–7 win". */
export const numberArticle = (n: number): string => (/^(8\d*|11|18)$/.test(String(n)) ? 'an' : 'a');

/** "a", "a and b", "a, b, and c". */
export function joinList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/** Whole dollars in full, such as $42,500,000 (style guide 9: exact contract detail). */
export const dollars = (n: number): string =>
  `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

/** An ordinal number: "1st", "2nd", "11th", "23rd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${suffix}`;
}
