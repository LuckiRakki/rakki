// Downloading: two songs at a time through iOS background transfers (they keep going when
// you switch apps). Downloads wait for Wi-Fi unless "Download using cellular" is on. After a
// restart, anything unfinished is queued again.
import { DownloadTask, File } from 'expo-file-system';
import { Alert } from 'react-native';

import type { BaseItem, JellyfinClient } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { onLikedChanged } from '@/lib/events';
import { ticksToSeconds } from '@/lib/format';
import { useNetwork } from '@/lib/network';
import { isOffline, useServerReachable } from '@/lib/online';
import { tracksOf } from '@/library/actions';
import { fetchLrc, fetchTtml } from '@/lyrics/fetch';
import { useSettings } from '@/settings/store';
import { showToast } from '@/ui/overlays';
import {
  artFile,
  audioFile,
  deleteAllFiles,
  deleteAudio,
  deleteQuietly,
  downloadsSupported,
  hasOldLayout,
  lyricsFile,
  moveFromOldLayout,
  musicPath,
  prepareAudioFile,
  removeOldLayout,
} from '@/downloads/files';
import {
  loadDownloads,
  persistDownloads,
  useDownloads,
  type CollectionKind,
  type DownloadedTrack,
} from '@/downloads/store';

const CONCURRENCY = 2;
const active = new Map<string, DownloadTask>();

function client(): JellyfinClient | null {
  return useAuth.getState().client;
}

/** Only what's needed to show and play the song offline. */
function slim(item: BaseItem): BaseItem {
  const { Overview: _o, BackdropImageTags: _b, GenreItems: _g, ...rest } = item;
  return rest;
}

function setTrack(id: string, patch: Partial<DownloadedTrack>) {
  useDownloads.setState((s) => {
    const t = s.tracks[id];
    return t ? { tracks: { ...s.tracks, [id]: { ...t, ...patch } } } : {};
  });
  persistDownloads();
}

function setProgress(id: string, fraction: number | null) {
  useDownloads.setState((s) => {
    const progress = { ...s.progress };
    if (fraction === null) delete progress[id];
    else progress[id] = fraction;
    return { progress };
  });
}

function allowedNow(): boolean {
  const { cellular } = useNetwork.getState();
  return !isOffline() && (!cellular || useSettings.getState().downloadOnCellular);
}

/** Start queued downloads while there's room and the connection allows it. */
export function kick() {
  const c = client();
  if (!downloadsSupported || !c || !allowedNow()) return;
  const queued = Object.entries(useDownloads.getState().tracks).filter(([id, t]) => t.state === 'queued' && !active.has(id));
  for (const [id] of queued) {
    if (active.size >= CONCURRENCY) break;
    void downloadTrack(c, id);
  }
}

/** Files already used by other songs (so two songs never get the same name). */
function takenPaths(exceptId?: string): Set<string> {
  const taken = new Set<string>();
  for (const [id, t] of Object.entries(useDownloads.getState().tracks)) if (id !== exceptId && t.file) taken.add(t.file);
  return taken;
}

