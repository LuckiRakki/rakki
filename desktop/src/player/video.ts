// Music videos, played inside Rakki (player/VideoHost.tsx), in three sizes like the phone app:
//   - mini: in the right sidebar (or a small card when it's closed), music-player style;
//   - theater: over the window with the video's colours behind it, what it is (title,
//     artists, the album, quality), a visualizer graph, and Up next (the phone's video screen);
//   - full: the video alone, filling the screen.
// Formats the webview plays itself (MP4/MOV/WebM with H.264, VP8/VP9 or AV1, and AAC/MP3/Opus/
// Vorbis/FLAC sound) stream straight from the file; anything else is converted by the server to
// H.264/AAC over HLS (at most 720p, like the phone). One player at a time: a video stops the
// music and takes over the player bar and the right sidebar; playing music closes the video.
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { matchKey } from '@/lib/lastfm';
import { videosByArtist, videoTitle } from '@/video/titles';
import { client } from '~/auth/session';
import { useLayout } from '~/layout/layout';
import { usePlayer } from '~/player/store';
import { queryClient } from '~/queries';

export type VideoMode = 'mini' | 'theater' | 'full';

export interface VideoSource {
  url: string;
  hls: boolean;
  playSessionId: string;
}

const CONTAINERS = ['mp4', 'm4v', 'mov', 'webm'];
const VIDEO_CODECS = ['h264', 'vp8', 'vp9', 'av1'];
const AUDIO_CODECS = ['aac', 'mp3', 'opus', 'vorbis', 'flac'];
const UP_NEXT = 12;

export function videoSource(video: BaseItem): VideoSource | null {
  const c = client();
  if (!c) return null;
  const { serverUrl, deviceId, token } = c.session;
  const playSessionId = crypto.randomUUID().replace(/-/g, '');
  const source = video.MediaSources?.[0];
  const streams = source?.MediaStreams ?? [];
  const v = streams.find((s) => s.Type === 'Video')?.Codec?.toLowerCase();
  const a = streams.find((s) => s.Type === 'Audio')?.Codec?.toLowerCase();
  const containers = (source?.Container ?? '').toLowerCase().split(',');
  const direct = containers.some((x) => CONTAINERS.includes(x)) && !!v && VIDEO_CODECS.includes(v) && (!a || AUDIO_CODECS.includes(a));
  const mediaSourceId = source?.Id ?? video.Id;
  if (direct) {
    const q = new URLSearchParams({ static: 'true', MediaSourceId: mediaSourceId, api_key: token });
    return { url: `${serverUrl}/Videos/${video.Id}/stream?${q}`, hls: false, playSessionId };
  }
  const q = new URLSearchParams({
    MediaSourceId: mediaSourceId,
    DeviceId: deviceId,
    PlaySessionId: playSessionId,
    VideoCodec: 'h264',
    AudioCodec: 'aac',
    TranscodingMaxAudioChannels: '2',
    SegmentContainer: 'ts',
    MaxStreamingBitrate: '8000000',
    VideoBitrate: '6000000',
    AudioBitrate: '192000',
    MaxWidth: '1280',
    MaxHeight: '720',
    api_key: token,
  });
  return { url: `${serverUrl}/Videos/${video.Id}/master.m3u8?${q}`, hls: true, playSessionId };
}

/** Every music video (cached with the Videos page's query). */
export function allVideos(): Promise<BaseItem[]> {
  const c = client();
  if (!c) return Promise.resolve([]);
  return queryClient.fetchQuery({ queryKey: ['musicVideos', c.session.userId], queryFn: () => c.getMusicVideos(), staleTime: 10 * 60_000 });
}

/** What follows a video: the artist's other videos, then the rest of the list it came from. */
function upNextFor(video: BaseItem, from: BaseItem[], played: Set<string>): BaseItem[] {
  const artist = video.Artists?.[0] ?? video.AlbumArtist;
  const byArtist = videosByArtist(artist, from);
  const start = from.findIndex((v) => v.Id === video.Id);
  const after = start >= 0 ? [...from.slice(start + 1), ...from.slice(0, start)] : from;
  const out: BaseItem[] = [];
  const seen = new Set<string>([video.Id, ...played]);
  for (const v of [...byArtist, ...after]) {
    if (seen.has(v.Id)) continue;
    seen.add(v.Id);
    out.push(v);
    if (out.length >= UP_NEXT) break;
  }
  return out;
}

interface VideoState {
  video: BaseItem | null;
  mode: VideoMode;
  upNext: BaseItem[];
  played: string[];
  /** Seconds until the next video starts after one ends (null: not counting). */
  countdown: number | null;
  open(video: BaseItem, from?: BaseItem[]): void;
  next(): void;
  /** The video before this one (Previous). */
  back(): void;
  setMode(mode: VideoMode): void;
  close(): void;
}

let fromList: BaseItem[] = [];

export const useVideo = create<VideoState>((set, get) => ({
  video: null,
  mode: 'theater',
  upNext: [],
  played: [],
  countdown: null,
  open(video, from) {
    const p = usePlayer.getState();
    const s = get();
    if (p.playing) p.toggle();
    const played = s.video ? [...s.played, s.video.Id] : [];
    set({ video, played, countdown: null, mode: s.video ? s.mode : 'theater' });
    // Up next from the list it was started from, else every video.
    const fill = (list: BaseItem[]) => get().video?.Id === video.Id && set({ upNext: upNextFor(video, list, new Set(played)) });
    if (from?.length) {
      fromList = from;
      fill(from);
    } else if (fromList.length) fill(fromList);
    else void allVideos().then((list) => ((fromList = list), fill(list)));
  },
  next() {
    const [first] = get().upNext;
    if (first) get().open(first);
    else set({ countdown: null });
  },
  back() {
    const s = get();
    const lastId = s.played[s.played.length - 1];
    const last = lastId ? fromList.find((v) => v.Id === lastId) : undefined;
    if (!last || !s.video) return;
    const current = s.video;
    set({ played: s.played.slice(0, -1), video: last, countdown: null, upNext: [current, ...s.upNext.filter((v) => v.Id !== current.Id)] });
  },
  setMode(mode) {
    const was = get().mode;
    set({ mode });
    const l = useLayout.getState();
    if (mode === 'full' && !l.fullscreen) l.setFullscreen(true);
    if (was === 'full' && mode !== 'full' && l.fullscreen) l.setFullscreen(false);
    // The mini player lives in the right sidebar: open it if it's closed.
    if (mode === 'mini' && !l.panel) l.setPanel('now');
  },
  close() {
    if (get().mode === 'full' && useLayout.getState().fullscreen) useLayout.getState().setFullscreen(false);
    fromList = [];
    set({ video: null, upNext: [], played: [], countdown: null, mode: 'theater' });
  },
}));

export const playVideo = (video: BaseItem, from?: BaseItem[]) => useVideo.getState().open(video, from);

/** The library song a video is of (for its album), matched by artist and title. */
export async function songForVideo(video: BaseItem): Promise<BaseItem | null> {
  const c = client();
  if (!c) return null;
  const title = videoTitle(video.Name, video.Artists ?? []);
  if (!title) return null;
  const artists = new Set((video.Artists ?? [video.AlbumArtist ?? '']).map(matchKey));
  const { songs } = await c.search(title, 25, ['songs']);
  return songs.find((s) => matchKey(s.Name) === matchKey(title) && [...(s.Artists ?? []), s.AlbumArtist ?? ''].some((a) => artists.has(matchKey(a)))) ?? null;
}
