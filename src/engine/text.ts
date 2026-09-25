/** Small English helpers for generated text: news, the inbox, and awards. */

/** "1 yard", "2,105 yards". */
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** "the Vikings'" for plural names, "Hunt's" otherwise. */
export const possessive = (name: string): string => (name.endsWith('s') ? `${name}'` : `${name}'s`);

/** "a knee", "an ankle", "an Achilles". */
export const withArticle = (word: string): string => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;

/** "a", "a and b", "a, b, and c". */
export function joinList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}
