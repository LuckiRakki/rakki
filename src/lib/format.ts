/** Jellyfin durations are in ticks (100 ns). */
export const TICKS_PER_SECOND = 10_000_000;

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function ticksToSeconds(ticks?: number | null): number {
  return ticks ? ticks / TICKS_PER_SECOND : 0;
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** A total length, like Spotify: "42 min", "1 hr 5 min", "35 hr 34 min". */
export function formatLength(seconds: number): string {
  const total = Math.round(Math.max(0, seconds) / 60);
  if (total < 60) return `${Math.max(1, total)} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** "1 song", "12 songs". */
export function songCount(n: number): string {
  return `${n} song${n === 1 ? '' : 's'}`;
}

/** "840 MB", "1.2 GB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
