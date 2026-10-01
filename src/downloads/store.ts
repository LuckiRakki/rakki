// What's downloaded. A "collection" is what you chose to download (an album, a playlist, Liked
// Songs, or a single song); tracks can belong to several collections and their files are kept
// until no collection needs them. Saved per server user in the key-value store; live progress
// is kept in memory only.
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { readPref, writePref } from '@/lib/prefs';
import { artFile, audioFile, downloadsSupported } from '@/downloads/files';

export type TrackState = 'queued' | 'downloading' | 'done' | 'error';
export type CollectionKind = 'album' | 'playlist' | 'liked' | 'song';

export interface DownloadedTrack {
  item: BaseItem;
  state: TrackState;
  /** File name in Documents/downloads, once done. */
  file?: string;
  bytes?: number;
  /** AAC bitrate it was converted to; null = the original file. */
  kbps?: number | null;
  /** Lyrics saved next to it (our own sidecars and Jellyfin's lyrics only, never API lyrics). */
  lyrics?: boolean;
  error?: string;
}

export interface DownloadedCollection {
  id: string;
  kind: CollectionKind;
  item: BaseItem;
  trackIds: string[];
  addedAt: number;
}

interface Saved {
  tracks: Record<string, DownloadedTrack>;
  collections: Record<string, DownloadedCollection>;
  /** Item ids (albums, playlists) whose cover art is saved. */
  art: Record<string, true>;
}

interface DownloadsState extends Saved {
  userId: string | null;
  /** Bumped whenever what's downloaded changes (offline views refresh on it). */
  rev: number;
  /** 0–1 for downloads in progress. */
  progress: Record<string, number>;
}

export const useDownloads = create<DownloadsState>(() => ({
  userId: null,
  rev: 0,
  tracks: {},
  collections: {},
  art: {},
  progress: {},
}));

const keyFor = (userId: string) => `rakki.downloads.${userId}`;

/** Load the saved downloads for this user (once per sign-in). */
export function loadDownloads(userId: string) {
  if (useDownloads.getState().userId === userId) return;
  let saved: Saved = { tracks: {}, collections: {}, art: {} };
  try {
    const raw = JSON.parse(readPref(keyFor(userId)) ?? 'null') as (Saved & { v?: number }) | null;
    if (raw?.v === 1) saved = { tracks: raw.tracks ?? {}, collections: raw.collections ?? {}, art: raw.art ?? {} };
  } catch {
    // Unreadable: start empty (files are re-downloaded on demand).
  }
  useDownloads.setState({ userId, ...saved, progress: {} });
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Save soon (batched: a big album finishes many songs in a row). */
export function persistDownloads() {
  useDownloads.setState((s) => ({ rev: s.rev + 1 }));
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const { userId, tracks, collections, art } = useDownloads.getState();
    if (userId) writePref(keyFor(userId), JSON.stringify({ v: 1, tracks, collections, art }));
  }, 800);
}

// ---- Reading downloads (used by playback, artwork and lyrics) ----

/** file:// URI of a downloaded song, or null. */
export function localAudioUri(itemId: string): string | null {
  if (!downloadsSupported) return null;
  const t = useDownloads.getState().tracks[itemId];
  return t?.state === 'done' && t.file ? audioFile(t.file).uri : null;
}

/** file:// URI of saved cover art for an album or playlist, or null. */
export function localArtUri(itemId: string | undefined): string | null {
  if (!downloadsSupported || !itemId) return null;
  return useDownloads.getState().art[itemId] ? artFile(itemId).uri : null;
}

/** The song's download state, if it's part of any download. */
export function useTrackDownload(itemId: string | undefined): TrackState | undefined {
  return useDownloads((s) => (itemId ? s.tracks[itemId]?.state : undefined));
}

export interface CollectionStatus {
  state: 'none' | 'downloading' | 'done' | 'error';
  done: number;
  total: number;
  /** 0–1 over the whole collection, counting partial progress. */
  fraction: number;
}

function statusOf(s: DownloadsState, collectionId: string): CollectionStatus {
  const c = s.collections[collectionId];
  if (!c) return { state: 'none', done: 0, total: 0, fraction: 0 };
  let done = 0;
  let partial = 0;
  let failed = 0;
  for (const id of c.trackIds) {
    const t = s.tracks[id];
    if (t?.state === 'done') done++;
    else if (t?.state === 'error') failed++;
    else partial += s.progress[id] ?? 0;
  }
  const total = c.trackIds.length;
  const state = done === total ? 'done' : failed > 0 && done + failed === total ? 'error' : 'downloading';
  return { state, done, total, fraction: total ? (done + partial) / total : 1 };
}

/** How far along a downloaded album / playlist / Liked Songs / single song is. */
export function useCollectionStatus(collectionId: string): CollectionStatus {
  const state = useDownloads((s) => {
    const st = statusOf(s, collectionId);
    // A string key keeps re-renders to real changes (progress rounded to whole percents).
    return `${st.state}|${st.done}|${st.total}|${Math.floor(st.fraction * 100)}`;
  });
  const [s, done, total, pct] = state.split('|');
  return { state: s as CollectionStatus['state'], done: +done, total: +total, fraction: +pct / 100 };
}

/** Collection id for an item: albums and playlists by id, single songs as "song:<id>". */
export function collectionIdFor(item: BaseItem): string {
  return item.Type === 'Audio' ? `song:${item.Id}` : item.Id;
}

// Web dev preview only: lets tests show download states (downloads themselves need the phone).
if (__DEV__ && typeof window !== 'undefined') {
  (globalThis as { __rakkiDownloads?: typeof useDownloads }).__rakkiDownloads = useDownloads;
}
