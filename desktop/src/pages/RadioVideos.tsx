// Library → Radio and Library → Music videos.
// Radio: your internet radio stations (add one by its address: a stream, a .pls/.m3u link, or a
// SUB/WAVE station, which also shows what's on air). Music videos: the Music Videos library;
// each opens in its own mpv window (player/video.ts).
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Play, Plus, Radio as RadioIcon, Search, Trash2 } from 'lucide-react';
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
import { Spinner } from '~/ui/parts';

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
      onClick={() => playStation(st)}
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
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      const st = useStations.getState().add(await resolveStation(address));
      toast(`Added ${st.name}`);
      setAddress('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t add that station');
    } finally {
      setBusy(false);
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
        <input className="field" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Add a station: its stream, a .pls or .m3u link, or a SUB/WAVE address" spellCheck={false} />
        <button className="secondary small" disabled={!address.trim() || busy}>
          <Plus size={15} /> {busy ? 'Adding…' : 'Add'}
        </button>
      </form>
      {stations.length ? (
        <div className="stations">
          {homeOrder(stations).map((st) => (
            <StationCard key={st.id} st={st} />
          ))}
        </div>
      ) : (
        <p className="empty-note">No stations yet. Paste an internet radio address above. Stations live on this computer (the phone keeps its own list).</p>
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
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a video" />
        </label>
      </div>
      {q.isLoading ? <Spinner /> : null}
      {q.data && !q.data.length ? <p className="empty-note">No music videos on your server (a Music Videos library in Jellyfin).</p> : null}
      <div className="video-grid">
        {shown.map((v) => (
          <VideoCard key={v.Id} video={v} />
        ))}
      </div>
    </div>
  );
}

export function VideoCard({ video }: { video: BaseItem }) {
  const client = useAuth((s) => s.client);
  const thumb = client?.videoThumbUrl(video, 480);
  return (
    <button className="video-card" onClick={() => void playVideo(video)} title={`Play ${video.Name}`}>
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
