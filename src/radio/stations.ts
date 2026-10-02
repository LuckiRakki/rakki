// Radio stations: internet radio streams you add by address (like Feishin's radio list).
// SUB/WAVE stations are recognised from their address and get live now-playing, the DJ and
// song requests (subwave.ts). Saved on the phone, for every account.
import { create } from 'zustand';

import { readPref, writePref } from '@/lib/prefs';
import { deleteStationImage } from '@/radio/stationImage';

export interface Station {
  id: string;
  name: string;
  /** The audio stream (MP3/AAC/HLS). */
  streamUrl: string;
  /** SUB/WAVE's API ("https://host/api"); missing for plain streams. */
  apiBase?: string;
  /** Your own picture for the station: its file name (stationImage.ts). */
  image?: string;
  /** The station's website ("Open website"). SUB/WAVE stations default to their address. */
  website?: string;
  addedAt: number;
  lastPlayedAt?: number;
}

/** Where "Open website" goes: the one you set, else a SUB/WAVE station's own page. */
export function stationWebsite(station: Station): string | undefined {
  return station.website || station.apiBase?.replace(/\/api\/?$/, '') || undefined;
}

/**
 * Home's order: SUB/WAVE stations first, then the most recently played (never-played ones by
 * when they were added).
 */
export function homeOrder(stations: Station[]): Station[] {
  const when = (s: Station) => s.lastPlayedAt ?? s.addedAt;
  return [...stations].sort((a, b) => Number(!!b.apiBase) - Number(!!a.apiBase) || when(b) - when(a));
}

const KEY = 'rakki.radioStations';
const TIMEOUT_MS = 8000;

function load(): Station[] {
  try {
    const list = JSON.parse(readPref(KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

interface StationsState {
  stations: Station[];
  add(station: Omit<Station, 'id' | 'addedAt'>): Station;
  update(id: string, patch: Partial<Pick<Station, 'name' | 'image' | 'website'>>): void;
  markPlayed(id: string): void;
  remove(id: string): void;
}

export const useStations = create<StationsState>((set, get) => ({
  stations: load(),
  add(station) {
    const existing = get().stations.find((s) => s.streamUrl === station.streamUrl);
    if (existing) return existing;
    const added: Station = { ...station, id: Date.now().toString(36), addedAt: Date.now() };
    const stations = [...get().stations, added];
    writePref(KEY, JSON.stringify(stations));
    set({ stations });
    return added;
  },
  update(id, patch) {
    const stations = get().stations.map((s) => (s.id === id ? { ...s, ...patch } : s));
    writePref(KEY, JSON.stringify(stations));
    set({ stations });
  },
  markPlayed(id) {
    const stations = get().stations.map((s) => (s.id === id ? { ...s, lastPlayedAt: Date.now() } : s));
    writePref(KEY, JSON.stringify(stations));
    set({ stations });
  },
  remove(id) {
    deleteStationImage(get().stations.find((s) => s.id === id)?.image);
    const stations = get().stations.filter((s) => s.id !== id);
    writePref(KEY, JSON.stringify(stations));
    set({ stations });
  },
}));

async function fetchText(url: string): Promise<{ ok: boolean; type: string; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const type = res.headers.get('content-type') ?? '';
    // A live stream never ends: read only the small text answers (JSON, .pls, .m3u), not audio.
    if (/^audio\/(mpeg|mp3|aac|aacp|ogg|opus|flac|wav)\b/.test(type) || type.startsWith('application/octet-stream')) {
      controller.abort();
      return { ok: res.ok, type, text: '' };
    }
    return { ok: res.ok, type, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

/** The first stream address in a .pls or .m3u playlist, and its title if it has one. */
function fromPlaylist(text: string): { url: string; title?: string } | null {
  const pls = text.match(/^File1=(.+)$/im);
  if (pls) return { url: pls[1].trim(), title: text.match(/^Title1=(.+)$/im)?.[1].trim() };
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const url = lines.find((l) => /^https?:\/\//i.test(l));
  if (!url) return null;
  const info = lines.find((l) => l.startsWith('#EXTINF'));
  return { url, title: info?.replace(/^#EXTINF:[^,]*,/, '').trim() || undefined };
}

/**
 * Work out a station from what was pasted: a SUB/WAVE address (its name, stream and API are
 * found on its own), a .pls/.m3u playlist link, or a plain stream URL.
 */
export async function resolveStation(input: string): Promise<Omit<Station, 'id' | 'addedAt'>> {
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('That doesn’t look like an address.');
  }
  const origin = url.origin;
  const path = url.pathname.replace(/\/+$/, '');

  // SUB/WAVE: the station answers /api/state with its name.
  try {
    const state = await fetchText(`${origin}/api/state`);
    if (state.ok && state.text.trim().startsWith('{')) {
      const json = JSON.parse(state.text) as { station?: { name?: string }; current?: unknown };
      if (json.station || json.current !== undefined) {
        const streamUrl = /\.(mp3|aac|m3u8)$/i.test(path) ? `${origin}${path}` : `${origin}/stream.mp3`;
        return { name: json.station?.name?.trim() || url.hostname, streamUrl, apiBase: `${origin}/api` };
      }
    }
  } catch {
    // Not SUB/WAVE (or not reachable that way): try it as a plain stream.
  }

  if (/\.(pls|m3u)$/i.test(path)) {
    const playlist = await fetchText(url.toString()).catch(() => null);
    const entry = playlist?.text ? fromPlaylist(playlist.text) : null;
    if (!entry) throw new Error('Couldn’t read that playlist.');
    return { name: entry.title || url.hostname, streamUrl: entry.url };
  }
  return { name: url.hostname, streamUrl: url.toString() };
}
