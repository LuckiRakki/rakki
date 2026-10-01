import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { tick } from '@/lib/haptics';
import type { BaseItem } from '@/api/jellyfin';
import { artistLine } from '@/lib/items';
import {
  addToQueue,
  deletePlaylist,
  isLiked,
  playNext,
  removeFromPlaylist,
  renamePlaylist,
  setLiked,
  startRadio,
  tracksOf,
} from '@/library/actions';
import { confirmRemove, downloadCollection } from '@/downloads/manager';
import { useDownloads } from '@/downloads/store';
import { useOffline } from '@/lib/online';
import { sleepSheet, useSleepTimer } from '@/player/sleep';
import { Artwork } from '@/ui/Artwork';
import { goTo } from '@/ui/nav';
import { useOverlays, type MenuContext } from '@/ui/overlays';
import { CLOSE_MS, SheetPanel } from '@/ui/Sheet';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { cachedMusicVideos, findVideoFor, playMusicVideo } from '@/video/musicVideos';

type IconName = keyof typeof Ionicons.glyphMap;
interface Action {
  icon: IconName;
  label: string;
  run: () => void | Promise<void>;
  accent?: boolean;
  /** Opens an iOS dialog: wait until the sheet has slid away first. */
  afterClose?: boolean;
  /** Works without the server (shown offline; everything else is hidden then). */
  offline?: boolean;
}

const KIND: Record<string, string> = {
  Audio: 'Song',
  MusicAlbum: 'Album',
  MusicArtist: 'Artist',
  Playlist: 'Playlist',
};

function actionsFor(item: BaseItem, close: () => void, context: MenuContext | null): Action[] {
  const liked = isLiked(item);
  const go = (path: string) => () => {
    close();
    goTo(path);
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

  // Download / Remove download. A song already downloaded as part of an album or playlist
  // shows neither (remove it from there).
  const kind = item.Type === 'Audio' ? 'song' : item.Type === 'MusicAlbum' ? 'album' : item.Type === 'Playlist' ? 'playlist' : null;
  const dl = useDownloads.getState();
  const collectionId = item.Type === 'Audio' ? `song:${item.Id}` : item.Id;
  const download: Action[] = !kind
    ? []
    : dl.collections[collectionId]
      ? [{ icon: 'arrow-down-circle', label: 'Remove download', run: () => confirmRemove(collectionId, item.Name), accent: true, afterClose: true, offline: true }]
      : item.Type === 'Audio' && dl.tracks[item.Id]
        ? []
        : [{ icon: 'arrow-down-circle-outline', label: 'Download', run: () => downloadCollection(kind, item) }];

  // From the full player: the sleep timer.
  const sleep: Action[] = context?.fromPlayer
    ? [
        {
          icon: 'moon-outline',
          label: useSleepTimer.getState().endsAt || useSleepTimer.getState().endOfSong ? 'Sleep timer (on)' : 'Sleep timer',
          run: () => {
            const { endsAt, endOfSong } = useSleepTimer.getState();
            useOverlays.getState().menuToOptions(sleepSheet(!!endsAt || endOfSong));
          },
          offline: true,
        },
      ]
    : [];

  const removeHere: Action[] =
    context?.playlistId && context.entryId
      ? [
          {
            icon: 'remove-circle-outline',
            label: 'Remove from this playlist',
            run: () => removeFromPlaylist(context.playlistId!, context.entryId!, item.Name),
          },
        ]
      : [];

  // A song with a music video in the library.
  const musicVideo = item.Type === 'Audio' ? findVideoFor(item, cachedMusicVideos()) : undefined;
  const watch: Action[] = musicVideo
    ? [{ icon: 'film-outline', label: 'Watch music video', run: () => playMusicVideo(musicVideo), afterClose: true }]
    : [];

  switch (item.Type) {
    case 'Audio':
      return [
        ...watch,
        like,
        ...removeHere,
        { icon: 'add-circle-outline', label: 'Add to playlist', run: addToPlaylist },
        { icon: 'play-forward-outline', label: 'Play next', run: () => playNext(item), offline: true },
        { icon: 'list-outline', label: 'Add to queue', run: () => addToQueue(item), offline: true },
        ...download,
        ...(item.AlbumId ? [{ icon: 'disc-outline' as IconName, label: 'Go to album', run: go(`/album/${item.AlbumId}`), offline: true }] : []),
        ...(artist ? [{ icon: 'person-outline' as IconName, label: 'Go to artist', run: go(`/artist/${artist.Id}`), offline: true }] : []),
        { icon: 'radio-outline', label: 'Song radio', run: () => startRadio(item) },
        ...sleep,
      ];
    case 'MusicAlbum':
      return [
        like,
        { icon: 'add-circle-outline', label: 'Add to playlist', run: addToPlaylist },
        { icon: 'play-forward-outline', label: 'Play next', run: () => playNext(item), offline: true },
        { icon: 'list-outline', label: 'Add to queue', run: () => addToQueue(item), offline: true },
        ...download,
        ...(artist ? [{ icon: 'person-outline' as IconName, label: 'Go to artist', run: go(`/artist/${artist.Id}`), offline: true }] : []),
        { icon: 'radio-outline', label: 'Album radio', run: () => startRadio(item) },
      ];
    case 'MusicArtist':
      return [
        like,
        { icon: 'radio-outline', label: 'Artist radio', run: () => startRadio(item) },
        { icon: 'person-outline', label: 'Go to artist', run: go(`/artist/${item.Id}`), offline: true },
      ];
    case 'Playlist':
      return [
        { icon: 'play-forward-outline', label: 'Play next', run: () => playNext(item), offline: true },
        { icon: 'list-outline', label: 'Add to queue', run: () => addToQueue(item), offline: true },
        ...download,
        { icon: 'radio-outline', label: 'Playlist radio', run: () => startRadio(item) },
        { icon: 'albums-outline', label: 'Go to playlist', run: go(`/playlist/${item.Id}`), offline: true },
        { icon: 'create-outline', label: 'Rename playlist', run: () => renamePlaylist(item), afterClose: true },
        { icon: 'trash-outline', label: 'Delete playlist', run: () => deletePlaylist(item), afterClose: true },
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
  const context = useOverlays((s) => s.menuContext);
  const close = () => useOverlays.getState().closeMenu();
  const offline = useOffline();
  const all = item ? actionsFor(item, close, context) : [];
  const actions = offline ? all.filter((a) => a.offline) : all;
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
                tick();
                // These switch to another sheet (or page) themselves.
                const switches = a.label === 'Add to playlist' || a.label.startsWith('Go to') || a.label.startsWith('Sleep timer');
                if (!switches) close();
                if (a.afterClose) setTimeout(() => void a.run(), CLOSE_MS + 150);
                else void a.run();
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
