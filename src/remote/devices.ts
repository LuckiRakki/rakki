// Playing across devices, phase 1 (docs/REMOTE_PLAYBACK.md): every Rakki app tells the server
// what it can do and sends the queue around its song with its playback reports, so any Rakki
// can list the others and what they're playing. Plain TypeScript, shared by the phone and the
// desktop. Controlling another app and moving playback come in the next phases.
import { CLIENT_NAME, type BaseItem, type ClientCapabilities, type JellyfinClient, type PlaybackInfo } from '@/api/jellyfin';

const TICKS_PER_SECOND = 10_000_000;
/** Songs before and after the playing one sent with reports (a full queue can be thousands). */
const BEFORE = 20;
const AFTER = 180;
/** Older than this, a session that isn't playing isn't worth listing. */
const IDLE_SHOWN_MS = 15 * 60_000;

/**
 * Phase 1 announces audio playback but no remote control yet (SupportsMediaControl false), so
 * other apps don't offer controls that would do nothing.
 */
export const RAKKI_CAPABILITIES: ClientCapabilities = {
  PlayableMediaTypes: ['Audio'],
  SupportedCommands: [],
  SupportsMediaControl: false,
};

/** Announce this app's capabilities (at sign-in; harmless to repeat). */
export function announceCapabilities(client: JellyfinClient): Promise<void> {
  return client.postCapabilities(RAKKI_CAPABILITIES).catch(() => {});
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
  queueLength: number;
}

/** Where the other device is in its song now (reported position + time since, while playing). */
export function positionNow(d: RakkiDevice, now = Date.now()): number {
  return d.paused || !d.item ? d.reportedSec : d.reportedSec + Math.max(0, now - d.reportedAt) / 1000;
}

/** Your other Rakki apps on this server (not this one): playing first, then the recently used. */
export async function otherRakkiDevices(client: JellyfinClient): Promise<RakkiDevice[]> {
  const sessions = await client.getSessions();
  const now = Date.now();
  return sessions
    .filter((s) => s.Client === CLIENT_NAME && s.DeviceId !== client.session.deviceId)
    .map((s) => ({
      sessionId: s.Id,
      deviceId: s.DeviceId ?? '',
      name: s.DeviceName ?? 'Rakki',
      version: s.ApplicationVersion ?? '',
      item: s.NowPlayingItem ?? null,
      paused: !!s.PlayState?.IsPaused,
      reportedSec: (s.PlayState?.PositionTicks ?? 0) / TICKS_PER_SECOND,
      reportedAt: Date.parse(s.LastPlaybackCheckIn ?? s.LastActivityDate ?? '') || now,
      queueLength: s.NowPlayingQueue?.length ?? 0,
    }))
    .filter((d) => d.item || now - d.reportedAt < IDLE_SHOWN_MS)
    .sort((a, b) => Number(!!b.item && !b.paused) - Number(!!a.item && !a.paused) || b.reportedAt - a.reportedAt);
}
