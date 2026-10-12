// "Add to playlist", like the phone app's: every playlist with a tick where the songs already
// are (or how many of them are), Liked Songs on top for a single song, find, New playlist.
// Ticks are staged and saved on Done; saving asks the server what each playlist has right then.
// The ticks show at once from the shared playlist cache (library/playlistCache, as on the phone),
// which checks the server again as the dialog opens.
import { Check, Circle, Heart, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { cachedEntries, checkPlaylistsNow, usePlaylistCache } from '@/library/playlistCache';
import { emitPlaylistsChanged } from '@/lib/events';
import { displayName } from '@/lib/mixes';
import { client } from '~/auth/session';
import { createPlaylist, setLiked, songsOf } from '~/library/actions';
import { queryClient, usePlaylists } from '~/queries';
import { closeDialog, showDialog, toast } from '~/ui/overlays';
import { Artwork } from '~/ui/parts';

const LIKED = '__liked__';

export function openAddToPlaylist(items: BaseItem[]) {
  void Promise.all(items.map(songsOf)).then((lists) => {
    const songs = lists.flat();
    if (songs.length) showDialog(<AddToPlaylist songs={songs} />);
  });
}

function AddToPlaylist({ songs }: { songs: BaseItem[] }) {
  const playlists = usePlaylists().data ?? [];
  const ids = useMemo(() => new Set(songs.map((s) => s.Id)), [songs]);
  const single = songs.length === 1 ? songs[0] : null;
  const [fetched, setFetched] = useState<Record<string, number>>({});
  const [changes, setChanges] = useState<Record<string, boolean>>({});
  const [find, setFind] = useState('');
  const [saving, setSaving] = useState(false);
  const cache = usePlaylistCache((s) => s.lists);

  // How many of the songs each playlist already has: from the cache, else asked.
  const have = useMemo(() => {
    const out: Record<string, number> = { ...fetched };
    for (const p of playlists) {
      const entries = cachedEntries(p.Id);
      if (entries) out[p.Id] = entries.filter((e) => ids.has(e.Id)).length;
    }
    return out;
  }, [cache, fetched, playlists, ids]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => checkPlaylistsNow(), []);

  // Playlists the cache doesn't have yet (just after signing in).
  useEffect(() => {
    const c = client();
    const missing = playlists.filter((p) => !cachedEntries(p.Id));
    if (!c || !missing.length) return;
    let alive = true;
    void (async () => {
      for (let i = 0; i < missing.length; i += 4) {
        const chunk = missing.slice(i, i + 4);
        const counts = await Promise.all(
          chunk.map(async (p) => [p.Id, (await c.getPlaylistMembership(p.Id).catch(() => [])).filter((e) => ids.has(e.Id)).length] as const),
        );
        if (!alive) return;
        setFetched((h) => ({ ...h, ...Object.fromEntries(counts) }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [playlists, ids]);

  const wasIn = (id: string) => (id === LIKED ? !!single?.UserData?.IsFavorite : (have[id] ?? 0) === songs.length);
  const isOn = (id: string) => changes[id] ?? wasIn(id);
  const toggle = (id: string) => setChanges((c) => ({ ...c, [id]: !isOn(id) }));

  const save = async () => {
    const c = client();
    if (!c) return;
    setSaving(true);
    let added = 0;
    const changed: string[] = [];
    try {
      for (const p of playlists) {
        const on = changes[p.Id];
        if (on === undefined || on === wasIn(p.Id)) continue;
        const entries = (await c.getPlaylistMembership(p.Id)).filter((e) => ids.has(e.Id));
        const present = new Set(entries.map((e) => e.Id));
        if (on) {
          const missing = songs.filter((s) => !present.has(s.Id)).map((s) => s.Id);
          if (missing.length) {
            await c.addToPlaylist(p.Id, missing);
            changed.push(p.Id);
            added++;
          }
        } else if (entries.length) {
          await c.removeFromPlaylist(p.Id, entries.map((e) => e.PlaylistItemId!).filter(Boolean));
          changed.push(p.Id);
        }
      }
      if (single && changes[LIKED] !== undefined && changes[LIKED] !== wasIn(LIKED)) await setLiked([single], changes[LIKED]);
      void queryClient.invalidateQueries({ predicate: (q) => ['playlists', 'playlistItems'].includes(q.queryKey[0] as string) });
      if (changed.length) emitPlaylistsChanged(changed);
      if (added) toast(added === 1 ? 'Added to playlist' : `Added to ${added} playlists`);
      closeDialog();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save.");
      setSaving(false);
    }
  };

  const shown = playlists.filter((p) => p.Name.toLowerCase().includes(find.trim().toLowerCase()));
  const row = (id: string, name: string, art: React.ReactNode, sub: string) => {
    const on = isOn(id);
    return (
      <button key={id} className="pick-row" onClick={() => toggle(id)}>
        {art}
        <div className="t">
          <div className="name">{name}</div>
          <div className="sub">{sub}</div>
        </div>
        {on ? <Check size={20} className="tick on" /> : <Circle size={20} className="tick" />}
      </button>
    );
  };

  return (
    <div className="add-to">
      <h2 className="dialog-title">Add to playlist</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        {single ? `${single.Name} · ${single.Artists?.join(', ') ?? ''}` : `${songs.length} songs`}
      </p>
      <div className="add-to-bar">
        <label className="find">
          <Search size={15} />
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find playlist" autoFocus />
        </label>
        <button
          className="secondary small"
          onClick={() => {
            closeDialog();
            void createPlaylist(songs);
          }}>
          <Plus size={15} /> New playlist
        </button>
      </div>
      <div className="pick-list">
        {single && !find
          ? row(
              LIKED,
              'Liked Songs',
              <div className="artwork empty liked-art" style={{ width: 44, flex: 'none' }}>
                <Heart size={18} fill="#fff" color="#fff" />
              </div>,
              wasIn(LIKED) ? 'Already added' : 'Your liked songs',
            )
          : null}
        {shown.map((p) => {
          const n = have[p.Id];
          const sub = n === undefined ? 'Checking...' : n === songs.length ? 'Already added' : n > 0 ? `${n} of ${songs.length} already added` : `${p.ChildCount ?? 0} songs`;
          return row(p.Id, displayName(p), <Artwork item={p} size={100} className="thumb" />, sub);
        })}
      </div>
      <div className="dialog-actions">
        <button className="secondary" onClick={closeDialog}>
          Cancel
        </button>
        <button className="primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving...' : 'Done'}
        </button>
      </div>
    </div>
  );
}
