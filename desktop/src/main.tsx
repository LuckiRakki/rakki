import '@fontsource-variable/inter';
import './styles/index.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { startPlaylistCache } from '@/library/playlistCache';
import { ensureSearchIndex } from '@/search/index';
import { restoreCache, startCacheSaving } from '~/lib/cache';
import { startScrollbars } from '~/ui/scrolling';
import { syncLastfmKey } from '@/lib/companion';
import { useAuth } from '~/auth/session';
import { SettingUp, startSetup, useSetup } from '~/auth/Setup';
import { SignIn } from '~/auth/SignIn';
import { PlayerBar } from '~/layout/PlayerBar';
import { Resizer, Sidebar } from '~/layout/Sidebar';
import { TitleBar } from '~/layout/TitleBar';
import { useLayout } from '~/layout/layout';
import { MiniPlayer } from '~/layout/MiniPlayer';
import { NowPlayingPanel } from '~/layout/NowPlayingPanel';
import { useNav } from '~/nav';
import { Page } from '~/pages/Page';
import { NowPlaying } from '~/player/NowPlaying';
import { VideoHost } from '~/player/VideoHost';
import { startUpdateCheck } from '~/lib/updateCheck';
import { startDiscord } from '~/player/discord';
import { startRemoteCommands, startRemoteMedia, useRemote } from '~/player/remote';
import { startRadioWatch } from '~/radio/radio';
import { currentPosition, startPlayer, usePlayer } from '~/player/store';
import { queryClient } from '~/queries';
import { FullscreenHint } from '~/ui/FullscreenHint';
import { Overlays } from '~/ui/overlays';
import { ServerBar, refetchFailed } from '~/ui/states';
import { useApplyTheme } from '~/ui/theme';
import { useApplyLook } from '~/ui/applyLook';
import { ThemeBackdrop } from '~/themes/ThemeBackdrop';
import { useApplyCustomTheme } from '~/themes/themes';
import { LyricsMain } from '~/lyrics/LyricsMain';
import { useLook } from '~/settings/look';
import { useVideo } from '~/player/video';
import { watchServer } from '@/lib/online';

/** Keyboard shortcuts that work anywhere (not while typing). */
function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName ?? '');
  // Space on a focused button (or anything acting as one) presses it, not play / pause.
  const pressable = !!el?.closest?.('button, [role="button"], [role="link"], [role="menuitem"], [role="slider"], [role="separator"], [role="row"], a');
  const p = usePlayer.getState();
  if (e.key === 'F11') {
    e.preventDefault();
    const l = useLayout.getState();
    return l.setFullscreen(!l.fullscreen);
  }
  if (e.key === 'Escape' && !useLayout.getState().nowPlaying && useLayout.getState().fullscreen) return useLayout.getState().setFullscreen(false);
  // Esc on the lyrics in the main area: the page again (a menu or dialog open closes first).
  if (e.key === 'Escape' && !useLayout.getState().nowPlaying && useLayout.getState().lyricsView && !document.querySelector('.menu, .dialog')) return useLayout.getState().setLyricsView(false);
  if (e.altKey && e.key === 'ArrowLeft') return useNav.getState().back();
  if (e.altKey && e.key === 'ArrowRight') return useNav.getState().forward();
  if (typing) return;
  if (e.code === 'Space' && !pressable) {
    e.preventDefault();
    p.toggle();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') p.next();
  else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') p.previous();
  else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp') p.setVolume(p.volume + 5);
  else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowDown') p.setVolume(p.volume - 5);
  else if (e.shiftKey && e.key === 'ArrowRight') p.seek(currentPosition(p) + 5);
  else if (e.shiftKey && e.key === 'ArrowLeft') p.seek(Math.max(0, currentPosition(p) - 5));
}

