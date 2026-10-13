// The music video player, in the three sizes of player/video.ts. One <video> element lives for
// as long as a video is open and is laid over whichever "slot" the current size shows (the
// sidebar card, the theater's stage, or the whole window), so switching sizes never reloads or
// stutters the video. The webview's own controls (play, seek, volume, picture in picture) are on
// the video in every size.
//
// Its sound also feeds the theater's visualizer graph (Web Audio; your server allows the
// cross-origin read it needs).
import { useQuery } from '@tanstack/react-query';
import Hls from 'hls.js';
import { ChevronDown, Expand, Maximize2, PanelRight, Pause, Play, Shrink, SkipBack, SkipForward, Volume2, X } from '~/ui/icons';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { artColor } from '@/lib/blurhash';
import { useSettings } from '@/settings/store';
import { videoTitle } from '@/video/titles';
import { useAuth } from '~/auth/session';
import { WindowButtons } from '~/layout/TitleBar';
import { Range } from '~/ui/Range';
import { useLayout } from '~/layout/layout';
import { go } from '~/nav';
import { usePlayer } from '~/player/store';
import { songForVideo, useVideo, videoSource } from '~/player/video';
import { usePresence } from '~/ui/motion';
import { ArtistLinks, Artwork, formatTime } from '~/ui/parts';

const COUNTDOWN_S = 5;

// ---- The video's state, for the player bar and the sidebar ----

let element: HTMLVideoElement | null = null;

export const usePlayback = create<{ playing: boolean; time: number; duration: number; volume: number }>(() => ({
  playing: false,
  time: 0,
  duration: 0,
  volume: 0.8,
}));

export const videoControls = {
  toggle() {
    if (!element) return;
    if (element.paused) void element.play();
    else element.pause();
  },
  seek(seconds: number) {
    if (element) element.currentTime = Math.max(0, seconds);
  },
  setVolume(v: number) {
    if (element) element.volume = Math.max(0, Math.min(1, v));
  },
};

// ---- The slot the video sits over ----

const useSlot = create<{ el: HTMLElement | null }>(() => ({ el: null }));

/** Where the video shows in the current size (the video itself is laid over it). */
function VideoSlot({ className }: { className: string }) {
  const mine = useRef<HTMLDivElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (node) useSlot.setState({ el: node });
    else if (useSlot.getState().el === mine.current) useSlot.setState({ el: null });
    mine.current = node;
  }, []);
  return <div className={`video-slot ${className}`} ref={ref} />;
}

/** The slot's place on screen, kept up to date as things move and resize. */
function useSlotRect(el: HTMLElement | null, full: boolean) {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => {
    if (full) {
      const fill = () => setRect({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
      fill();
      window.addEventListener('resize', fill);
      return () => window.removeEventListener('resize', fill);
    }
    if (!el) return setRect(null);
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect(r.width && r.height ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    // Sidebar resizes and panel changes move it without resizing it.
    const id = setInterval(measure, 500);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      clearInterval(id);
    };
  }, [el, full]);
  return rect;
}

// ---- Sound for the visualizer ----

let audio: { ctx: AudioContext; analyser: AnalyserNode } | null = null;
/** Each video element can be tapped once; a new element (the next video opened) gets its own. */
const tapped = new WeakMap<HTMLVideoElement, MediaElementAudioSourceNode>();

/** Route the video's sound through the analyser (it then plays through it). */
function hearVideo(v: HTMLVideoElement) {
  try {
    if (!audio) {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.82;
      analyser.connect(ctx.destination);
      audio = { ctx, analyser };
    }
    if (!tapped.has(v)) {
      const source = audio.ctx.createMediaElementSource(v);
      source.connect(audio.analyser);
      tapped.set(v, source);
    }
    void audio.ctx.resume();
  } catch {
    // No Web Audio: the video plays as usual, the graph stays flat.
  }
}

/** A graph of the video's sound: the spectrum from 40 Hz to 16 kHz as a smooth filled curve. */
function Visualizer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current!;
    const g = c.getContext('2d')!;
    let frame = 0;
    const POINTS = 96;
    const levels = new Float32Array(POINTS);
    let data = new Uint8Array(0);
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const a = audio?.analyser;
      if (a) {
        if (data.length !== a.frequencyBinCount) data = new Uint8Array(a.frequencyBinCount);
        a.getByteFrequencyData(data);
        const hzPerBin = a.context.sampleRate / a.fftSize;
        for (let i = 0; i < POINTS; i++) {
          const hz = 40 * Math.pow(16000 / 40, i / (POINTS - 1));
          const v = (data[Math.min(data.length - 1, Math.round(hz / hzPerBin))] ?? 0) / 255;
          // Rise fast, fall slowly.
          levels[i] = v > levels[i] ? v : levels[i] * 0.9 + v * 0.1;
        }
      } else levels.fill(0);
      const accent = getComputedStyle(c).getPropertyValue('--accent').trim() || '#fd642d';
      const y = (v: number) => h - 2 - v * (h - 6);
      g.beginPath();
      g.moveTo(0, h);
      g.lineTo(0, y(levels[0]));
      for (let i = 1; i < POINTS; i++) {
        const x0 = ((i - 1) / (POINTS - 1)) * w;
        const x1 = (i / (POINTS - 1)) * w;
        const xm = (x0 + x1) / 2;
        g.quadraticCurveTo(x0, y(levels[i - 1]), xm, (y(levels[i - 1]) + y(levels[i])) / 2);
      }
      g.lineTo(w, y(levels[POINTS - 1]));
      g.lineTo(w, h);
      g.closePath();
      const fill = g.createLinearGradient(0, 0, 0, h);
      fill.addColorStop(0, `${accent}cc`);
      fill.addColorStop(1, `${accent}10`);
      g.fillStyle = fill;
      g.fill();
      g.strokeStyle = accent;
      g.lineWidth = 2;
      g.stroke();
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);
  return <canvas className="vt-visualizer" ref={canvas} aria-label="Sound graph" />;
}

