// Internet radio on the desktop, with the phone app's station list code (radio/stations.ts:
// add by address, SUB/WAVE recognised) and SUB/WAVE's now-playing (radio/subwave.ts). A
// station plays as a one-item queue: a BaseItem whose Radio field holds the stream (as on the
// phone). While a SUB/WAVE station plays, what's on air is asked every 15 seconds and shown
// as the "song" (title, artist, cover), with the station as the album.
import type { BaseItem } from '@/api/jellyfin';
import { useStations, type Station } from '@/radio/stations';
import { fetchOnAir, type OnAir } from '@/radio/subwave';
import { usePlayer } from '~/player/store';

const ON_AIR_EVERY_MS = 15_000;

export function stationItem(st: Station, onAir?: OnAir): BaseItem {
  const live = onAir?.title ? onAir : undefined;
  return {
    Id: `radio:${st.id}`,
    Name: live?.title || st.name,
    Type: 'Audio',
    Artists: live?.artist ? [live.artist] : ['Radio'],
    Album: st.name,
    Radio: { stationId: st.id, streamUrl: st.streamUrl, coverUrl: live?.coverUrl },
  };
}

export function playStation(st: Station) {
  useStations.getState().markPlayed(st.id);
  usePlayer.getState().playQueue([stationItem(st)], 0, { shuffle: false });
}

let timer: ReturnType<typeof setInterval> | null = null;
let watching: string | null = null;

async function refreshOnAir(st: Station) {
  if (!st.apiBase) return;
  try {
    const onAir = await fetchOnAir(st.apiBase);
    const s = usePlayer.getState();
    const now = s.queue[s.index];
    if (now?.Radio?.stationId !== st.id) return;
    const next = stationItem(st, onAir);
    if (next.Name === now.Name && next.Radio?.coverUrl === now.Radio?.coverUrl) return;
    usePlayer.setState({ queue: s.queue.map((x, i) => (i === s.index ? next : x)) });
  } catch {
    // The station's API didn't answer: keep what's shown.
  }
}

/** Follow the player: poll what's on air while a SUB/WAVE station plays (main.tsx, once). */
export function startRadioWatch() {
  usePlayer.subscribe((s) => {
    const id = s.playing ? (s.queue[s.index]?.Radio?.stationId ?? null) : null;
    if (id === watching) return;
    watching = id;
    if (timer) clearInterval(timer);
    timer = null;
    const st = id ? useStations.getState().stations.find((x) => x.id === id) : undefined;
    if (!st?.apiBase) return;
    void refreshOnAir(st);
    timer = setInterval(() => void refreshOnAir(st), ON_AIR_EVERY_MS);
  });
}