function App() {
  const signedIn = useAuth((s) => !!s.client);
  const { panel, sidebarWidth, panelWidth, nowPlaying, fullscreen, mini, floating, rail, lyricsView } = useLayout();
  const hasSong = usePlayer((s) => s.queue.length > 0);
  const routeKey = useNav((s) => `${s.route.name}:${'id' in s.route ? s.route.id : ''}`);
  useApplyTheme();
  useApplyLook();
  useApplyCustomTheme();
  const settingUp = useSetup((s) => s.running);

  useEffect(() => {
    startPlayer();
    startDiscord();
    startRadioWatch();
    startRemoteMedia();
    // Music started here: the player bar is this computer's again.
    usePlayer.subscribe((p, prev) => {
      if (p.playing && !prev.playing && useRemote.getState().target) useRemote.getState().setTarget(null);
    });
    startUpdateCheck();
    // The server stops answering: a bar says so, Rakki keeps asking, and failed pages load again once it's back.
    watchServer({ url: () => useAuth.getState().session?.serverUrl, back: refetchFailed });
    // Narrow windows: the right sidebar floats, the left one shrinks to icons (layout.ts).
    const onResize = () => useLayout.getState().setWindowWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    // The mouse's back and forward buttons.
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) useNav.getState().back();
      if (e.button === 4) useNav.getState().forward();
    };
    // No browser menu: Rakki's own menus only.
    const noMenu = (e: MouseEvent) => {
      if (!['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) e.preventDefault();
    };
    window.addEventListener('mouseup', onMouse);
    window.addEventListener('keydown', onKey);
    window.addEventListener('contextmenu', noMenu);
    return () => {
      window.removeEventListener('mouseup', onMouse);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('contextmenu', noMenu);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // The Last.fm key, shared with the Rakki plugin on the server (as on the phone).
  // And the playlist cache behind the save buttons and Add to playlist (shared with the phone).
  const userId = useAuth((s) => s.session?.userId);
  useEffect(() => {
    if (!signedIn) return;
    void syncLastfmKey();
    startPlaylistCache();
    // Your other Rakki apps can see and control this one (player/remote.ts).
    startRemoteCommands();
    // What you set up on your other Rakki apps (stations...): a setup screen the first time.
    startSetup();
    // The search index is built and topped up behind the scenes, not when you first search:
    // shortly after launch, then every so often and when you come back to the window (it
    // checks itself and does nothing while it's fresh).
    const first = setTimeout(() => void ensureSearchIndex(), 8000);
    const every = setInterval(() => void ensureSearchIndex(), 15 * 60_000);
    const onFocus = () => void ensureSearchIndex();
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      window.removeEventListener('focus', onFocus);
    };
  }, [signedIn, userId]);

  return (
    <>
      {signedIn && settingUp ? (
        <SettingUp />
      ) : signedIn && mini ? (
        <MiniPlayer />
      ) : signedIn ? (
        <div
          className={`app${panel && !floating ? '' : ' no-panel'}${floating ? ' floating' : ''}${rail ? ' rail' : ''}${nowPlaying ? ' np-open' : ''}${nowPlaying && fullscreen ? ' np-fs' : ''}`}
          style={{ ['--sidebar' as string]: `${sidebarWidth}px`, ['--panel' as string]: `${panelWidth}px` }}>
          <ThemeBackdrop />
          <TitleBar />
          <Sidebar />
          {rail ? null : <Resizer which="sidebar" />}
          <main className={`panel main${lyricsView && hasSong ? ' lyrics-open' : ''}`} id="main">
            <ServerBar />
            {lyricsView && hasSong ? (
              <LyricsMain />
            ) : (
              <div key={routeKey} className="route">
                <Page />
              </div>
            )}
          </main>
          {panel && !floating ? <Resizer which="panel" /> : null}
          <NowPlayingPanel />
          <PlayerBar />
          <NowPlaying />
          <VideoHost />
        </div>
      ) : (
        <SignIn />
      )}
      <Overlays />
      <FullscreenHint />
    </>
  );
}

// Development only: lets the interface be checked in a browser without real playback.
if (import.meta.env.DEV) Object.assign(window, { __rakki: { usePlayer, useLayout, useNav, useVideo }, __rakkiLook: useLook });

// Last time's pages first (lib/cache.ts), then draw; what changes is kept as it changes.
void restoreCache().then(() => {
  startCacheSaving();
  startScrollbars();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
});
