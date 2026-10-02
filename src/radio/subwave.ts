// SUB/WAVE's station API (the same one its own apps use): what's on air, the show and DJ,
// what played before, and song requests. No sign-in for an open station.
const TIMEOUT_MS = 8000;

export interface OnAir {
  title: string;
  artist: string;
  album?: string;
  /** SUB/WAVE's id for the song (its Navidrome id). */
  songId?: string;
  /** When the song started on the station (ms), for following its lyrics. */
  startedAtMs?: number;
  coverUrl?: string;
  show?: string;
  dj?: string;
  djAvatarUrl?: string;
  station?: string;
}

export interface AiredSong {
  title: string;
  artist: string;
  songId?: string;
  coverUrl?: string;
  startedAt?: string;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`Station error ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const cover = (apiBase: string, songId?: string) => (songId ? `${apiBase}/cover/${encodeURIComponent(songId)}` : undefined);

/** What's playing now, with the show and DJ. */
export async function fetchOnAir(apiBase: string): Promise<OnAir> {
  const json = await getJson<{
    nowPlaying?: { title?: string; artist?: string; album?: string; subsonic_id?: string; timestamp?: number };
    dj?: { name?: string; avatar?: string; station?: string };
    activeShow?: { name?: string; persona?: { name?: string; avatar?: string } };
  }>(`${apiBase}/now-playing`);
  const np = json.nowPlaying ?? {};
  const avatar = json.activeShow?.persona?.avatar ?? json.dj?.avatar;
  return {
    title: np.title ?? '',
    artist: np.artist ?? '',
    album: np.album,
    songId: np.subsonic_id,
    startedAtMs: np.timestamp ? np.timestamp * 1000 : undefined,
    coverUrl: cover(apiBase, np.subsonic_id),
    show: json.activeShow?.name,
    dj: json.activeShow?.persona?.name ?? json.dj?.name,
    // Avatar paths are relative to the API ("/persona-avatar/…" → "/api/persona-avatar/…").
    djAvatarUrl: avatar ? (avatar.startsWith('http') ? avatar : `${apiBase}${avatar}`) : undefined,
    station: json.dj?.station,
  };
}

/** The songs that played before this one, newest first. */
export async function fetchRecentlyAired(apiBase: string, limit = 12): Promise<AiredSong[]> {
  const json = await getJson<{
    history?: { title?: string; artist?: string; subsonic_id?: string; startedAt?: string }[];
  }>(`${apiBase}/state`);
  return (json.history ?? []).slice(0, limit).map((h) => ({
    title: h.title ?? '',
    artist: h.artist ?? '',
    songId: h.subsonic_id,
    coverUrl: cover(apiBase, h.subsonic_id),
    startedAt: h.startedAt,
  }));
}

/** Ask the station's DJ for a song, in your own words ("something by Elliott Smith"). */
export async function requestSong(apiBase: string, text: string, name?: string): Promise<{ ok: boolean; message?: string }> {
  const json = await getJson<{ success?: boolean; error?: string; message?: string; reply?: string }>(`${apiBase}/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, name }),
  });
  return { ok: json.success !== false && !json.error, message: json.reply ?? json.message ?? json.error };
}
