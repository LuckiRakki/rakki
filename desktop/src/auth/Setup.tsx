// "Setting Up Rakki": the first time an account signs in on this computer, what you set up on
// your other Rakki apps comes over from the server before the app opens (radio stations, the
// Last.fm key, playlists and mixes, Home). One of the few waits Rakki has, because the app is
// empty without it; each step ticks off as it lands, and it never takes more than a few seconds
// (anything slower carries on behind). Later launches sync behind the scenes instead.
import { useEffect, useState } from 'react';
import { create } from 'zustand';

import { syncLastfmKey } from '@/lib/companion';
import { startStationSync } from '@/radio/stationSync';
import { useAuth } from '~/auth/session';
import { allPlaylistsKey, queryClient } from '~/queries';
import { Check } from '~/ui/icons';
import { kv } from '~/lib/kv';

const DONE = (userId: string) => `rakki.setUp.${userId}`;
const LONGEST_MS = 8000;

export const useSetup = create<{ running: boolean }>(() => ({ running: false }));

type Step = { label: string; run(): Promise<unknown> };

function steps(): Step[] {
  const c = useAuth.getState().client!;
  const uid = c.session.userId;
  return [
    { label: 'Your Radio Stations', run: () => startStationSync(c) },
    { label: 'Your Last.fm Key', run: () => syncLastfmKey() },
    {
      label: 'Your Playlists and Mixes',
      run: () => queryClient.prefetchQuery({ queryKey: [allPlaylistsKey, uid], queryFn: () => c.getPlaylists().then((r) => r.Items) }),
    },
    { label: 'Your Home', run: () => queryClient.prefetchQuery({ queryKey: ['recentlyPlayed', uid], queryFn: () => c.getRecentlyPlayedAlbums(12) }) },
  ];
}

/** At sign-in: the setup screen the first time for this account, else syncing behind. */
export function startSetup() {
  const c = useAuth.getState().client;
  if (!c) return;
  const key = DONE(c.session.userId);
  if (kv.getItem(key)) {
    void startStationSync(c);
    return;
  }
  useSetup.setState({ running: true });
}

export function SettingUp() {
  const [done, setDone] = useState<boolean[]>([]);
  useEffect(() => {
    const list = steps();
    const c = useAuth.getState().client!;
    let alive = true;
    const finish = () => {
      if (!alive) return;
      alive = false;
      kv.setItem(DONE(c.session.userId), '1');
      useSetup.setState({ running: false });
    };
    const timer = setTimeout(finish, LONGEST_MS);
    void Promise.all(
      list.map((s, i) =>
        s
          .run()
          .catch(() => {})
          .finally(() => alive && setDone((d) => Object.assign([...d], { [i]: true }))),
      ),
    ).then(() => setTimeout(finish, 400));
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className="setup">
      <div className="setup-card" role="status">
        <div className="wordmark">
          Rakki<b>.</b>
        </div>
        <h1>Setting Up Rakki</h1>
        <p className="muted">Bringing over what you set up on your other Rakki apps.</p>
        <ul>
          {steps().map((s, i) => (
            <li key={s.label} className={done[i] ? 'done' : ''}>
              <span className="tick">{done[i] ? <Check size={16} /> : <span className="spin small" />}</span>
              {s.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
