// Discord's "Listening to ..." (src-tauri/src/discord.rs talks to the Discord app). On while
// playing, with the song, artists, album and a time bar. Paused, it either says so (the song
// without the time bar, a pause badge on the cover) or clears, as Settings says; a pause of
// more than 15 minutes clears it either way, and so does stopping.
// Updates only when the song changes, playback pauses or resumes, or you seek (Discord allows
// about five updates in 20 seconds).
//
// Discord shows pictures only from public addresses its servers download (the local connection
// takes no images, and your own server is private), so the cover comes from Apple's public
// iTunes search by artist and album, else Last.fm (with your key), else the application's own
// "rakki" picture if you uploaded one in Discord's developer portal. Only while this is on.
//
// Two buttons under it (Settings can turn each off): Listen opens the song for whoever clicks
// it (song.link by the song's Apple Music id, which lists every service; else a Spotify search),
// and Rakki on GitHub opens the app's page. Discord hides buttons on your own profile; others see
// them.
import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { useSettings } from '@/settings/store';
import { inTauri } from '~/lib/tauri';
import { positionNow } from '@/remote/devices';
import { useRemote } from '~/player/remote';
import { currentPosition, usePlayer } from '~/player/store';
import { kv } from '~/lib/kv';

const KEY = 'rakki.discord';

/** Rakki's own Discord application ("Listening to Rakki"); Settings can name another. */
export const RAKKI_DISCORD_APP = '1559411115925180416';
const validId = (id: string) => /^\d{15,22}$/.test(id);
/** The application in use: yours if you set one, else Rakki's. */
export const discordAppId = (appId: string) => (validId(appId.trim()) ? appId.trim() : RAKKI_DISCORD_APP);

/** Rakki's GitHub page (the Rakki button). */
export const RAKKI_GITHUB = 'https://github.com/LuckiRakki/rakki';
/** The buttons' words, as your friends see them. */
export const SONG_BUTTON_LABEL = 'Listen';
export const GITHUB_BUTTON_LABEL = 'Rakki on GitHub';
/** The pause badge on the cover while paused (public, so Discord's servers can fetch it). */
const PAUSED_BADGE = 'https://raw.githubusercontent.com/LuckiRakki/rakki/main/docs/images/discord-paused.png';
/** A pause longer than this clears the status even when it shows pauses. */
const PAUSE_CLEARS_MS = 15 * 60_000;

interface DiscordPrefs {
  enabled: boolean;
  appId: string;
  /** A Listen button with a link to the song. */
  songButton: boolean;
  /** A Rakki button with a link to Rakki's GitHub. */
  githubButton: boolean;
  /** Paused: show the song as paused, or clear the status. */
  whenPaused: 'show' | 'clear';
}

const DEFAULTS: DiscordPrefs = { enabled: false, appId: '', songButton: true, githubButton: true, whenPaused: 'show' };

