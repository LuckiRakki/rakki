// Rakki's own title bar (the window has no system frame): back and forward, Home, search, the
// update notice, your picture and the window buttons.
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '~/auth/session';
import { useLayout, win } from '~/layout/layout';
import { installUpdate, useUpdate } from '~/lib/updateCheck';
import { go, useNav } from '~/nav';
import { onShortcut } from '~/settings/shortcuts';
import { ChevronLeft, ChevronRight, CircleArrowDown, Copy, Home as HomeIcon, LogOut, Minus, Refresh, Search as SearchIcon, Settings2, Shrink, Square, X } from '~/ui/icons';
import { Avatar } from '~/ui/Avatar';
import { openMenu } from '~/ui/overlays';
import { refreshAll, useRefreshing } from '~/lib/refresh';

export function WindowButtons() {
  const [max, setMax] = useState(false);
  const w = win;
  useEffect(() => {
    if (!w) return;
    void w.isMaximized().then(setMax);
    const un = w.onResized(() => void w.isMaximized().then(setMax));
    return () => void un.then((f) => f());
  }, []);
  if (!w) return null;
  return (
    <div className="winbtns">
      <button className="win" aria-label="Minimize" title="Minimize" onClick={() => void w.minimize()}>
        <Minus size={16} />
      </button>
      <button className="win" aria-label={max ? 'Restore' : 'Maximize'} title={max ? 'Restore' : 'Maximize'} onClick={() => void w.toggleMaximize()}>
        {max ? <Copy size={14} style={{ transform: 'scaleX(-1)' }} /> : <Square size={14} />}
      </button>
      <button className="win close" aria-label="Close" title="Close (Rakki keeps playing in the tray)" onClick={() => void w.close()}>
        <X size={18} />
      </button>
    </div>
  );
}

/** Your picture in the title bar: Settings and Sign out. */
function UserButton() {
  const session = useAuth((s) => s.session);
  if (!session) return null;
  return (
    <button
      className="avatar"
      title={session.userName}
      aria-label={`${session.userName}: Settings and Sign out`}
      onClick={(e) =>
        openMenu(
          e,
          [
            { label: 'Settings', icon: Settings2, run: () => go({ name: 'settings' }) },
            { label: 'Sign Out', icon: LogOut, run: () => useAuth.getState().signOut(), divider: true },
          ],
          `${session.userName} · ${session.serverName}`,
        )
      }>
      <Avatar size={32} />
    </button>
  );
}

/** A newer Rakki is out (lib/updateCheck): one click installs it and restarts. */
function UpdateButton() {
  const version = useUpdate((s) => s.version);
  const progress = useUpdate((s) => s.progress);
  if (!version) return null;
  return (
    <button className="update-btn" title={`Install Rakki ${version} and restart`} disabled={progress !== null} onClick={() => void installUpdate()}>
      <CircleArrowDown size={16} />
      {progress === null ? 'Update' : `Updating ${Math.round(progress * 100)}%`}
    </button>
  );
}

/** Refresh: every page loads again from the server in place (lib/refresh.ts), nothing blanks. */
function RefreshButton() {
  const busy = useRefreshing();
  return (
    <button className={`navbtn refresh${busy ? ' busy' : ''}`} onClick={() => void refreshAll()} aria-label="Refresh" title="Refresh (see what's new on your server)">
      <Refresh size={18} />
    </button>
  );
}

/** The whole window in full screen (F11 on a page): leave it here, where the window buttons were. */
function ExitFullScreen() {
  return (
    <div className="winbtns">
      <button className="win" aria-label="Exit Full Screen" title="Exit Full Screen (Esc)" onClick={() => useLayout.getState().setFullscreen(false)}>
        <Shrink size={16} />
      </button>
    </div>
  );
}

/** Searching: whatever covers the page (the full player, full screen, the lyrics, a big video) makes way for the results. */
function toSearch(term: string) {
  useLayout.getState().showMain(true);
  const r = useNav.getState().route;
  if (r.name === 'search') useNav.setState({ route: { name: 'search', term } });
  else go({ name: 'search', term });
}

export function TitleBar() {
  const { at, stack, route } = useNav();
  const fullscreen = useLayout((s) => s.fullscreen);
  const [term, setTerm] = useState(route.name === 'search' ? (route.term ?? '') : '');
  const input = useRef<HTMLInputElement>(null);

  // The Search shortcut (Ctrl+K, Ctrl+F, "/" unless changed in Settings): the search box, and
  // the results in front of anything covering them.
  useEffect(
    () =>
      onShortcut('search', () => {
        const r = useNav.getState().route;
        toSearch(r.name === 'search' ? (r.term ?? '') : (input.current?.value ?? ''));
        input.current?.focus();
        input.current?.select();
      }),
    [],
  );

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="tb-left" data-tauri-drag-region>
        <span className="brand" data-tauri-drag-region>
          Rakki<b>.</b>
          {import.meta.env.DEV ? <span className="brand-dev">Dev</span> : null}
        </span>
        <button className="navbtn" disabled={at === 0} onClick={() => useNav.getState().back()} aria-label="Back" title="Back">
          <ChevronLeft size={18} />
        </button>
        <button className="navbtn" disabled={at >= stack.length - 1} onClick={() => useNav.getState().forward()} aria-label="Forward" title="Forward">
          <ChevronRight size={18} />
        </button>
        <RefreshButton />
      </div>
      <div className="tb-center" data-tauri-drag-region>
        <button className="navbtn home" onClick={() => go({ name: 'home' })} aria-label="Home" title="Home">
          <HomeIcon size={20} />
        </button>
        <label className="search">
          <SearchIcon size={17} />
          <input
            ref={input}
            value={term}
            placeholder="What do you want to play?"
            aria-label="Search"
            onFocus={() => toSearch(term)}
            onChange={(e) => {
              setTerm(e.target.value);
              toSearch(e.target.value);
            }}
          />
          {term ? (
            <button
              className="clear"
              aria-label="Clear"
              onClick={() => {
                setTerm('');
                if (useNav.getState().route.name === 'search') useNav.setState({ route: { name: 'search', term: '' } });
              }}>
              <X size={15} />
            </button>
          ) : null}
        </label>
      </div>
      <div className="tb-right" data-tauri-drag-region>
        <UpdateButton />
        <UserButton />
        {fullscreen ? <ExitFullScreen /> : <WindowButtons />}
      </div>
    </div>
  );
}
