// Playing across devices (docs/REMOTE_PLAYBACK.md). Every Rakki app tells the server what it can
// do and sends the queue around its song with its playback reports, so any Rakki can list the
// others and what they're playing (phase 1), control them (phase 2: remote/socket.ts is the
// receiving end), and move playback from one to another (phase 3: pullFrom, pushTo). Plain
// TypeScript, shared by the phone and the desktop.
import {
  CLIENT_NAME,
  type BaseItem,
  type ClientCapabilities,
  type JellyfinClient,
  type PlaybackInfo,
  type PlaystateCommand,
  type SessionInfo,
} from '@/api/jellyfin';

const TICKS_PER_SECOND = 10_000_000;
/** Songs before and after the playing one sent with reports (a full queue can be thousands). */
const BEFORE = 20;
const AFTER = 180;
/** Older than this, a session that isn't playing isn't worth listing. */
const IDLE_SHOWN_MS = 15 * 60_000;

/** Audio playback that other Rakki apps can control (the commands come over remote/socket.ts). */
export function capabilities(commands: string[]): ClientCapabilities {
  return { PlayableMediaTypes: ['Audio'], SupportedCommands: commands, SupportsMediaControl: true };
}

/** Announce this app's capabilities (when its live connection opens; harmless to repeat). */
export function announceCapabilities(client: JellyfinClient, commands: string[] = []): Promise<void> {
  return client.postCapabilities(capabilities(commands)).catch(() => {});
}

/** The queue around the playing song, for a playback report (radio stations left out: they
 *  aren't Jellyfin items). */
export function queueReport(items: BaseItem[], index: number): Pick<PlaybackInfo, 'NowPlayingQueue' | 'PlaylistItemId'> {
  if (index < 0 || index >= items.length || items[index].Radio) return {};
  const first = Math.max(0, index - BEFORE);
  const last = Math.min(items.length, index + AFTER + 1);
  const NowPlayingQueue = [];
  for (let i = first; i < last; i++) if (!items[i].Radio) NowPlayingQueue.push({ Id: items[i].Id, PlaylistItemId: `q${i}` });
  return { NowPlayingQueue, PlaylistItemId: `q${index}` };
}

export interface RakkiDevice {
  sessionId: string;
  deviceId: string;
  /** As the app named itself: "Rakki on Windows", "Ana's iPhone". */
  name: string;
  version: string;
  item: BaseItem | null;
  paused: boolean;
  /** Seconds into the song when it last reported. */
  reportedSec: number;
  /** When it last reported (ms since 1970). */
  reportedAt: number;
  /** Its queue around the song (song ids) and where the song is in it. */
  queue: string[];
  queueIndex: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  /** It takes commands (phase 2): its live connection is open. */
  controllable: boolean;
  /** The general commands it takes (SetVolume...). */
  commands: string[];
}

/** Where the other device is in its song now (reported position + time since, while playing). */
export function positionNow(d: RakkiDevice, now = Date.now()): number {
  return d.paused || !d.item ? d.reportedSec : d.reportedSec + Math.max(0, now - d.reportedAt) / 1000;
}

function toDevice(s: SessionInfo, now: number): RakkiDevice {
  const queue = (s.NowPlayingQueue ?? []).map((q) => q.Id);
  const current = s.PlaylistItemId;
  let queueIndex = current ? (s.NowPlayingQueue ?? []).findIndex((q) => q.PlaylistItemId === current) : -1;
  if (queueIndex < 0 && s.NowPlayingItem) queueIndex = queue.indexOf(s.NowPlayingItem.Id);
  const repeat = s.PlayState?.RepeatMode;
  return {
    sessionId: s.Id,
    deviceId: s.DeviceId ?? '',
    name: s.DeviceName ?? 'Rakki',
    version: s.ApplicationVersion ?? '',
    item: s.NowPlayingItem ?? null,
    paused: !!s.PlayState?.IsPaused,
    reportedSec: (s.PlayState?.PositionTicks ?? 0) / TICKS_PER_SECOND,
    reportedAt: Date.parse(s.LastPlaybackCheckIn ?? s.LastActivityDate ?? '') || now,
    queue,
    queueIndex,
    shuffle: s.PlayState?.PlaybackOrder === 'Shuffle',
    repeat: repeat === 'RepeatOne' ? 'one' : repeat === 'RepeatAll' ? 'all' : 'off',
    controllable: !!(s.SupportsRemoteControl || s.Capabilities?.SupportsMediaControl),
    commands: s.Capabilities?.SupportedCommands ?? [],
  };
}

