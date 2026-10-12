// The in-app music video player: over the whole window, the video on black with the song and
// artist above it, the webview's own video controls (play, seek, volume, picture in picture,
// full screen), and a button to fill the screen with Rakki itself. Esc or the chevron closes
// it (the music picks up again if it was playing). When the video ends, Up next offers the
// artist's other videos.
import { useQuery } from '@tanstack/react-query';
import Hls from 'hls.js';
import { ChevronDown, Expand, Play, Shrink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { useAuth } from '~/auth/session';
import { WindowButtons } from '~/layout/frame';
import { useLayout } from '~/layout/layout';
import { usePlayer } from '~/player/store';
import { useVideo, videoSource } from '~/player/video';

function UpNext({ video }: { video: BaseItem }) {
  const client = useAuth((s) => s.client);
  const all = useQuery({ queryKey: ['musicVideos', client?.session.userId], enabled: !!client, queryFn: () => client!.getMusicVideos() }).data;
  const artist = (video.Artists?.[0] ?? video.AlbumArtist ?? '').toLowerCase();
  const more = (all ?? []).filter((v) => v.Id !== video.Id && (v.Artists ?? [v.AlbumArtist ?? '']).some((a) => a?.toLowerCase() === artist)).slice(0, 6);
  if (!more.length) return null;
  return (
    <div className="vp-next">
      <div className="vp-next-title">More from {video.Artists?.[0] ?? video.AlbumArtist}</div>
      <div className="vp-next-row">
        {more.map((v) => (
          <button key={v.Id} className="vp-next-item" onClick={() => useVideo.getState().open(v)} title={`Play ${v.Name}`}>
            <span className="vp-next-thumb">
              {client?.videoThumbUrl(v, 320) ? <img src={client.videoThumbUrl(v, 320)} alt="" /> : null}
              <Play size={18} fill="currentColor" />
            </span>
            <span className="vp-next-name">{v.Name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function VideoPlayer() {
  const video = useVideo((s) => s.video);
  const fullscreen = useLayout((s) => s.fullscreen);
  const client = useAuth((s) => s.client);
  const el = useRef<HTMLVideoElement>(null);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the video: straight from the file, or HLS through hls.js (or the webview, if it can).
  useEffect(() => {
    const v = el.current;
    if (!video || !v) return;
    setEnded(false);
    setError(null);
    const src = videoSource(video);
    if (!src) return;
    v.volume = Math.max(0, Math.min(1, usePlayer.getState().volume / 100));
    let hls: Hls | null = null;
    if (src.hls && !v.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 30 });
      hls.on(Hls.Events.ERROR, (_e, data) => data.fatal && setError('The server couldn’t convert this video.'));
      hls.loadSource(src.url);
      hls.attachMedia(v);
    } else {
      v.src = src.url;
    }
    void v.play().catch(() => {});
    return () => {
      hls?.destroy();
      v.removeAttribute('src');
      v.load();
      // Stop the server's conversion of this one.
      if (src.hls) void client?.stopVideoEncoding(src.playSessionId).catch(() => {});
    };
  }, [video, client]);

  // Esc: out of full screen first, then close. Space: the video, not the music.
  useEffect(() => {
    if (!video) return;
    const onKey = (e: KeyboardEvent) => {
      const v = el.current;
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        if (document.fullscreenElement) return;
        const l = useLayout.getState();
        if (l.fullscreen) l.setFullscreen(false);
        else useVideo.getState().close();
      } else if (e.code === 'Space' && v && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (v.paused) void v.play();
        else v.pause();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [video]);

  if (!video) return null;
  const by = video.Artists?.join(', ') || video.AlbumArtist || '';
  return (
    <div className="videoplayer">
      <div className="vp-top" data-tauri-drag-region>
        <button className="iconbtn" aria-label="Close video" title="Close (Esc)" onClick={() => useVideo.getState().close()}>
          <ChevronDown size={24} />
        </button>
        <div className="vp-title" data-tauri-drag-region>
          <span className="name">{video.Name}</span>
          {by ? <span className="by">{by}</span> : null}
        </div>
        <button
          className="iconbtn"
          aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
          title={fullscreen ? 'Exit full screen (F11)' : 'Full screen (F11)'}
          onClick={() => useLayout.getState().setFullscreen(!fullscreen)}>
          {fullscreen ? <Shrink size={19} /> : <Expand size={19} />}
        </button>
        {fullscreen ? null : <WindowButtons />}
      </div>
      <div className="vp-stage">
        <video
          ref={el}
          className="vp-video"
          controls
          autoPlay
          playsInline
          onEnded={() => setEnded(true)}
          onPlay={() => setEnded(false)}
          onError={() => setError('Couldn’t play this video.')}
        />
        {error ? <div className="vp-error">{error}</div> : null}
      </div>
      {ended ? <UpNext video={video} /> : null}
    </div>
  );
}
