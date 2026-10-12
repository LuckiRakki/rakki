// Playing a music video: the music pauses, the video opens in its own mpv window (src-tauri
// video.rs, straight from the file: mpv plays every format), and when that window closes the
// music carries on if it was playing before.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type { BaseItem } from '@/api/jellyfin';
import { client } from '~/auth/session';
import { inTauri } from '~/lib/tauri';
import { usePlayer } from '~/player/store';
import { toast } from '~/ui/overlays';

let resumeAfter = false;
let listening = false;

export async function playVideo(video: BaseItem) {
  const c = client();
  if (!c) return;
  if (!inTauri) return toast('Videos play in the Rakki app');
  const { serverUrl, token } = c.session;
  const source = video.MediaSources?.[0];
  const q = new URLSearchParams({ static: 'true', MediaSourceId: source?.Id ?? video.Id, api_key: token });
  const url = `${serverUrl}/Videos/${video.Id}/stream?${q}`;
  const title = [video.Name, video.Artists?.join(', ')].filter(Boolean).join(' · ');
  const p = usePlayer.getState();
  if (p.playing) {
    resumeAfter = true;
    p.toggle();
  }
  if (!listening) {
    listening = true;
    void listen('video://closed', () => {
      if (resumeAfter && !usePlayer.getState().playing) usePlayer.getState().toggle();
      resumeAfter = false;
    });
  }
  try {
    await invoke('video_play', { url, title, volume: p.volume });
  } catch (e) {
    toast(String(e));
    if (resumeAfter) usePlayer.getState().toggle();
    resumeAfter = false;
  }
}