/** Your other Rakki apps on this server (not this one): playing first, then the recently used. */
export async function otherRakkiDevices(client: JellyfinClient): Promise<RakkiDevice[]> {
  const sessions = await client.getSessions();
  const now = Date.now();
  return sessions
    .filter((s) => s.Client === CLIENT_NAME && s.UserId === client.session.userId && s.DeviceId !== client.session.deviceId)
    .map((s) => toDevice(s, now))
    .filter((d) => d.item || now - d.reportedAt < IDLE_SHOWN_MS)
    .sort((a, b) => Number(!!b.item && !b.paused) - Number(!!a.item && !a.paused) || b.reportedAt - a.reportedAt);
}

/** One device, fresh (null when it's gone). */
export async function deviceNow(client: JellyfinClient, sessionId: string): Promise<RakkiDevice | null> {
  const sessions = await client.getSessions();
  const s = sessions.find((x) => x.Id === sessionId);
  return s ? toDevice(s, Date.now()) : null;
}

// ---- Phase 2: control ----

export function control(client: JellyfinClient, d: RakkiDevice, command: PlaystateCommand, seekSec?: number) {
  return client.sessionPlaystate(d.sessionId, command, seekSec === undefined ? undefined : Math.round(seekSec * TICKS_PER_SECOND));
}

export function setDeviceVolume(client: JellyfinClient, d: RakkiDevice, percent: number) {
  return client.sessionCommand(d.sessionId, 'SetVolume', { Volume: String(Math.round(percent)) });
}

// ---- Phase 3: moving playback ----

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Songs by id, in the order asked (the server answers in its own order). */
async function itemsInOrder(client: JellyfinClient, ids: string[]): Promise<BaseItem[]> {
  const byId = new Map<string, BaseItem>();
  for (let i = 0; i < ids.length; i += 100) for (const it of await client.getItemsByIds(ids.slice(i, i + 100))) byId.set(it.Id, it);
  return ids.map((id) => byId.get(id)).filter((x): x is BaseItem => !!x);
}

export interface Handoff {
  items: BaseItem[];
  index: number;
  positionSec: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
}

/**
 * "Play here": take another device's queue and place in its song. It's paused first, so its
 * report carries the exact position; the caller starts playing, then calls `release` to stop
 * the other device.
 */
export async function pullFrom(client: JellyfinClient, d: RakkiDevice): Promise<Handoff & { release(): Promise<void> }> {
  let now = d;
  if (d.controllable && d.item && !d.paused) {
    await control(client, d, 'Pause').catch(() => {});
    // Its paused report comes within a moment.
    for (let i = 0; i < 8; i++) {
      await sleep(250);
      const fresh = await deviceNow(client, d.sessionId).catch(() => null);
      if (fresh?.paused) {
        now = fresh;
        break;
      }
    }
  }
  const ids = now.queue.length ? now.queue : now.item ? [now.item.Id] : [];
  const items = await itemsInOrder(client, ids);
  const wanted = now.item?.Id;
  let index = Math.max(0, now.queueIndex);
  if (items[index]?.Id !== wanted) index = Math.max(0, items.findIndex((x) => x.Id === wanted));
  return {
    items,
    index,
    positionSec: positionNow(now),
    shuffle: now.shuffle,
    repeat: now.repeat,
    release: () => (d.controllable ? control(client, d, 'Stop').catch(() => {}) : Promise.resolve()),
  };
}

/**
 * "Play on {device}": send it this queue and position. Resolves true once it reports playing
 * the song (the caller then stops here), false if it didn't within a few seconds.
 */
export async function pushTo(client: JellyfinClient, d: RakkiDevice, items: BaseItem[], index: number, positionSec: number): Promise<boolean> {
  const songs = items.map((it, i) => ({ it, i })).filter(({ it }) => !it.Radio);
  const at = Math.max(0, songs.findIndex(({ i }) => i === index));
  // The queue around the song (the request carries the ids in its address).
  const first = Math.max(0, at - BEFORE);
  const window = songs.slice(first, at + AFTER + 1).map(({ it }) => it.Id);
  const wanted = songs[at]?.it.Id;
  if (!wanted) return false;
  await client.sessionPlay(d.sessionId, window, at - first, positionSec * TICKS_PER_SECOND);
  for (let i = 0; i < 24; i++) {
    await sleep(400);
    const fresh = await deviceNow(client, d.sessionId).catch(() => null);
    if (fresh?.item?.Id === wanted && !fresh.paused) return true;
  }
  return false;
}
