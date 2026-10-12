// Discord's "Listening to ..." (src-tauri/src/discord.rs talks to the Discord app). On while
// playing, with the song, artists, album and a time bar; cleared when paused or stopped.
// Updates only when the song changes, playback pauses or resumes, or you seek (Discord allows
// about five updates in 20 seconds).
//
// Discord can't load pictures from your own server (it's private), so the cover comes from
// Apple's public iTunes search by artist and album (only while this is on), else the
// application's own "rakki" picture if you uploaded one in Discord's developer portal.
import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { inTauri } from '~/lib/tauri';
import { currentPosition, usePlayer } from '~/player/store';

const KEY = 'rakki.discord';

interface DiscordPrefs {
  enabled: boolean;
  appId: string;
}

function load(): DiscordPrefs {
  try {
    return { enabled: false, appId: '', ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DiscordPrefs>) };
  } catch {
    return { enabled: false, appId: '' };
  }
}

export const useDiscord = create<DiscordPrefs & { error: string | null; set(p: Partial<DiscordPrefs>): void }>((set, get) => ({
  ...load(),
  error: null,
  set(p) {
    const next = { enabled: get().enabled, appId: get().appId, ...p };
    localStorage.setItem(KEY, JSON.stringify(next));
    set({ ...next, error: null });
    void sync(true);
  },
}));

const covers = new Map<string, Promise<string | null>>();

/** A public picture of the album (iTunes search), or null. */
function coverFor(item: BaseItem): Promise<string | null> {
  const artist = item.AlbumArtist ?? item.Artists?.[0] ?? '';
  const album = item.Album ?? item.Name;
  const key = `${artist}|${album}`.toLowerCase();
  let found = covers.get(key);
  if (!found) {
    const term = encodeURIComponent(`${artist} ${album}`.slice(0, 120));
    found = fetch(`https://itunes.apple.com/search?term=${term}&entity=album&limit=1`)
      .then((r) => r.json())
      .then((j: { results?: { artworkUrl100?: string }[] }) => j.results?.[0]?.artworkUrl100?.replace('100x100bb', '512x512bb') ?? null)
      .catch(() => null);
    covers.set(key, found);
  }
  return found;
}

/** Discord wants 2 to 128 characters. */
const text = (s: string | undefined) => {
  const t = (s ?? '').trim();
  return t.length < 2 ? `${t}  `.slice(0, 2) : t.slice(0, 128);
};

let last = '';

async function sync(force = false) {
  if (!inTauri) return;
  const d = useDiscord.getState();
  const p = usePlayer.getState();
  const item = p.queue[p.index];
  const on = d.enabled && /^\d{15,22}$/.test(d.appId.trim());
  const show = on && item && p.playing;
  // What would be shown, to skip repeats (the time bar is checked separately below).
  const what = show ? `${item.Id}|${Math.round(currentPosition(p))}` : 'off';
  if (!force && what === last) return;
  if (!on && last === 'off') return;
  last = what;

  let activity: Record<string, unknown> | null = null;
  if (show) {
    const start = Date.now() - currentPosition(p) * 1000;
    const cover = await coverFor(item);
    activity = {
      type: 2, // Listening
      details: text(item.Name),
      state: text(item.Artists?.join(', ') || item.AlbumArtist || 'Unknown artist'),
      timestamps: p.duration > 0 ? { start: Math.round(start), end: Math.round(start + p.duration * 1000) } : { start: Math.round(start) },
      assets: { large_image: cover ?? 'rakki', large_text: text(item.Album ?? 'Rakki') },
    };
  }
  if (!on && !d.appId.trim()) return;
  try {
    await invoke('discord_set', { appId: d.appId.trim(), activity });
    if (useDiscord.getState().error) useDiscord.setState({ error: null });
  } catch (e) {
    useDiscord.setState({ error: String(e) });
  }
}

let started = false;

/** Follow the player (main.tsx, once). */
export function startDiscord() {
  if (started || !inTauri) return;
  started = true;
  let lastExpected = 0;
  usePlayer.subscribe((s, prev) => {
    const changed = s.queue[s.index]?.Id !== prev.queue[prev.index]?.Id || s.playing !== prev.playing;
    // A seek: the position moved away from where time alone would put it.
    const pos = currentPosition(s);
    const seeked = s.position !== prev.position && Math.abs(pos - lastExpected) > 3;
    lastExpected = pos;
    if (changed || seeked) void sync(true);
  });
  // Keep the expected position moving, and catch anything missed, every 15 seconds.
  setInterval(() => {
    lastExpected = currentPosition(usePlayer.getState());
  }, 15_000);
  void sync(true);
}
