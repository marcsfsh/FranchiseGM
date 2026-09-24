/** Pure color helpers from style guide 13.1. They run without a browser. */

export function hexToRgb(hex: string): [number, number, number] {
  if (typeof hex !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
    throw new TypeError('Expected an opaque hex color');
  }
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Moves each sRGB channel of `a` toward `b` by `t`. */
export function mix(a: string, b: string, t: number): string {
  if (!Number.isFinite(t) || t < 0 || t > 1) throw new RangeError('Mix amount must be 0 to 1');
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return (
    '#' +
    x
      .map((v, i) =>
        Math.round(v + ((y[i] as number) - v) * t)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
      .toUpperCase()
  );
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Black or white, whichever contrasts more with the background. */
export function readableText(bg: string): string {
  return contrast(bg, '#000000') >= contrast(bg, '#FFFFFF') ? '#000000' : '#FFFFFF';
}

/** The team primary darkened until white text reaches 4.5:1. */
export function uiPrimary(hex: string): string {
  for (let i = 0; i <= 100; i++) {
    const p = mix(hex, '#000000', i / 100);
    if (contrast(p, '#FFFFFF') >= 4.5) return p;
  }
  return '#000000';
}

/** The nearest color that reaches `target` contrast against every background. */
export function colorAgainst(color: string, backgrounds: readonly string[], target = 3): string {
  const passes = (c: string) => backgrounds.every(bg => contrast(c, bg) >= target);
  if (passes(color)) return color;
  const worst = (end: string) => Math.min(...backgrounds.map(bg => contrast(end, bg)));
  const endpoints = ['#000000', '#FFFFFF'].sort((a, b) => worst(b) - worst(a));
  for (const end of endpoints) {
    for (let i = 1; i <= 100; i++) {
      const c = mix(color, end, i / 100);
      if (passes(c)) return c;
    }
  }
  throw new Error('No single color satisfies these backgrounds; use a contextual or two-color indicator');
}

/** Lightens toward white in 1% steps until relative luminance reaches the target. */
export function liftToLuminance(hex: string, target: number): string {
  for (let i = 0; i <= 100; i++) {
    const c = mix(hex, '#FFFFFF', i / 100);
    if (luminance(c) >= target) return c;
  }
  return '#FFFFFF';
}

export function saturation(hex: string): number {
  const c = hexToRgb(hex);
  const hi = Math.max(...c);
  return hi === 0 ? 0 : (hi - Math.min(...c)) / hi;
}
