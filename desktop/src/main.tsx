import '@fontsource-variable/inter';
import './styles.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { syncLastfmKey } from '@/lib/companion';
import { useAuth } from '~/auth/session';
import { SignIn } from '~/auth/SignIn';
import { PlayerBar, RightPanel, Sidebar, TitleBar, useLayout } from '~/layout/frame';
import { useNav } from '~/nav';
import { Page } from '~/pages/pages';
import { NowPlaying } from '~/player/NowPlaying';
import { currentPosition, startPlayer, usePlayer } from '~/player/store';
import { queryClient } from '~/queries';
import { Overlays } from '~/ui/overlays';
import { useApplyTheme } from '~/ui/theme';

/** Keyboard shortcuts that work anywhere (not while typing). */
function onKey(e: KeyboardEvent) {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
  const p = usePlayer.getState();
  if (e.key === 'F11') {
    e.preventDefault();
    const l = useLayout.getState();
    return l.setFullscreen(!l.fullscreen);
  }
  if (e.altKey && e.key === 'ArrowLeft') return useNav.getState().back();
  if (e.altKey && e.key === 'ArrowRight') return useNav.getState().forward();
  if (typing) return;
  if (e.code === 'Space') {
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
  const panel = useLayout((s) => s.panel);
  useApplyTheme();

  useEffect(() => {
    startPlayer();
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
    };
  }, []);

  // The Last.fm key, shared with the Rakki plugin on the server (as on the phone).
  useEffect(() => {
    if (signedIn) void syncLastfmKey();
  }, [signedIn]);

  return (
    <>
      {signedIn ? (
        <div className={`app${panel ? '' : ' no-panel'}`}>
          <TitleBar />
          <Sidebar />
          <main className="panel main" id="main">
            <Page />
          </main>
          <RightPanel />
          <PlayerBar />
          <NowPlaying />
        </div>
      ) : (
        <SignIn />
      )}
      <Overlays />
    </>
  );
}

// Development only: lets the interface be checked in a browser without real playback.
if (import.meta.env.DEV) Object.assign(window, { __rakki: { usePlayer, useLayout, useNav } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