// ---- What's shown around the video ----

const resolution = (v: BaseItem) => {
  const s = v.MediaSources?.[0]?.MediaStreams?.find((x) => x.Type === 'Video');
  if (!s?.Height) return null;
  return s.Height >= 2160 ? '4K' : s.Height >= 1440 ? '1440p' : s.Height >= 1080 ? '1080p' : s.Height >= 720 ? '720p' : `${s.Height}p`;
};

function UpNextList() {
  const upNext = useVideo((s) => s.upNext);
  const countdown = useVideo((s) => s.countdown);
  const client = useAuth((s) => s.client);
  return (
    <div className="vt-next">
      <h3>Up next</h3>
      {upNext.length ? null : <p className="muted small">Nothing else to play.</p>}
      {upNext.map((v, i) => (
        <button key={v.Id} className={`vt-next-row${i === 0 && countdown !== null ? ' counting' : ''}`} onClick={() => useVideo.getState().open(v)} title={`Play ${v.Name}`}>
          <span className="vt-next-thumb">{client?.videoThumbUrl(v, 320) ? <img src={client.videoThumbUrl(v, 320)} alt="" loading="lazy" /> : <Play size={16} />}</span>
          <span className="t">
            {i === 0 && countdown !== null ? <span className="vt-count">Up next in {countdown}</span> : null}
            <span className="name">{videoTitle(v.Name, v.Artists ?? []) || v.Name}</span>
            <span className="sub">{v.Artists?.join(', ') ?? ''}</span>
          </span>
        </button>
      ))}
      {countdown !== null ? (
        <button className="text-btn" onClick={() => useVideo.setState({ countdown: null })}>
          Cancel autoplay
        </button>
      ) : null}
    </div>
  );
}

