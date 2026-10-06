// Live info for SUB/WAVE stations. The station that's playing is asked what's on air every
// 10 s, and the song, artist and cover go into the player and the lock screen. Station cards
// (Library, Home) refresh theirs every 20 s while they're on screen.
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { updateRadioNowPlaying, usePlayer } from '@/player/store';
import { useStations, type Station } from '@/radio/stations';
import { fetchOnAir, fetchRecentlyAired, type OnAir } from '@/radio/subwave';

const POLL_MS = 10_000;
const CARD_MS = 20_000;

export const useOnAir = create<{ byStation: Record<string, OnAir> }>(() => ({ byStation: {} }));

function keep(stationId: string, info: OnAir) {
  useOnAir.setState((s) => ({ byStation: { ...s.byStation, [stationId]: info } }));
}

let timer: ReturnType<typeof setInterval> | null = null;
let polling: string | null = null;

async function poll(stationId: string) {
  const station = useStations.getState().stations.find((s) => s.id === stationId);
  if (!station?.apiBase) return;
  try {
    const info = await fetchOnAir(station.apiBase);
    keep(stationId, info);
    updateRadioNowPlaying(stationId, info);
  } catch {
    // Try again next round.
  }
}

/** The station in the player, if a station is on. */
export function playingStationId(): string | null {
  const s = usePlayer.getState();
  return s.queue[s.index]?.item.Radio?.stationId ?? null;
}

function follow() {
  const id = playingStationId();
  if (id === polling) return;
  if (timer) clearInterval(timer);
  timer = null;
  polling = id;
  if (!id) return;
  void poll(id);
  timer = setInterval(() => void poll(id), POLL_MS);
}

let started = false;

/** Start following the playing station (once, at launch). */
export function watchRadio() {
  if (started) return;
  started = true;
  usePlayer.subscribe((s, prev) => {
    if (s.queue !== prev.queue || s.index !== prev.index) follow();
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active' && polling) void poll(polling);
  });
  follow();
}

/** What a station has on air, kept fresh while the card is on screen. */
export function useStationOnAir(station: Station): OnAir | undefined {
  const info = useOnAir((s) => s.byStation[station.id]);
  const { id, apiBase } = station;
  useEffect(() => {
    if (!apiBase) return;
    let alive = true;
    // The playing station is already being followed every 10 s.
    const load = () => {
      if (polling === id) return;
      fetchOnAir(apiBase)
        .then((i) => alive && keep(id, i))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, CARD_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, apiBase]);
  return info;
}

/** The songs a SUB/WAVE station played before this one. */
export function useRecentlyAired(station: Station | undefined) {
  const apiBase = station?.apiBase ?? '';
  return useQuery({
    queryKey: ['radioAired', station?.id],
    enabled: !!apiBase,
    refetchInterval: 30_000,
    queryFn: () => fetchRecentlyAired(apiBase),
  });
}
