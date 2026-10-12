// Music videos, played inside Rakki (player/VideoPlayer.tsx). Formats the webview plays itself
// (MP4/MOV/WebM with H.264, VP8/VP9 or AV1, and AAC/MP3/Opus/Vorbis/FLAC sound) stream straight
// from the file; anything else is converted by the server to H.264/AAC over HLS (at most 720p,
// like the phone), played with hls.js. The music pauses while a video is open and picks up
// again when it closes, if it was playing.
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { client } from '~/auth/session';
import { usePlayer } from '~/player/store';

export interface VideoSource {
  url: string;
  hls: boolean;
  playSessionId: string;
}

const CONTAINERS = ['mp4', 'm4v', 'mov', 'webm'];
const VIDEO_CODECS = ['h264', 'vp8', 'vp9', 'av1'];
const AUDIO_CODECS = ['aac', 'mp3', 'opus', 'vorbis', 'flac'];

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

interface VideoState {
  video: BaseItem | null;
  /** The music was playing when the video opened (it resumes after). */
  resume: boolean;
  open(video: BaseItem): void;
  close(): void;
}

export const useVideo = create<VideoState>((set, get) => ({
  video: null,
  resume: false,
  open(video) {
    const p = usePlayer.getState();
    const resume = get().video ? get().resume : p.playing;
    if (p.playing) p.toggle();
    set({ video, resume });
  },
  close() {
    const { resume } = get();
    set({ video: null, resume: false });
    if (resume && !usePlayer.getState().playing) usePlayer.getState().toggle();
  },
}));

export const playVideo = (video: BaseItem) => useVideo.getState().open(video);