function Theater({ video, leaving }: { video: BaseItem; leaving: boolean }) {
  const client = useAuth((s) => s.client);
  const fullscreen = useLayout((s) => s.fullscreen);
  const song = useQuery({ queryKey: ['videoSong', video.Id], queryFn: () => songForVideo(video), staleTime: 6 * 3600_000 }).data;
  const thumb = client?.videoThumbUrl(video, 960);
  const tint = song && client ? artColor(client.blurhash(song), '#151518') : '#151518';
  const title = videoTitle(video.Name, video.Artists ?? []) || video.Name;
  const res = resolution(video);
  const year = video.ProductionYear ?? song?.ProductionYear;
  const badges = [res, video.MediaSources?.[0]?.MediaStreams?.find((x) => x.Type === 'Video')?.Codec?.toUpperCase(), year].filter(Boolean);
  const v = useVideo.getState();
  return (
    <div className={`vt${leaving ? ' leaving' : ''}`} style={{ ['--tint' as string]: tint }}>
      {thumb ? <div className="vt-backdrop" style={{ backgroundImage: `url("${thumb}")` }} /> : null}
      <div className="vt-top" data-tauri-drag-region>
        <button className="iconbtn" aria-label="Shrink to the sidebar" title="Shrink to the sidebar (Esc)" onClick={() => v.setMode('mini')}>
          <ChevronDown size={24} />
        </button>
        <span className="vt-label" data-tauri-drag-region>
          Music video
        </span>
        <button className="iconbtn" aria-label="Full screen" title="Full screen (F)" onClick={() => v.setMode('full')}>
          <Expand size={19} />
        </button>
        <button className="iconbtn" aria-label="Close the video" title="Close the video" onClick={() => v.close()}>
          <X size={20} />
        </button>
        {fullscreen ? null : <WindowButtons />}
      </div>
      <div className="vt-body">
        <div className="vt-main">
          <VideoSlot className="vt-stage" />
          <div className="vt-under">
            <div className="vt-info">
              <div className="vt-title">{title}</div>
              <div className="vt-by">{video.ArtistItems?.length ? <ArtistLinks item={video} /> : (video.Artists?.join(', ') ?? video.AlbumArtist)}</div>
              <div className="vt-meta">
                {badges.map((b) => (
                  <span key={String(b)} className="badge-pill">
                    {b}
                  </span>
                ))}
              </div>
              {song?.AlbumId ? (
                <button className="vt-album" onClick={() => (v.setMode('mini'), go({ name: 'album', id: song.AlbumId! }))} title="Open the album">
                  <Artwork item={song} size={120} className="thumb" />
                  <span className="t">
                    <span className="name">{song.Album}</span>
                    <span className="sub">{['Album', song.ProductionYear].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              ) : null}
            </div>
            <Visualizer />
          </div>
        </div>
        <UpNextList />
      </div>
    </div>
  );
}

function FullChrome({ video }: { video: BaseItem }) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 2500);
    };
    wake();
    window.addEventListener('mousemove', wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousemove', wake);
    };
  }, []);
  const v = useVideo.getState();
  return (
    <div className={`vf${idle ? ' idle' : ''}`}>
      <div className="vf-top">
        <button className="iconbtn" aria-label="Leave full screen" title="Leave full screen (Esc)" onClick={() => v.setMode('theater')}>
          <Shrink size={19} />
        </button>
        <span className="vf-title">
          {videoTitle(video.Name, video.Artists ?? []) || video.Name}
          <span className="by">{video.Artists?.join(', ')}</span>
        </span>
        <button className="iconbtn" aria-label="Close the video" title="Close the video" onClick={() => v.close()}>
          <X size={20} />
        </button>
      </div>
    </div>
  );
}

