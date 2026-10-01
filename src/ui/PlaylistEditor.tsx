import { Ionicons } from '@expo/vector-icons';
import { memo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import ReorderableList, { useReorderableDrag } from 'react-native-reorderable-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BaseItem } from '@/api/jellyfin';
import { artistLine } from '@/lib/items';
import { movePlaylistEntry, removePlaylistEntry, savePlaylistName } from '@/library/actions';
import { Artwork } from '@/ui/Artwork';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/**
 * Spotify's "Edit playlist": rename, drag songs by their handle to reorder, remove with the
 * minus. Moves and removals are saved as you make them; the name is saved on Done.
 */
export function PlaylistEditor({
  playlist,
  items,
  onDone,
}: {
  playlist: BaseItem;
  items: BaseItem[];
  onDone: () => void;
}) {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(playlist.Name);

  const done = () => {
    const next = name.trim();
    if (next && next !== playlist.Name) void savePlaylistName(playlist.Id, next);
    onDone();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={[styles.bar, { paddingTop: insets.top + t.space.sm }]}>
        <View style={{ width: 56 }} />
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>Edit playlist</T>
        <Pressable hitSlop={10} onPress={done} style={{ width: 56, alignItems: 'flex-end' }}>
          <T variant="bodyStrong" color={t.colors.accent}>
            Done
          </T>
        </Pressable>
      </View>
      <ReorderableList
        data={items}
        keyExtractor={(x, i) => x.PlaylistItemId ?? `${x.Id}-${i}`}
        onReorder={({ from, to }) => void movePlaylistEntry(playlist.Id, from, to)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + t.space.xl }}
        ListHeaderComponent={
          <View style={{ alignItems: 'center', paddingVertical: t.space.xl }}>
            <Artwork item={playlist} size={140} />
            <TextInput
              value={name}
              onChangeText={setName}
              onSubmitEditing={done}
              returnKeyType="done"
              keyboardAppearance="dark"
              selectionColor={t.colors.accent}
              placeholder="Playlist name"
              placeholderTextColor={t.colors.textMuted}
              style={styles.name}
            />
          </View>
        }
        renderItem={({ item }) => <EditRow playlistId={playlist.Id} track={item} />}
      />
    </View>
  );
}

const EditRow = memo(function EditRow({ playlistId, track }: { playlistId: string; track: BaseItem }) {
  const t = useTheme();
  const styles = useStyles();
  const drag = useReorderableDrag();
  return (
    <Pressable onLongPress={drag} delayLongPress={300} style={styles.row}>
      <Pressable
        hitSlop={10}
        accessibilityLabel={`Remove ${track.Name}`}
        onPress={() => track.PlaylistItemId && void removePlaylistEntry(playlistId, track.PlaylistItemId)}
        style={{ marginRight: t.space.md }}>
        <Ionicons name="remove-circle" size={24} color={t.colors.danger} />
      </Pressable>
      <Artwork item={track} size={46} />
      <View style={{ flex: 1, marginHorizontal: t.space.md }}>
        <T variant="bodyStrong" numberOfLines={1}>
          {track.Name}
        </T>
        <T variant="caption" numberOfLines={1}>
          {artistLine(track)}
        </T>
      </View>
      <Pressable
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
        onPressIn={drag}
        accessibilityLabel={`Reorder ${track.Name}`}>
        <Ionicons name="reorder-three" size={26} color={t.colors.textSecondary} />
      </Pressable>
    </Pressable>
  );
});

const useStyles = makeStyles((t) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.space.lg,
    paddingBottom: t.space.sm,
  },
  name: {
    marginTop: t.space.lg,
    minWidth: 200,
    maxWidth: '86%',
    textAlign: 'center',
    color: t.colors.text,
    fontFamily: t.fonts.bold,
    fontSize: t.size(22),
    paddingVertical: t.space.xs,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    outlineWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.sm,
    backgroundColor: t.colors.bg,
  },
}));
