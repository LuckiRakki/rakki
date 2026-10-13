// Discord's "Listening to ..." (src-tauri/src/discord.rs talks to the Discord app). On while
// playing, with the song, artists, album and a time bar; cleared when paused or stopped.
// Updates only when the song changes, playback pauses or resumes, or you seek (Discord allows
// about five updates in 20 seconds).
//
// Discord shows pictures only from public addresses its servers download (the local connection
// takes no images, and your own server is private), so the cover comes from Apple's public
// iTunes search by artist and album, else Last.fm (with your key), else the application's own
// "rakki" picture if you uploaded one in Discord's developer portal. Only while this is on.
import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { useSettings } from '@/settings/store';
import { inTauri } from '~/lib/tauri';
import { currentPosition, usePlayer } from '~/player/store';

const KEY = 'rakki.discord';

/** Rakki's own Discord application ("Listening to Rakki"); Settings can name another. */
export const RAKKI_DISCORD_APP = '1559411115925180416';
const validId = (id: string) => /^\d{15,22}$/.test(id);
/** The application in use: yours if you set one, else Rakki's. */
export const discordAppId = (appId: string) => (validId(appId.trim()) ? appId.trim() : RAKKI_DISCORD_APP);

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

/** Apple's public iTunes search, by artist and album. */
async function itunesCover(artist: string, album: string): Promise<string | null> {
  const term = encodeURIComponent(`${artist} ${album}`.slice(0, 120));
  const j = (await fetch(`https://itunes.apple.com/search?term=${term}&entity=album&limit=1`).then((r) => r.json())) as { results?: { artworkUrl100?: string }[] };
  return j.results?.[0]?.artworkUrl100?.replace('100x100bb', '512x512bb') ?? null;
}

/** Last.fm's album picture (with your Last.fm key, when iTunes doesn't know the album). */
async function lastfmCover(artist: string, album: string): Promise<string | null> {
  const key = useSettings.getState().lastfmApiKey;
  if (!key) return null;
  const q = new URLSearchParams({ method: 'album.getinfo', artist, album, api_key: key, format: 'json', autocorrect: '1' });
  const j = (await fetch(`https://ws.audioscrobbler.com/2.0/?${q}`).then((r) => r.json())) as { album?: { image?: { '#text': string; size: string }[] } };
  const images = j.album?.image ?? [];
  const best = images.find((i) => i.size === 'mega') ?? images.find((i) => i.size === 'extralarge');
  return best?.['#text'] || null;
}

/**
 * A public picture of the album, which Discord's servers can download (they can't reach your
 * own server, and the local connection to Discord only takes addresses, not pictures).
 */
function coverFor(item: BaseItem): Promise<string | null> {
  const artist = item.AlbumArtist ?? item.Artists?.[0] ?? '';
  const album = item.Album ?? item.Name;
  const key = `${artist}|${album}`.toLowerCase();
  let found = covers.get(key);
  if (!found) {
    found = itunesCover(artist, album)
      .catch(() => null)
      .then(async (url) => url ?? (await lastfmCover(artist, album).catch(() => null)));
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
  const appId = discordAppId(d.appId);
  const on = d.enabled;
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
  try {
    await invoke('discord_set', { appId, activity });
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