function load(): DiscordPrefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(kv.getItem(KEY) ?? '{}') as Partial<DiscordPrefs>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const useDiscord = create<DiscordPrefs & { error: string | null; connected: boolean; set(p: Partial<DiscordPrefs>): void }>((set, get) => ({
  ...load(),
  error: null,
  /** Discord answered the last update (it's running and took the application). */
  connected: false,
  set(p) {
    const { enabled, appId, songButton, githubButton, whenPaused } = get();
    const next = { enabled, appId, songButton, githubButton, whenPaused, ...p };
    kv.setItem(KEY, JSON.stringify(next));
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

const links = new Map<string, Promise<string>>();

/**
 * A public link to the song for the Listen button: song.link by its Apple Music id (one page
 * with every service on it), else a Spotify search for it.
 */
function songLink(item: BaseItem): Promise<string> {
  const artist = item.Artists?.[0] ?? item.AlbumArtist ?? '';
  const key = `${artist}|${item.Name}`.toLowerCase();
  let found = links.get(key);
  if (!found) {
    const term = encodeURIComponent(`${artist} ${item.Name}`.slice(0, 120));
    const search = `https://open.spotify.com/search/${term}`;
    found = fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=1`)
      .then((r) => r.json() as Promise<{ results?: { trackId?: number }[] }>)
      .then((j) => {
        const id = j.results?.[0]?.trackId;
        return id ? `https://song.link/i/${id}` : search;
      })
      .catch(() => search);
    links.set(key, found);
  }
  return found;
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
/** When playback paused (0 while playing, and before anything has played since Rakki opened). */
let pausedAt = 0;
let played = false;

async function sync(force = false) {
  if (!inTauri) return;
  const d = useDiscord.getState();
  const local = usePlayer.getState();
  // Controlling another device: that's what you're listening to.
  const t = useRemote.getState().target;
  const p = t?.item
    ? { queue: [t.item], index: 0, playing: !t.paused, duration: (t.item.RunTimeTicks ?? 0) / 10_000_000, position: positionNow(t), positionAt: performance.now() }
    : local;
  const item = p.queue[p.index];
  const appId = discordAppId(d.appId);
  const on = d.enabled;
  if (p.playing) [pausedAt, played] = [0, true];
  else if (!pausedAt && played) pausedAt = Date.now();
  const paused = !p.playing;
  const show = on && item && (p.playing || (d.whenPaused === 'show' && pausedAt > 0 && Date.now() - pausedAt < PAUSE_CLEARS_MS));
  // What would be shown, to skip repeats (the time bar is checked separately below).
  const what = show ? `${item.Id}|${paused ? 'paused' : Math.round(t?.item ? positionNow(t) : currentPosition(local))}` : 'off';
  if (!force && what === last) return;
  if (!on && last === 'off') return;
  last = what;

  let activity: Record<string, unknown> | null = null;
  if (show) {
    const start = Date.now() - (t?.item ? positionNow(t) : currentPosition(local)) * 1000;
    const [cover, link] = await Promise.all([coverFor(item), d.songButton ? songLink(item) : null]);
    const buttons = [
      ...(link ? [{ label: SONG_BUTTON_LABEL, url: link }] : []),
      ...(d.githubButton ? [{ label: GITHUB_BUTTON_LABEL, url: RAKKI_GITHUB }] : []),
    ];
    activity = {
      type: 2, // Listening
      details: text(item.Name),
      state: text(item.Artists?.join(', ') || item.AlbumArtist || 'Unknown artist'),
      // Paused: no time bar (Discord would keep it running).
      ...(paused ? {} : { timestamps: p.duration > 0 ? { start: Math.round(start), end: Math.round(start + p.duration * 1000) } : { start: Math.round(start) } }),
      assets: {
        large_image: cover ?? 'rakki',
        large_text: text(item.Album ?? 'Rakki'),
        ...(paused ? { small_image: PAUSED_BADGE, small_text: 'Paused' } : {}),
      },
      ...(buttons.length ? { buttons } : {}),
    };
  }
  try {
    await invoke('discord_set', { appId, activity });
    useDiscord.setState({ error: null, connected: on });
  } catch (e) {
    useDiscord.setState({ error: String(e), connected: false });
  }
}

let started = false;

/** Follow the player (main.tsx, once). */
export function startDiscord() {
  if (started || !inTauri) return;
  started = true;
  let lastExpected = 0;
  useRemote.subscribe((s, prev) => {
    const a = s.target, b = prev.target;
    if (a?.sessionId !== b?.sessionId || a?.item?.Id !== b?.item?.Id || a?.paused !== b?.paused) void sync(true);
  });
  usePlayer.subscribe((s, prev) => {
    const changed = s.queue[s.index]?.Id !== prev.queue[prev.index]?.Id || s.playing !== prev.playing;
    // A seek: the position moved away from where time alone would put it.
    const pos = currentPosition(s);
    const seeked = s.position !== prev.position && Math.abs(pos - lastExpected) > 3;
    lastExpected = pos;
    if (changed || seeked) void sync(true);
  });
  // Keep the expected position moving, and clear a long pause, every 15 seconds.
  setInterval(() => {
    lastExpected = currentPosition(usePlayer.getState());
    if (pausedAt && last !== 'off' && Date.now() - pausedAt >= PAUSE_CLEARS_MS) void sync(true);
  }, 15_000);
  void sync(true);
}
