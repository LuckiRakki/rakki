import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { artistLine } from '@/lib/items';
import { addToQueue, isLiked, playNext, setLiked, startRadio, tracksOf } from '@/library/actions';
import { Artwork } from '@/ui/Artwork';
import { useOverlays } from '@/ui/overlays';
import { SheetPanel } from '@/ui/Sheet';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;
interface Action {
  icon: IconName;
  label: string;
  run: () => void | Promise<void>;
  accent?: boolean;
}

const KIND: Record<string, string> = {
  Audio: 'Song',
  MusicAlbum: 'Album',
  MusicArtist: 'Artist',
  Playlist: 'Playlist',
};

function actionsFor(item: BaseItem, close: () => void): Action[] {
  const liked = isLiked(item);
  const go = (path: string) => () => {
    close();
    router.push(path as never);
  };
  const artist = item.ArtistItems?.[0] ?? item.AlbumArtists?.[0];
  const addToPlaylist = async () => {
    const tracks = await tracksOf(item);
    useOverlays.getState().menuToAddToPlaylist(tracks, item.Name);
  };
  const like: Action = {
    icon: liked ? 'heart' : 'heart-outline',
    label: liked ? (item.Type === 'Audio' ? 'Remove from Liked Songs' : 'Remove from Liked') : item.Type === 'Audio' ? 'Add to Liked Songs' : 'Like',
    run: () => setLiked(item, !liked),
    accent: liked,
  };

  switch (item.Type) {
    case 'Audio':
      return [
        like,
        { icon: 'add-circle-outline', label: 'Add to playlist', run: addToPlaylist },
        { icon: 'play-forward-outline', label: 'Play next', run: () => playNext(item) },
        { icon: 'list-outline', label: 'Add to queue', run: () => addToQueue(item) },
        ...(item.AlbumId ? [{ icon: 'disc-outline' as IconName, label: 'Go to album', run: go(`/album/${item.AlbumId}`) }] : []),
        ...(artist ? [{ icon: 'person-outline' as IconName, label: 'Go to artist', run: go(`/artist/${artist.Id}`) }] : []),
        { icon: 'radio-outline', label: 'Song radio', run: () => startRadio(item) },
      ];
    case 'MusicAlbum':
      return [
        like,
        { icon: 'add-circle-outline', label: 'Add to playlist', run: addToPlaylist },
        { icon: 'play-forward-outline', label: 'Play next', run: () => playNext(item) },
        { icon: 'list-outline', label: 'Add to queue', run: () => addToQueue(item) },
        ...(artist ? [{ icon: 'person-outline' as IconName, label: 'Go to artist', run: go(`/artist/${artist.Id}`) }] : []),
        { icon: 'radio-outline', label: 'Album radio', run: () => startRadio(item) },
      ];
    case 'MusicArtist':
      return [
        like,
        { icon: 'radio-outline', label: 'Artist radio', run: () => startRadio(item) },
        { icon: 'person-outline', label: 'Go to artist', run: go(`/artist/${item.Id}`) },
      ];
    case 'Playlist':
      return [
        { icon: 'play-forward-outline', label: 'Play next', run: () => playNext(item) },
        { icon: 'list-outline', label: 'Add to queue', run: () => addToQueue(item) },
        { icon: 'radio-outline', label: 'Playlist radio', run: () => startRadio(item) },
        { icon: 'albums-outline', label: 'Go to playlist', run: go(`/playlist/${item.Id}`) },
      ];
    default:
      return [];
  }
}

/** The long-press menu, shown for whatever item `useOverlays.menu` holds (inside OverlayHost). */
export function ContextMenuPanel() {
  const t = useTheme();
  const styles = useStyles();
  const item = useOverlays((s) => s.menu);
  const close = () => useOverlays.getState().closeMenu();
  const actions = item ? actionsFor(item, close) : [];
  const subtitle = item ? [KIND[item.Type], item.Type === 'MusicArtist' ? null : artistLine(item)].filter(Boolean).join(' · ') : '';

  return (
    <SheetPanel visible={!!item} onClose={close}>
      {item ? (
        <>
          <View style={styles.header}>
            <Artwork item={item} size={52} rounded={item.Type === 'MusicArtist' ? 26 : undefined} />
            <View style={{ flex: 1, marginLeft: t.space.md }}>
              <T variant="bodyStrong" numberOfLines={1}>
                {item.Name}
              </T>
              <T variant="caption" numberOfLines={1}>
                {subtitle}
              </T>
            </View>
          </View>
          <View style={styles.divider} />
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={() => {
                void Haptics.selectionAsync().catch(() => {});
                if (a.label !== 'Add to playlist' && !a.label.startsWith('Go to')) close();
                void a.run();
              }}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.colors.surface3 }]}>
              <Ionicons name={a.icon} size={24} color={a.accent ? t.colors.accent : t.colors.textSecondary} />
              <T style={styles.label}>{a.label}</T>
            </Pressable>
          ))}
        </>
      ) : null}
    </SheetPanel>
  );
}

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg, paddingVertical: t.space.md },
  divider: { height: StyleSheetHairline, backgroundColor: t.colors.border, marginBottom: t.space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space.lg, paddingHorizontal: t.space.lg, paddingVertical: 14 },
  label: { fontFamily: t.fonts.medium, fontSize: t.size(16), color: t.colors.text },
}));

const StyleSheetHairline = 1;
