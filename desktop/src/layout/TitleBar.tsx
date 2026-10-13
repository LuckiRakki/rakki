// Rakki's own title bar (the window has no system frame): back and forward, Home, search, the
// update notice, your picture and the window buttons.
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '~/auth/session';
import { win } from '~/layout/layout';
import { openUpdate, useUpdate } from '~/lib/updateCheck';
import { go, useNav } from '~/nav';
import { ChevronLeft, ChevronRight, CircleArrowDown, Copy, Home as HomeIcon, LogOut, Minus, Search as SearchIcon, Settings2, Square, X } from '~/ui/icons';
import { openMenu } from '~/ui/overlays';

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
  const client = useAuth((s) => s.client);
  const [failed, setFailed] = useState(false);
  if (!session) return null;
  const src = client?.userImageUrl({ Id: session.userId }, 80);
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
            { label: 'Sign out', icon: LogOut, run: () => useAuth.getState().signOut(), divider: true },
          ],
          `${session.userName} · ${session.serverName}`,
        )
      }>
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : null}
      <span>{session.userName.slice(0, 1).toUpperCase()}</span>
    </button>
  );
}

/** A newer Rakki is out (lib/updateCheck): opens its download page. */
function UpdateButton() {
  const version = useUpdate((s) => s.version);
  if (!version) return null;
  return (
    <button className="update-btn" title={`Rakki ${version} is out: open the download page`} onClick={openUpdate}>
      <CircleArrowDown size={16} />
      Update
    </button>
  );
}

export function TitleBar() {
  const { at, stack, route } = useNav();
  const [term, setTerm] = useState(route.name === 'search' ? (route.term ?? '') : '');
  const input = useRef<HTMLInputElement>(null);

  // Ctrl+K / Ctrl+F / "/": search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'f')) || (e.key === '/' && !typing)) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="tb-left" data-tauri-drag-region>
        <span className="brand" data-tauri-drag-region>
          Rakki<b>.</b>
        </span>
        <button className="navbtn" disabled={at === 0} onClick={() => useNav.getState().back()} aria-label="Back" title="Back">
          <ChevronLeft size={18} />
        </button>
        <button className="navbtn" disabled={at >= stack.length - 1} onClick={() => useNav.getState().forward()} aria-label="Forward" title="Forward">
          <ChevronRight size={18} />
        </button>
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
            onFocus={() => useNav.getState().route.name !== 'search' && go({ name: 'search', term })}
            onChange={(e) => {
              setTerm(e.target.value);
              const r = useNav.getState().route;
              if (r.name === 'search') useNav.setState({ route: { name: 'search', term: e.target.value } });
              else go({ name: 'search', term: e.target.value });
            }}
          />
          {term ? (
            <button className="clear" aria-label="Clear" onClick={() => setTerm('')}>
              <X size={15} />
            </button>
          ) : null}
        </label>
      </div>
      <div className="tb-right" data-tauri-drag-region>
        <UpdateButton />
        <UserButton />
        <WindowButtons />
      </div>
    </div>
  );
}
