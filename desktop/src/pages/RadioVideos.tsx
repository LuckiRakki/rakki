// Library → Radio and Library → Music videos.
// Radio: your internet radio stations (add one by its address: a stream, a .pls/.m3u link, or a
// SUB/WAVE station, which also shows what's on air). Music videos: the Music Videos library;
// each plays in Rakki's own video player (player/video.ts, player/VideoHost.tsx).
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, MonitorPlay, Play, Plus, Radio as RadioIcon, Search, Trash2 } from '~/ui/icons';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useMemo, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { homeOrder, resolveStation, stationWebsite, useStations, type Station } from '@/radio/stations';
import { fetchOnAir } from '@/radio/subwave';
import { useAuth } from '~/auth/session';
import { inTauri } from '~/lib/tauri';
import { playVideo } from '~/player/video';
import { playStation } from '~/radio/radio';
import { usePlayer } from '~/player/store';
import { openMenu, toast } from '~/ui/overlays';
import { activateOnKey } from '~/ui/keys';
import { Empty, QueryState } from '~/ui/states';

function StationCard({ st }: { st: Station }) {
  const playingId = usePlayer((s) => (s.playing ? s.queue[s.index]?.Radio?.stationId : null));
  const onAir = useQuery({
    queryKey: ['onAir', st.id],
    enabled: !!st.apiBase,
    refetchInterval: 30_000,
    queryFn: () => fetchOnAir(st.apiBase!),
  }).data;
  const site = stationWebsite(st);
  return (
    <div
      className={`station${playingId === st.id ? ' on' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Play ${st.name}`}
      onClick={() => playStation(st)}
      onKeyDown={activateOnKey(() => playStation(st))}
      onContextMenu={(e) =>
        openMenu(
          e,
          [
            { label: 'Play', icon: Play, run: () => playStation(st) },
            ...(site ? [{ label: 'Open website', icon: ExternalLink, run: () => void (inTauri ? openUrl(site) : window.open(site)) }] : []),
            { label: 'Remove station', icon: Trash2, danger: true, divider: true, run: () => useStations.getState().remove(st.id) },
          ],
          st.name,
        )
      }>
      <div className="station-art">{onAir?.coverUrl ? <img src={onAir.coverUrl} alt="" /> : <RadioIcon size={34} />}</div>
      <div className="t">
        <div className="name">{st.name}</div>
        <div className="sub">{onAir?.title ? `On air: ${onAir.title} · ${onAir.artist}` : st.apiBase ? 'SUB/WAVE station' : new URL(st.streamUrl).hostname}</div>
        {onAir?.show || onAir?.dj ? <div className="sub">{[onAir.show, onAir.dj].filter(Boolean).join(' with ')}</div> : null}
      </div>
    </div>
  );
}

export function Radio() {
  const stations = useStations((s) => s.stations);
  const [address, setAddress] = useState('');
  // The field clears at once; the station appears when its address is worked out, or the
  // address comes back with what went wrong.
  const add = async () => {
    const typed = address.trim();
    setAddress('');
    try {
      const st = useStations.getState().add(await resolveStation(typed));
      toast(`Added ${st.name}`);
    } catch (e) {
      setAddress((now) => now || typed);
      toast(`Couldn’t add that station: ${e instanceof Error ? e.message : 'check the address'}`);
    }
  };
  return (
    <div className="page">
      <h1>Radio</h1>
      <form
        className="row-form station-add"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}>
        <input className="field" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Add a station: its stream, a .pls or .m3u link, or a SUB/WAVE address" aria-label="Station address" spellCheck={false} />
        <button className="secondary small" disabled={!address.trim()}>
          <Plus size={16} /> Add
        </button>
      </form>
      {stations.length ? (
        <div className="stations">
          {homeOrder(stations).map((st) => (
            <StationCard key={st.id} st={st} />
          ))}
        </div>
      ) : (
        <Empty icon={RadioIcon} title="No stations yet" detail="Paste an internet radio address above. Stations live on this computer; the phone keeps its own list." />
      )}
    </div>
  );
}

export function Videos() {
  const client = useAuth((s) => s.client);
  const q = useQuery({ queryKey: ['musicVideos', client?.session.userId], enabled: !!client, queryFn: () => client!.getMusicVideos() });
  const [find, setFind] = useState('');
  const shown = useMemo(() => {
    const words = find.toLowerCase().split(/\s+/).filter(Boolean);
    return (q.data ?? []).filter((v) => words.every((w) => `${v.Name} ${v.Artists?.join(' ') ?? ''}`.toLowerCase().includes(w)));
  }, [q.data, find]);
  return (
    <div className="page">
      <div className="home-head">
        <h1>Music videos</h1>
        <label className="find">
          <Search size={15} />
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a video" aria-label="Find a video" />
        </label>
      </div>
      <QueryState
        q={q}
        what="music videos"
        empty={<Empty icon={MonitorPlay} title="No music videos yet" detail="Videos in a Music Videos library on your Jellyfin server show up here." />}
      />
      <div className="video-grid">
        {shown.map((v) => (
          <VideoCard key={v.Id} video={v} from={shown} />
        ))}
      </div>
    </div>
  );
}

export function VideoCard({ video, from }: { video: BaseItem; from?: BaseItem[] }) {
  const client = useAuth((s) => s.client);
  const thumb = client?.videoThumbUrl(video, 480);
  return (
    <button className="video-card" onClick={() => playVideo(video, from)} title={`Play ${video.Name}`}>
      <div className="video-thumb">
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : null}
        <span className="video-play">
          <Play size={22} fill="currentColor" />
        </span>
      </div>
      <div className="name">{video.Name}</div>
      <div className="sub">{video.Artists?.join(', ') ?? video.AlbumArtist ?? ''}</div>
    </button>
  );
}
