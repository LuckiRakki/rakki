import '@fontsource-variable/inter';
import './styles.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { useAuth } from '~/auth/session';
import { SignIn } from '~/auth/SignIn';
import { PlayerBar, QueuePanel, Sidebar, TitleBar, useLayout } from '~/layout/frame';
import { useNav } from '~/nav';
import { Page } from '~/pages/pages';
import { startPlayer, usePlayer } from '~/player/store';
import { queryClient } from '~/queries';

function App() {
  const signedIn = useAuth((s) => !!s.client);
  const queueOpen = useLayout((s) => s.queueOpen);

  useEffect(() => {
    startPlayer();
    // The mouse's back and forward buttons, and Alt+Left/Right.
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) useNav.getState().back();
      if (e.button === 4) useNav.getState().forward();
    };
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (e.altKey && e.key === 'ArrowLeft') useNav.getState().back();
      else if (e.altKey && e.key === 'ArrowRight') useNav.getState().forward();
      else if (e.code === 'Space' && !typing) {
        e.preventDefault();
        usePlayer.getState().toggle();
      }
    };
    window.addEventListener('mouseup', onMouse);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mouseup', onMouse);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!signedIn) {
    return (
      <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'var(--titlebar) 1fr' }}>
        <TitleBarMinimal />
        <SignIn />
      </div>
    );
  }
  return (
    <div className="app" style={queueOpen ? undefined : { gridTemplateColumns: 'var(--sidebar) 1fr 0' }}>
      <TitleBar />
      <Sidebar />
      <main className="panel main" id="main">
        <Page />
      </main>
      {queueOpen ? <QueuePanel /> : <div />}
      <PlayerBar />
    </div>
  );
}

/** Before signing in: just the window controls. */
function TitleBarMinimal() {
  return (
    <div className="titlebar" style={{ padding: '0 8px' }}>
      <div className="drag" data-tauri-drag-region />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