async function downloadTrack(c: JellyfinClient, id: string) {
  const track = useDownloads.getState().tracks[id];
  if (!track) return;
  const src = c.downloadSource(track.item, useSettings.getState().downloadQuality);
  const path = musicPath(track.item, src.ext, takenPaths(id));
  const file = prepareAudioFile(path);
  deleteQuietly(file);
  // Converted files don't announce their size, so estimate it from the bitrate.
  const estimate = src.kbps ? src.kbps * 125 * ticksToSeconds(track.item.RunTimeTicks) : 0;
  let lastPct = -1;
  const task = new DownloadTask(src.url, file, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      const total = totalBytes > 0 ? totalBytes : estimate;
      const fraction = total > 0 ? Math.min(0.99, bytesWritten / total) : 0;
      const pct = Math.floor(fraction * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        setProgress(id, fraction);
      }
    },
  });
  active.set(id, task);
  setTrack(id, { state: 'downloading', error: undefined });
  try {
    const result = await task.downloadAsync();
    if (!result) return; // paused
    if (!useDownloads.getState().tracks[id]) {
      deleteAudio(path); // removed while downloading
      return;
    }
    setTrack(id, { state: 'done', file: path, bytes: file.size ?? 0, kbps: src.kbps });
    const lyrics = await saveLyrics(c, id);
    if (lyrics) setTrack(id, { lyrics: true });
  } catch (e) {
    if (useDownloads.getState().tracks[id]) {
      setTrack(id, { state: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  } finally {
    active.delete(id);
    setProgress(id, null);
    kick();
  }
}

/**
 * Keep lyrics that came from your own files (TTML sidecars via the Rakki plugin, or Jellyfin's
 * lyrics). Lyrics from the Spicy Lyrics API are never stored on the phone (its terms).
 */
async function saveLyrics(c: JellyfinClient, id: string): Promise<boolean> {
  const [ttml, lrc] = await Promise.all([fetchTtml(c, id), fetchLrc(c, id)]);
  const ownTtml = ttml && !ttml.source ? ttml : null;
  if (!ownTtml && !lrc) return false;
  try {
    const file = lyricsFile(id);
    if (!file.exists) file.create();
    file.write(JSON.stringify({ ttml: ownTtml, lrc }));
    return true;
  } catch {
    return false;
  }
}

async function saveArt(c: JellyfinClient, item: BaseItem) {
  if (useDownloads.getState().art[item.Id]) return;
  const url = c.imageUrl(item, 800);
  if (!url) return;
  try {
    await File.downloadFileAsync(url, artFile(item.Id), { idempotent: true });
    useDownloads.setState((s) => ({ art: { ...s.art, [item.Id]: true } }));
    persistDownloads();
  } catch {
    // No art offline for this one; the placeholder is shown instead.
  }
}

async function collectionTracks(c: JellyfinClient, kind: CollectionKind, item: BaseItem): Promise<BaseItem[]> {
  if (kind === 'liked') return (await c.getFavoriteTracks()).Items;
  return tracksOf(item);
}

/** Download an album, playlist, Liked Songs or a single song. */
export async function downloadCollection(kind: CollectionKind, item: BaseItem) {
  const c = client();
  if (!c) return;
  if (!downloadsSupported) {
    showToast('Downloads work in the iPhone app');
    return;
  }
  const id = kind === 'song' ? `song:${item.Id}` : kind === 'liked' ? 'liked' : item.Id;
  let tracks: BaseItem[];
  try {
    tracks = await collectionTracks(c, kind, item);
  } catch {
    showToast('Couldn’t reach your server to download that');
    return;
  }
  if (!tracks.length) return;
  addCollection(id, kind, item, tracks);
  const { cellular } = useNetwork.getState();
  showToast(
    cellular && !useSettings.getState().downloadOnCellular
      ? 'Waiting for Wi-Fi to download'
      : `Downloading ${tracks.length === 1 ? `“${tracks[0].Name}”` : `${tracks.length} songs`}`,
  );
  if (kind !== 'song' && kind !== 'liked') void saveArt(c, item);
  const albums = new Map<string, BaseItem>();
  for (const t of tracks) {
    if (t.AlbumId && t.AlbumPrimaryImageTag && !albums.has(t.AlbumId)) {
      albums.set(t.AlbumId, { Id: t.AlbumId, Name: t.Album ?? '', Type: 'MusicAlbum', ImageTags: { Primary: t.AlbumPrimaryImageTag } });
    }
  }
  for (const album of albums.values()) void saveArt(c, album);
  kick();
}

function addCollection(id: string, kind: CollectionKind, item: BaseItem, tracks: BaseItem[]) {
  useDownloads.setState((s) => {
    const next = { ...s.tracks };
    for (const t of tracks) {
      const existing = next[t.Id];
      if (!existing) next[t.Id] = { item: slim(t), state: 'queued' };
      else if (existing.state === 'error') next[t.Id] = { ...existing, state: 'queued', error: undefined };
    }
    const collection = {
      id,
      kind,
      item: slim(item),
      trackIds: tracks.map((t) => t.Id),
      addedAt: s.collections[id]?.addedAt ?? Date.now(),
    };
    return { tracks: next, collections: { ...s.collections, [id]: collection } };
  });
  persistDownloads();
}

/** Remove a download. Songs still needed by another download stay. */
export function removeCollection(id: string) {
  useDownloads.setState((s) => {
    const collections = { ...s.collections };
    delete collections[id];
    return { collections };
  });
  collectGarbage();
}

/** Delete songs and art that no download needs any more. */
function collectGarbage() {
  const { tracks, collections, art } = useDownloads.getState();
  const needed = new Set<string>();
  const neededArt = new Set<string>();
  for (const c of Object.values(collections)) {
    neededArt.add(c.item.Id);
    for (const id of c.trackIds) needed.add(id);
  }
  const keptTracks: typeof tracks = {};
  for (const [id, t] of Object.entries(tracks)) {
    if (needed.has(id)) {
      keptTracks[id] = t;
      if (t.item.AlbumId) neededArt.add(t.item.AlbumId);
      continue;
    }
    active.get(id)?.cancel();
    active.delete(id);
    if (downloadsSupported) {
      if (t.file) deleteAudio(t.file);
      deleteQuietly(lyricsFile(id));
    }
  }
  const keptArt: typeof art = {};
  for (const id of Object.keys(art)) {
    if (neededArt.has(id)) keptArt[id] = true;
    else if (downloadsSupported) deleteQuietly(artFile(id));
  }
  useDownloads.setState({ tracks: keptTracks, art: keptArt });
  persistDownloads();
  kick();
}

export function confirmRemove(id: string, name: string) {
  Alert.alert('Remove download?', `“${name}” will no longer be available offline.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => removeCollection(id) },
  ]);
}

export function removeAllDownloads() {
  for (const task of active.values()) task.cancel();
  active.clear();
  deleteAllFiles();
  useDownloads.setState({ tracks: {}, collections: {}, art: {}, progress: {} });
  persistDownloads();
}

/** Try failed songs again. */
export function retryFailed() {
  useDownloads.setState((s) => {
    const tracks = { ...s.tracks };
    for (const [id, t] of Object.entries(tracks)) if (t.state === 'error') tracks[id] = { ...t, state: 'queued', error: undefined };
    return { tracks };
  });
  persistDownloads();
  kick();
}

/**
 * Playlists and Liked Songs change: download what was added, drop what was removed.
 * Albums are fixed.
 */
export async function syncCollections() {
  const c = client();
  if (!c || !downloadsSupported) return;
  for (const col of Object.values(useDownloads.getState().collections)) {
    if (col.kind !== 'playlist' && col.kind !== 'liked') continue;
    try {
      const tracks = await collectionTracks(c, col.kind, col.item);
      const before = col.trackIds.join();
      if (tracks.map((t) => t.Id).join() !== before) addCollection(col.id, col.kind, col.item, tracks);
    } catch {
      return; // offline: try next time
    }
  }
  collectGarbage();
}

/** After sign-in / launch: load, re-queue anything unfinished, catch up on changes. */
/**
 * Update 16 saved songs as downloads/<id>.<ext>, with art and lyrics beside them. Move them to
 * Music/<Artist>/<Album>/… and .rakki/; anything that can't be moved is downloaded again.
 */
function migrateOldLayout() {
  if (!hasOldLayout()) return;
  const { tracks, art } = useDownloads.getState();
  const nextTracks = { ...tracks };
  const taken = takenPaths();
  for (const [id, t] of Object.entries(tracks)) {
    if (!t.file || t.file.includes('/')) continue;
    const ext = t.file.split('.').pop() ?? 'audio';
    const path = musicPath(t.item, ext, taken);
    const moved = t.state === 'done' && moveFromOldLayout([t.file], prepareAudioFile(path));
    if (moved) taken.add(path);
    const lyrics = !!t.lyrics && moveFromOldLayout(['lyrics', `${id}.json`], lyricsFile(id));
    nextTracks[id] = moved ? { ...t, file: path, lyrics } : { ...t, state: 'queued', file: undefined, lyrics: false };
  }
  const nextArt: typeof art = {};
  for (const id of Object.keys(art)) if (moveFromOldLayout(['art', `${id}.jpg`], artFile(id))) nextArt[id] = true;
  useDownloads.setState({ tracks: nextTracks, art: nextArt });
  persistDownloads();
  removeOldLayout();
}

export function startDownloads(userId: string) {
  if (!downloadsSupported) return;
  loadDownloads(userId);
  migrateOldLayout();
  useDownloads.setState((s) => {
    const tracks = { ...s.tracks };
    for (const [id, t] of Object.entries(tracks)) {
      const missing = t.state === 'done' && (!t.file || !audioFile(t.file).exists);
      if (t.state === 'downloading' || missing) tracks[id] = { ...t, state: 'queued' };
    }
    return { tracks };
  });
  kick();
  void syncCollections();
}

// Liked or unliked a song while Liked Songs is downloaded: follow along.
let likedTimer: ReturnType<typeof setTimeout> | null = null;
onLikedChanged(() => {
  if (!useDownloads.getState().collections.liked) return;
  if (likedTimer) clearTimeout(likedTimer);
  likedTimer = setTimeout(() => void syncCollections(), 1500);
});

// Connection, server or settings changed: maybe downloads can go now (and catch up on
// playlist changes once the server is back).
useNetwork.subscribe(() => kick());
useServerReachable.subscribe((s, prev) => {
  if (s.reachable && !prev.reachable) {
    kick();
    void syncCollections();
  }
});
useSettings.subscribe((s, prev) => {
  if (s.downloadOnCellular !== prev.downloadOnCellular) kick();
  if (prev.offlineMode && !s.offlineMode) kick();
});
