// History and Stats helpers shared by the phone and the desktop (Rakki 2.0).
import type { RakkiHistoryEntry, RakkiStats } from '@/api/jellyfin';

export type StatsRange = '7' | '30' | 'year' | 'all';

export const RANGES: { value: StatsRange; label: string }[] = [
  { value: '7', label: '7 Days' },
  { value: '30', label: '30 Days' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
];

/** The plugin's `days` for a range ("This Year" = the days since January 1st, today included). */
export function rangeDays(range: StatsRange, now = new Date()): number {
  if (range === 'all') return 0;
  if (range === 'year') {
    const jan1 = new Date(now.getFullYear(), 0, 1);
    return Math.floor((now.getTime() - jan1.getTime()) / 86_400_000) + 1;
  }
  return Number(range);
}

/** "14 h 22 m", "48 m". */
export function hm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${m} m`;
}

/** "2 h 10 m more than last week", or null when there's nothing to compare. */
export function compareLine(stats: RakkiStats, range: StatsRange): string | null {
  if (range === 'all' || range === 'year' || stats.PreviousMinutes <= 0) return null;
  const diff = stats.Minutes - stats.PreviousMinutes;
  if (Math.abs(diff) < 1) return range === '7' ? 'Same as last week' : 'Same as the 30 days before';
  const than = range === '7' ? 'last week' : 'the 30 days before';
  return `${hm(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than ${than}`;
}

export interface ChartBar {
  key: string;
  /** Under the bar: "Mon", "Today", "12", "Mar". */
  label: string;
  /** In the readout: "Fri, Nov 6", "March 2026". */
  title: string;
  minutes: number;
  today: boolean;
}

const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const DATE = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const MONTH = new Intl.DateTimeFormat(undefined, { month: 'short' });
const MONTH_LONG = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The listening chart: a bar per day up to a month, a bar per month beyond that. */
export function chartBars(stats: RakkiStats): ChartBar[] {
  const todayKey = localKey(new Date());
  if (stats.PerDay.length <= 31) {
    const long = stats.PerDay.length > 7;
    return stats.PerDay.map((d) => {
      const date = parseDay(d.Date);
      const today = d.Date === todayKey;
      return {
        key: d.Date,
        label: today && !long ? 'Today' : long ? String(date.getDate()) : DAY.format(date),
        title: today ? 'Today' : DATE.format(date),
        minutes: d.Minutes,
        today,
      };
    });
  }
  const months = new Map<string, ChartBar>();
  const thisMonth = todayKey.slice(0, 7);
  for (const d of stats.PerDay) {
    const key = d.Date.slice(0, 7);
    let bar = months.get(key);
    if (!bar) {
      const date = parseDay(`${key}-01`);
      bar = { key, label: MONTH.format(date), title: MONTH_LONG.format(date), minutes: 0, today: key === thisMonth };
      months.set(key, bar);
    }
    bar.minutes += d.Minutes;
  }
  return [...months.values()].slice(-12);
}

export function localKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** History grouped under "Today", "Yesterday", then dates. */
export function groupByDay(entries: RakkiHistoryEntry[]): { title: string; entries: RakkiHistoryEntry[] }[] {
  const today = localKey(new Date());
  const yesterday = localKey(new Date(Date.now() - 86_400_000));
  const groups: { title: string; entries: RakkiHistoryEntry[] }[] = [];
  for (const e of entries) {
    const at = new Date(e.At);
    const key = localKey(at);
    const title = key === today ? 'Today' : key === yesterday ? 'Yesterday' : DATE.format(at);
    const last = groups[groups.length - 1];
    if (last?.title === title) last.entries.push(e);
    else groups.push({ title, entries: [e] });
  }
  return groups;
}

const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** "8:58 PM", or "Now" for a play that ended in the last few minutes. */
export function playTime(e: RakkiHistoryEntry): string {
  const at = new Date(e.At);
  return Date.now() - at.getTime() < 4 * 60_000 ? 'Now' : TIME.format(at);
}

/** Which kind of device a play came from, for its little icon. */
export function deviceKind(e: RakkiHistoryEntry): 'phone' | 'desktop' | 'web' | 'other' {
  const s = `${e.App} ${e.Device}`.toLowerCase();
  if (s.includes('desktop')) return 'desktop';
  if (s.includes('iphone') || s.includes('ipad') || s.includes('android') || s.includes('phone')) return 'phone';
  if (s.includes('web') || s.includes('chrome') || s.includes('firefox') || s.includes('safari') || s.includes('edge')) return 'web';
  return 'other';
}

export function deviceLabel(e: RakkiHistoryEntry): string {
  return e.Device ? `Played on ${e.Device}` : e.App ? `Played in ${e.App}` : 'Played';
}
