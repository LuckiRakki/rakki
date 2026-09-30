import { Ionicons } from '@expo/vector-icons';
import { useQueries } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { queryClient, usePlaylists } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { songCount } from '@/lib/format';
import { setLiked } from '@/library/actions';
import { Artwork } from '@/ui/Artwork';
import { showToast, useOverlays } from '@/ui/overlays';
import { SheetPanel } from '@/ui/Sheet';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

const LIKED = '__liked__';

/** Ask for a name (iOS prompt; plain prompt on web). */
function askName(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    return new Promise((resolve) =>
      Alert.prompt('New playlist', 'Give your playlist a name.', [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Create', onPress: (v?: string) => resolve(v?.trim() || null) },
      ]),
    );
  }
  return Promise.resolve(globalThis.prompt?.('Name your playlist')?.trim() || null);
}

/**
 * Spotify-style "Add to playlist": every playlist with a clear mark when it already has the
 * song (or how many of an album's songs it has), Liked Songs on top, New playlist, search.
 * Ticks are staged locally and saved on Done.
 */
export function AddToPlaylistPanel() {
  const t = useTheme();
  const styles = useStyles();
  const request = useOverlays((s) => s.addTo);
  const client = useAuth((s) => s.client);
  const close = () => {
    setQuery('');
    useOverlays.getState().closeAddToPlaylist();
  };
  const items = useMemo(() => request?.items ?? [], [request]);
  const ids = useMemo(() => new Set(items.map((i) => i.Id)), [items]);
  const single = items.length === 1 ? items[0] : null;

  const playlists = usePlaylists();
  const lists = useMemo(() => (request ? (playlists.data ?? []) : []), [request, playlists.data]);
  const contents = useQueries({
    queries: lists.map((p) => ({
      queryKey: ['playlistItems', client?.session.userId, p.Id],
      queryFn: async () => (await client!.getPlaylistItems(p.Id)).Items,
      enabled: !!client && !!request,
    })),
  });

  // How many of the songs each playlist already has.
  const have = useMemo(() => {
    const m = new Map<string, BaseItem[]>();
    lists.forEach((p, i) => m.set(p.Id, (contents[i]?.data ?? []).filter((x) => ids.has(x.Id))));
    return m;
  }, [lists, contents, ids]);
  const loaded = contents.every((c) => !c.isLoading) && !playlists.isLoading;

  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  // Only the user's changes are stored (per sheet opening); ticks are what's true plus changes.
  const [edits, setEdits] = useState<{ request: object | null; changes: Map<string, boolean> }>({
    request: null,
    changes: new Map(),
  });
  const changes = edits.request === request ? edits.changes : new Map<string, boolean>();

  /** Already true on the server: a playlist counts when it has every song. */
  const wasIn = (id: string) =>
    id === LIKED ? !!single?.UserData?.IsFavorite : items.length > 0 && (have.get(id)?.length ?? 0) === items.length;
  const isOn = (id: string) => changes.get(id) ?? wasIn(id);
  const toggle = (id: string) => {
    const next = new Map(changes);
    next.set(id, !isOn(id));
    setEdits({ request, changes: next });
  };
  const selected = loaded ? new Set([LIKED, ...lists.map((p) => p.Id)].filter(isOn)) : null;

  async function done() {
    if (!client || !selected) return close();
    setSaving(true);
    const added: string[] = [];
    try {
      for (const p of lists) {
        const on = selected.has(p.Id);
        const already = have.get(p.Id) ?? [];
        if (on && !wasIn(p.Id)) {
          const present = new Set(already.map((x) => x.Id));
          await client.addToPlaylist(p.Id, items.filter((i) => !present.has(i.Id)).map((i) => i.Id));
          added.push(p.Name);
        } else if (!on && wasIn(p.Id)) {
          await client.removeFromPlaylist(p.Id, already.map((x) => x.PlaylistItemId!).filter(Boolean));
        }
      }
      if (single && selected.has(LIKED) !== wasIn(LIKED)) await setLiked(single, selected.has(LIKED));
      void queryClient.invalidateQueries({ predicate: (q) => ['playlistItems', 'playlists'].includes(q.queryKey[0] as string) });
      if (added.length) showToast(added.length === 1 ? `Added to ${added[0]}` : `Added to ${added.length} playlists`);
      close();
    } catch (e) {
      Alert.alert('Couldn’t save', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function newPlaylist() {
    if (!client) return;
    const name = await askName();
    if (!name) return;
    try {
      await client.createPlaylist(name, items.map((i) => i.Id));
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'playlists' });
      showToast(`Added to ${name}`);
      close();
    } catch (e) {
      Alert.alert('Couldn’t create the playlist', e instanceof Error ? e.message : String(e));
    }
  }

  const filtered = lists.filter((p) => p.Name.toLowerCase().includes(query.trim().toLowerCase()));

  const row = (id: string, name: string, art: React.ReactNode, sub: string, subAccent: boolean) => {
    const on = selected?.has(id) ?? false;
    return (
      <Pressable key={id} onPress={() => toggle(id)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
        {art}
        <View style={{ flex: 1, marginHorizontal: t.space.md }}>
          <T variant="bodyStrong" numberOfLines={1}>
            {name}
          </T>
          <T variant="caption" numberOfLines={1} color={subAccent ? t.colors.accent : undefined}>
            {sub}
          </T>
        </View>
        <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? t.colors.accent : t.colors.textMuted} />
      </Pressable>
    );
  };

  return (
    <SheetPanel visible={!!request} onClose={close} maxHeightRatio={0.9}>
      <View style={styles.top}>
        <T variant="heading" style={{ textAlign: 'center' }}>
          Add to playlist
        </T>
        <T variant="caption" numberOfLines={1} style={{ textAlign: 'center', marginTop: 2 }}>
          {items.length > 1 ? `${request?.title} · ${songCount(items.length)}` : request?.title}
        </T>
        <Pressable onPress={newPlaylist} style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.8 }]}>
          <T style={styles.newBtnText}>New playlist</T>
        </Pressable>
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={t.colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Find playlist"
            placeholderTextColor={t.colors.textMuted}
            style={styles.searchInput}
            autoCorrect={false}
          />
        </View>
      </View>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: t.space.md }}>
        {single && !query
          ? row(
              LIKED,
              'Liked Songs',
              <View style={[styles.likedArt, { backgroundColor: t.colors.accent }]}>
                <Ionicons name="heart" size={22} color="#fff" />
              </View>,
              wasIn(LIKED) ? 'Already added' : 'Your liked songs',
              wasIn(LIKED),
            )
          : null}
        {filtered.map((p) => {
          const n = have.get(p.Id)?.length ?? 0;
          const sub =
            n === items.length && n > 0
              ? 'Already added'
              : n > 0
                ? `${n} of ${items.length} songs already added`
                : songCount(p.ChildCount ?? 0);
          return row(p.Id, p.Name, <Artwork item={p} size={48} />, sub, n > 0);
        })}
        {lists.length === 0 && !playlists.isLoading ? (
          <T variant="caption" style={{ textAlign: 'center', padding: t.space.xl }}>
            You don’t have any playlists yet. Create one with New playlist.
          </T>
        ) : null}
      </ScrollView>
      <Pressable disabled={saving} onPress={done} style={({ pressed }) => [styles.done, (pressed || saving) && { opacity: 0.8 }]}>
        <T style={styles.doneText}>{saving ? 'Saving…' : 'Done'}</T>
      </Pressable>
    </SheetPanel>
  );
}

const useStyles = makeStyles((t) => ({
  top: { paddingHorizontal: t.space.lg, paddingBottom: t.space.sm },
  newBtn: {
    alignSelf: 'center',
    marginTop: t.space.lg,
    paddingHorizontal: t.space.xl,
    height: 44,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.text,
    justifyContent: 'center',
  },
  newBtnText: { color: '#000', fontFamily: t.fonts.bold, fontSize: t.size(15) },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    marginTop: t.space.lg,
    paddingHorizontal: t.space.md,
    height: 40,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface3,
  },
  searchInput: { flex: 1, color: t.colors.text, fontFamily: t.fonts.medium, fontSize: t.size(14) },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg, paddingVertical: t.space.sm },
  likedArt: { width: 48, height: 48, borderRadius: t.radius.art, alignItems: 'center', justifyContent: 'center' },
  done: {
    alignSelf: 'center',
    marginTop: t.space.sm,
    paddingHorizontal: 48,
    height: 48,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.accent,
    justifyContent: 'center',
  },
  doneText: { color: '#000', fontFamily: t.fonts.bold, fontSize: t.size(16) },
}));