/** The video in the right sidebar (and, with the sidebar closed, as a small card). */
export function MiniVideoCard({ floating = false }: { floating?: boolean }) {
  const video = useVideo((s) => s.video);
  const mode = useVideo((s) => s.mode);
  if (!video || mode !== 'mini') return null;
  const v = useVideo.getState();
  return (
    <div className={`mini-video${floating ? ' floating' : ''}`}>
      <VideoSlot className="mini-video-stage" />
      <div className="mini-video-row">
        <div className="t">
          <div className="name">{videoTitle(video.Name, video.Artists ?? []) || video.Name}</div>
          <div className="sub">{video.Artists?.join(', ')}</div>
        </div>
        <button className="iconbtn" aria-label="Bigger" title="Bigger" onClick={() => v.setMode('theater')}>
          <Maximize2 size={15} />
        </button>
        <button className="iconbtn" aria-label="Close the video" title="Close the video" onClick={() => v.close()}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/** The right sidebar while a video is open: the video (in the mini size), what it is, Up next. */
export function VideoPanel({ video }: { video: BaseItem }) {
  const client = useAuth((s) => s.client);
  const song = useQuery({ queryKey: ['videoSong', video.Id], queryFn: () => songForVideo(video), staleTime: 6 * 3600_000 }).data;
  const res = resolution(video);
  const year = video.ProductionYear ?? song?.ProductionYear;
  return (
    <div className="panel-body video-panel">
      <MiniVideoCard />
      {useVideo.getState().mode !== 'mini' && client?.videoThumbUrl(video, 640) ? (
        <button className="video-panel-thumb" onClick={() => useVideo.getState().setMode('mini')} title="Play it here in the sidebar">
          <img src={client.videoThumbUrl(video, 640)} alt="" />
        </button>
      ) : null}
      <div className="video-panel-info">
        <div className="np-view-title">{videoTitle(video.Name, video.Artists ?? []) || video.Name}</div>
        <div className="np-view-by">{video.ArtistItems?.length ? <ArtistLinks item={video} /> : video.Artists?.join(', ')}</div>
        <div className="np-tags">
          <span>Music video</span>
          {res ? <span>{res}</span> : null}
          {year ? <span>{year}</span> : null}
        </div>
        {song?.AlbumId ? (
          <button className="vt-album" onClick={() => go({ name: 'album', id: song.AlbumId! })} title="Open the album">
            <Artwork item={song} size={120} className="thumb" />
            <span className="t">
              <span className="name">{song.Album}</span>
              <span className="sub">{['Album', song.ProductionYear].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        ) : null}
      </div>
      <UpNextList />
    </div>
  );
}

/** The player bar while a video is open: the video's controls instead of the music's. */
export function VideoBar({ video }: { video: BaseItem }) {
  const client = useAuth((s) => s.client);
  const { playing, time, duration, volume } = usePlayback();
  const mode = useVideo((s) => s.mode);
  const hasNext = useVideo((s) => s.upNext.length > 0);
  const hasBack = useVideo((s) => s.played.length > 0);
  const v = useVideo.getState();
  const thumb = client?.videoThumbUrl(video, 240);
  return (
    <footer className="playerbar video">
      <div className="np">
        <button className="video-bar-thumb" title="Bigger" onClick={() => v.setMode(mode === 'theater' ? 'mini' : 'theater')}>
          {thumb ? <img src={thumb} alt="" /> : <Play size={18} />}
        </button>
        <div key={`t-${video.Id}`} className="t">
          <div className="name">{videoTitle(video.Name, video.Artists ?? []) || video.Name}</div>
          <div className="by">{video.Artists?.join(', ')}</div>
        </div>
      </div>
      <div className="controls">
        <div className="buttons">
          <button className="iconbtn" aria-label="Previous video" title="Previous video" disabled={!hasBack} onClick={() => v.back()}>
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button className="pp" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'} onClick={videoControls.toggle}>
            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <button className="iconbtn" aria-label="Next video" title="Next video" disabled={!hasNext} onClick={() => v.next()}>
            <SkipForward size={20} fill="currentColor" />
          </button>
        </div>
        <div className="seek">
          <span>{formatTime(time)}</span>
          <Range label="Seek" step={5} value={time} max={duration} onSet={videoControls.seek} />
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <div className="right">
        <button className={`iconbtn${mode === 'mini' ? ' on' : ''}`} aria-label="In the sidebar" title="In the sidebar" onClick={() => v.setMode('mini')}>
          <PanelRight size={18} />
        </button>
        <button className={`iconbtn${mode === 'theater' ? ' on' : ''}`} aria-label="Bigger" title="Bigger" onClick={() => v.setMode('theater')}>
          <Maximize2 size={17} />
        </button>
        <button className="iconbtn" aria-label="Full screen" title="Full screen (F)" onClick={() => v.setMode('full')}>
          <Expand size={17} />
        </button>
        <div className="volume" title={`Volume ${Math.round(volume * 100)}% (scroll to change)`} onWheel={(e) => videoControls.setVolume(volume + (e.deltaY < 0 ? 0.05 : -0.05))}>
          <Volume2 size={18} />
          <div className="vol">
            <Range label="Volume" step={5} value={volume * 100} max={100} onSet={(x) => videoControls.setVolume(x / 100)} />
          </div>
        </div>
        <button className="iconbtn" aria-label="Close the video" title="Close the video" onClick={() => v.close()}>
          <X size={17} />
        </button>
      </div>
    </footer>
  );
}

// ---- The host ----

export function VideoHost() {
  const video = useVideo((s) => s.video);
  const mode = useVideo((s) => s.mode);
  const countdown = useVideo((s) => s.countdown);
  const panel = useLayout((s) => s.panel);
  const client = useAuth((s) => s.client);
  const slot = useSlot((s) => s.el);
  const el = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const rect = useSlotRect(mode === 'full' ? null : slot, mode === 'full');
  const theater = usePresence(!!video && mode === 'theater', 260);
  // While it changes size, the video glides from its old place to the new one. Marked in the
  // same render as the change, so the very first move is already animated.
  const modeSeen = useRef(mode);
  const movingUntil = useRef(0);
  if (modeSeen.current !== mode) {
    modeSeen.current = mode;
    movingUntil.current = performance.now() + 460;
  }
  const [, settle] = useState(0);
  useEffect(() => {
    const left = movingUntil.current - performance.now();
    if (left <= 0) return;
    const t = setTimeout(() => settle((n) => n + 1), left);
    return () => clearTimeout(t);
  }, [mode]);
  const moving = performance.now() < movingUntil.current;

  // Load the video: straight from the file, or HLS (the webview's own, else hls.js).
  useEffect(() => {
    const v = el.current;
    if (!video || !v) return;
    element = v;
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
      if (src.hls) void client?.stopVideoEncoding(src.playSessionId).catch(() => {});
    };
  }, [video, client]);

  // One player at a time: starting the music closes the video (and the music, already
  // playing, has nothing to resume).
  useEffect(
    () =>
      usePlayer.subscribe((s, prev) => {
        if (s.playing && !prev.playing && useVideo.getState().video) useVideo.getState().close();
      }),
    [],
  );

  // Autoplay: when a video ends, the next follows after a countdown (Settings: Autoplay videos).
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) return useVideo.getState().next();
    const t = setTimeout(() => useVideo.setState((s) => ({ countdown: s.countdown === null ? null : s.countdown - 1 })), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Keys: Space plays and pauses the video; F full screen; arrows seek; Esc steps down a size.
  useEffect(() => {
    if (!video) return;
    const onKey = (e: KeyboardEvent) => {
      const v = el.current;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
      const s = useVideo.getState();
      if (!v || typing) return;
      if (e.key === 'Escape' && s.mode !== 'mini') {
        e.stopImmediatePropagation();
        if (document.fullscreenElement) return;
        s.setMode(s.mode === 'full' ? 'theater' : 'mini');
      } else if (e.code === 'Space' && !e.ctrlKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (v.paused) void v.play();
        else v.pause();
      } else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && s.mode !== 'mini') {
        s.setMode(s.mode === 'full' ? 'theater' : 'full');
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.ctrlKey && !e.altKey && s.mode !== 'mini') {
        e.stopImmediatePropagation();
        v.currentTime = Math.max(0, v.currentTime + (e.key === 'ArrowLeft' ? -5 : 5));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [video]);

  if (!video) return null;
  const placed: CSSProperties = rect
    ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h }
    : { left: 0, top: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' };
  return (
    <>
      {theater.render ? <Theater video={video} leaving={theater.leaving} /> : null}
      {mode === 'mini' && !panel ? <MiniVideoCard floating /> : null}
      <div className={`video-frame ${mode}${moving ? ' moving' : ''}`} style={placed}>
        <video
          ref={el}
          className="video-el"
          controls
          autoPlay
          playsInline
          crossOrigin="anonymous"
          onPlay={(e) => {
            hearVideo(e.currentTarget);
            useVideo.setState({ countdown: null });
            usePlayback.setState({ playing: true });
          }}
          onPause={() => usePlayback.setState({ playing: false })}
          onTimeUpdate={(e) => usePlayback.setState({ time: e.currentTarget.currentTime })}
          onDurationChange={(e) => usePlayback.setState({ duration: Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0 })}
          onVolumeChange={(e) => usePlayback.setState({ volume: e.currentTarget.muted ? 0 : e.currentTarget.volume })}
          onEnded={() => {
            usePlayback.setState({ playing: false });
            const s = useVideo.getState();
            if (useSettings.getState().videoAutoplay && s.upNext.length) useVideo.setState({ countdown: COUNTDOWN_S });
          }}
          onError={() => setError('Couldn’t play this video.')}
        />
        {error ? <div className="vp-error">{error}</div> : null}
      </div>
      {mode === 'full' ? <FullChrome video={video} /> : null}
    </>
  );
}

