/** Display formatting (style guide 9). Money is integer dollars; unknown values show an em dash. */

export function money(value: number | null | undefined, exact = false): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (exact) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value);
  }
  const sign = value < 0 ? '−' : '';
  const n = Math.abs(value);
  // Round in the smaller unit first, and move up a unit when that reaches 1,000 ($999,950 is $1.0M).
  const tenths = (unit: number) => Math.round(n / (unit / 10)) / 10;
  if (tenths(1e6) >= 1000) return `${sign}$${tenths(1e9).toFixed(1)}B`;
  if (tenths(1e3) >= 1000) return `${sign}$${tenths(1e6).toFixed(1)}M`;
  if (Math.round(n) >= 1000) return `${sign}$${Number(tenths(1e3).toFixed(1))}K`;
  return `${sign}$${Math.round(n)}`;
}

/** Real-time save age: "just now", "5 minutes ago", or a date. */
export function savedAgo(savedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - savedAt) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  return `on ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(savedAt)}`;
}

/** An ordinal number: "1st", "2nd", "11th", "23rd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** Wins and losses, with ties only when there are some (style guide 9). */
export function record(wins: number, losses: number, ties = 0): string {
  return ties ? `${wins}–${losses}–${ties}` : `${wins}–${losses}`;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];
const WEEKDAYS: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday'
};

/** A schedule date: "Sunday, September 13". `day` is the schedule's three-letter weekday. */
export function gameDay(date: string, day?: string): string {
  const [, month, dayOfMonth] = date.split('-').map(Number) as [number, number, number];
  const weekday = day ? `${WEEKDAYS[day] ?? day}, ` : '';
  return `${weekday}${MONTHS[month - 1]} ${dayOfMonth}`;
}

/** A kickoff in Eastern time: "1:00 PM ET". */
export function kickoff(timeEt: string): string {
  const [hour, minute] = timeEt.split(':').map(Number) as [number, number];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix} ET`;
}
