// Reports playback to Jellyfin the way Finamp does, so play counts, "Recently played",
// the dashboard's Now Playing and Last.fm (via the server plugin) all work:
//   start → /Sessions/Playing
//   pause/resume → /Progress with EventName Pause/Unpause
//   every 10 s while playing → /Progress TimeUpdate
//   after a seek (debounced) → /Progress TimeUpdate
//   song ends or is skipped → /Stopped with where it stopped (full length if it ended)
// Failures are ignored: reporting must never interrupt playback. A song that counts as played
// but couldn't be reported (offline) is kept and sent later (offlineListens.ts).
import type { BaseItem, PlaybackInfo } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { ticksToSeconds } from '@/lib/format';
import { countsAsPlayed, keepListen } from '@/player/offlineListens';

const TICKS_PER_SECOND = 10_000_000;
const REPORT_EVERY_MS = 10_000;
const SAMPLE_EVERY_MS = 1_000;

interface Current {
  itemId: string;
  key: string;
  playSessionId: string;
  startTicks: number;
  durationSec: number;
}

interface Context {
  position(): number;
  playing(): boolean;
  repeat(): 'off' | 'all' | 'one';
  shuffle(): boolean;
}

let ctx: Context | null = null;
let current: Current | null = null;
let lastPosition = 0;
let sinceReport = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let seekTimer: ReturnType<typeof setTimeout> | null = null;

function sessionId() {
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function send(kind: 'start' | 'progress' | 'stopped', body: PlaybackInfo, onFail?: () => void) {
  const client = useAuth.getState().client;
  if (!client) return;
  const call =
    kind === 'start'
      ? client.reportPlaybackStart(body)
      : kind === 'progress'
        ? client.reportPlaybackProgress(body)
        : client.reportPlaybackStopped(body);
  call.catch(() => onFail?.());
}

function info(c: Current, position: number, extra: Partial<PlaybackInfo> = {}): PlaybackInfo {
  const repeat = ctx?.repeat() ?? 'off';
  return {
    ItemId: c.itemId,
    PlaySessionId: c.playSessionId,
    PositionTicks: Math.max(0, Math.round(position * TICKS_PER_SECOND)),
    CanSeek: true,
    PlayMethod: 'DirectPlay',
    PlaybackStartTimeTicks: c.startTicks,
    RepeatMode: repeat === 'one' ? 'RepeatOne' : repeat === 'all' ? 'RepeatAll' : 'RepeatNone',
    PlaybackOrder: ctx?.shuffle() ? 'Shuffle' : 'Default',
    IsPaused: !(ctx?.playing() ?? false),
    ...extra,
  };
}

function ensureTimer() {
  if (timer) return;
  timer = setInterval(() => {
    if (!ctx || !current) return;
    lastPosition = ctx.position();
    if (!ctx.playing()) return;
    sinceReport += SAMPLE_EVERY_MS;
    if (sinceReport >= REPORT_EVERY_MS) {
      sinceReport = 0;
      send('progress', info(current, lastPosition, { EventName: 'TimeUpdate' }));
    }
  }, SAMPLE_EVERY_MS);
}

export const reporter = {
  bind(context: Context) {
    ctx = context;
    ensureTimer();
  },

  get currentKey() {
    return current?.key ?? null;
  },

  started(item: BaseItem, key: string) {
    // Radio isn't a Jellyfin item: nothing to report.
    if (item.Radio) return;
    current = {
      itemId: item.Id,
      key,
      playSessionId: sessionId(),
      startTicks: Date.now() * 10_000,
      durationSec: ticksToSeconds(item.RunTimeTicks),
    };
    lastPosition = 0;
    sinceReport = 0;
    send('start', info(current, 0));
  },

  /** @param position where the song stopped; defaults to the last sampled position. */
  stopped(position?: number | null) {
    if (!current) return;
    const song = current;
    const at = position ?? lastPosition;
    send('stopped', info(song, at), () => {
      if (countsAsPlayed(at, song.durationSec)) keepListen(song.itemId);
    });
    current = null;
    if (seekTimer) clearTimeout(seekTimer);
    seekTimer = null;
  },

  pausedChanged(paused: boolean, position: number) {
    if (!current) return;
    lastPosition = position;
    send('progress', info(current, position, { EventName: paused ? 'Pause' : 'Unpause', IsPaused: paused }));
  },

  seeked(position: number) {
    lastPosition = position;
    if (seekTimer) clearTimeout(seekTimer);
    seekTimer = setTimeout(() => {
      seekTimer = null;
      if (current) send('progress', info(current, ctx?.position() ?? position, { EventName: 'TimeUpdate' }));
    }, 1200);
  },
};
