// Sleep timer: pause after some minutes (fading out over the last 10 s) or at the end of the
// song that's playing.
import { useEffect, useState } from 'react';
import { create } from 'zustand';

import { engine } from '@/player/engine';
import { usePlayer } from '@/player/store';

const FADE_MS = 10_000;
const FADE_STEPS = 20;

export const useSleepTimer = create<{ endsAt: number | null; endOfSong: boolean }>(() => ({
  endsAt: null,
  endOfSong: false,
}));

let timer: ReturnType<typeof setTimeout> | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;

function clearTimers() {
  if (timer) clearTimeout(timer);
  if (ticker) clearInterval(ticker);
  timer = null;
  ticker = null;
}

function pauseNow() {
  clearTimers();
  if (usePlayer.getState().playing) usePlayer.getState().toggle();
  void engine.setVolume(1);
  useSleepTimer.setState({ endsAt: null, endOfSong: false });
}

function fadeOut() {
  let step = 0;
  ticker = setInterval(() => {
    step++;
    void engine.setVolume(Math.max(0, 1 - step / FADE_STEPS));
    if (step >= FADE_STEPS) pauseNow();
  }, FADE_MS / FADE_STEPS);
}

/** Minutes from now, 'song' for the end of this song, or null to turn it off. */
export function setSleepTimer(choice: number | 'song' | null) {
  clearTimers();
  void engine.setVolume(1);
  if (choice === null) {
    useSleepTimer.setState({ endsAt: null, endOfSong: false });
    return;
  }
  if (choice === 'song') {
    useSleepTimer.setState({ endsAt: null, endOfSong: true });
    // Pause just as the song ends, before the next one starts.
    ticker = setInterval(() => {
      const { position, duration } = engine.getProgress();
      if (duration > 0 && duration - position < 0.4) pauseNow();
    }, 200);
    return;
  }
  const ms = choice * 60_000;
  useSleepTimer.setState({ endsAt: Date.now() + ms, endOfSong: false });
  timer = setTimeout(fadeOut, Math.max(0, ms - FADE_MS));
}

export const SLEEP_OPTIONS: { key: string; label: string; value: number | 'song' }[] = [
  { key: '5', label: '5 minutes', value: 5 },
  { key: '15', label: '15 minutes', value: 15 },
  { key: '30', label: '30 minutes', value: 30 },
  { key: '45', label: '45 minutes', value: 45 },
  { key: '60', label: '1 hour', value: 60 },
  { key: 'song', label: 'End of this song', value: 'song' },
];

/** What the timer says right now ("12 min", "End of song"), or null when it's off. */
export function useSleepLabel(): string | null {
  const endsAt = useSleepTimer((s) => s.endsAt);
  const endOfSong = useSleepTimer((s) => s.endOfSong);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [endsAt]);
  if (endOfSong) return 'End of song';
  if (!endsAt) return null;
  return `${Math.max(1, Math.ceil((endsAt - now) / 60_000))} min`;
}

/** The pick-one sheet entries (with "Turn off" while a timer is running). */
export function sleepSheet(active: boolean) {
  return {
    title: 'Sleep timer',
    options: [...(active ? [{ key: 'off', label: 'Turn off timer' }] : []), ...SLEEP_OPTIONS.map(({ key, label }) => ({ key, label }))],
    onSelect: (key: string) => {
      if (key === 'off') return setSleepTimer(null);
      const opt = SLEEP_OPTIONS.find((o) => o.key === key);
      if (opt) setSleepTimer(opt.value);
    },
  };
}
