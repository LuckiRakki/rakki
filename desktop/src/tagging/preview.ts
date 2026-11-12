// Listening to a file before tagging it: one small player for Tagging, straight from MRQ (the
// file as it is on the server, not through Jellyfin). Rakki's own song pauses while it plays.
import { create } from 'zustand';

import { usePlayer } from '~/player/store';
import { audioUrl } from '~/tagging/api';

let audio: HTMLAudioElement | null = null;

export const usePreview = create<{ tid: string | null; playing: boolean }>(() => ({ tid: null, playing: false }));

/** Play a file (by its tid), or pause it when it's the one playing. */
export function togglePreview(tid: string) {
  const s = usePreview.getState();
  if (!audio) {
    audio = new Audio();
    audio.preload = 'none';
    audio.addEventListener('play', () => usePreview.setState({ playing: true }));
    audio.addEventListener('pause', () => usePreview.setState({ playing: false }));
    audio.addEventListener('ended', () => usePreview.setState({ playing: false }));
  }
  if (s.tid === tid) {
    if (audio.paused) void audio.play().catch(() => usePreview.setState({ playing: false }));
    else audio.pause();
    return;
  }
  const p = usePlayer.getState();
  if (p.playing) p.toggle();
  audio.src = audioUrl(tid);
  usePreview.setState({ tid, playing: true });
  void audio.play().catch(() => usePreview.setState({ playing: false }));
}

export function stopPreview() {
  audio?.pause();
  usePreview.setState({ tid: null, playing: false });
}
