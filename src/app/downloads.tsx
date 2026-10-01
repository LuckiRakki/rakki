import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { freeSpace } from '@/downloads/files';
import { confirmRemove, removeAllDownloads, retryFailed } from '@/downloads/manager';
import { useDownloads, type DownloadedCollection } from '@/downloads/store';
import { formatBytes, songCount } from '@/lib/format';
import { useNetwork } from '@/lib/network';
import { useSettings } from '@/settings/store';
import { Artwork } from '@/ui/Artwork';
import { LikedArt } from '@/ui/LikedArt';
import { openItem } from '@/ui/nav';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

const KIND_LABEL = { album: 'Album', playlist: 'Playlist', liked: 'Playlist', song: 'Song' } as const;

/** Settings → Manage downloads: what's on the phone, how big, and remove buttons. */
export default function DownloadsScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const tracks = useDownloads((s) => s.tracks);
  const collections = useDownloads((s) => s.collections);
  const onCellular = useNetwork((s) => s.cellular);
  const cellularAllowed = useSettings((s) => s.downloadOnCellular);
  const waitingForWifi = onCellular && !cellularAllowed;

  const all = Object.values(tracks);
  const done = all.filter((x) => x.state === 'done');
  const pending = all.filter((x) => x.state === 'queued' || x.state === 'downloading').length;
  const failed = all.filter((x) => x.state === 'error').length;
  const bytes = done.reduce((n, x) => n + (x.bytes ?? 0), 0);
  const free = freeSpace();
  const list = Object.values(collections).sort((a, b) => b.addedAt - a.addedAt);

  const removeAll = () =>
    Alert.alert('Remove all downloads?', 'Everything you downloaded will be deleted from this iPhone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove all', style: 'destructive', onPress: removeAllDownloads },
    ]);

  const summary = (
    <View style={styles.card}>
      <T variant="heading">{done.length ? songCount(done.length) : 'No downloads yet'}</T>
      <T variant="caption" style={{ marginTop: 2 }}>
        {[done.length ? formatBytes(bytes) : null, free !== null ? `${formatBytes(free)} free on this iPhone` : null]
          .filter(Boolean)
          .join(' · ')}
      </T>
      {pending ? (
        <T variant="caption" style={{ marginTop: t.space.sm }} color={t.colors.text}>
          {waitingForWifi
            ? `${songCount(pending)} waiting for Wi-Fi. You can allow cellular in Settings.`
            : `Downloading ${songCount(pending)}…`}
        </T>
      ) : null}
      {failed ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: t.space.sm }}>
          <T variant="caption" color={t.colors.danger} style={{ flex: 1 }}>
            {songCount(failed)} didn&apos;t download.
          </T>
          <Pressable hitSlop={8} onPress={retryFailed}>
            <T variant="bodyStrong" color={t.colors.accent}>
              Try again
            </T>
          </Pressable>
        </View>
      ) : null}
      {!done.length && !pending ? (
        <T variant="caption" style={{ marginTop: t.space.sm }}>
          Tap the download arrow on an album, playlist or Liked Songs to keep it on your iPhone.
        </T>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-down" size={28} color={t.colors.text} />
        </Pressable>
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>Downloads</T>
        <View style={{ width: 28 }} />
      </View>
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: t.space.lg, paddingBottom: insets.bottom + t.space.xxl }}
        ListHeaderComponent={summary}
        renderItem={({ item }) => <CollectionRow collection={item} />}
        ListFooterComponent={
          list.length ? (
            <Pressable onPress={removeAll} style={({ pressed }) => [styles.removeAll, pressed && { opacity: 0.7 }]}>
              <T variant="bodyStrong" color={t.colors.danger}>
                Remove all downloads
              </T>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}

function CollectionRow({ collection: c }: { collection: DownloadedCollection }) {
  const t = useTheme();
  const tracks = useDownloads((s) => s.tracks);
  const done = c.trackIds.filter((id) => tracks[id]?.state === 'done');
  const bytes = done.reduce((n, id) => n + (tracks[id]?.bytes ?? 0), 0);
  const detail = [
    KIND_LABEL[c.kind],
    done.length === c.trackIds.length ? songCount(c.trackIds.length) : `${done.length} of ${songCount(c.trackIds.length)}`,
    bytes ? formatBytes(bytes) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={() => (c.kind === 'liked' ? router.push('/liked') : openItem(c.item))}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: t.space.sm,
        opacity: pressed ? 0.7 : 1,
      })}>
      {c.kind === 'liked' ? <LikedArt size={52} /> : <Artwork item={c.item} size={52} />}
      <View style={{ flex: 1, marginHorizontal: t.space.md }}>
        <T variant="bodyStrong" numberOfLines={1}>
          {c.item.Name}
        </T>
        <T variant="caption" numberOfLines={1}>
          {detail}
        </T>
      </View>
      <Pressable hitSlop={10} accessibilityLabel={`Remove ${c.item.Name}`} onPress={() => confirmRemove(c.id, c.item.Name)}>
        <Ionicons name="trash-outline" size={22} color={t.colors.textSecondary} />
      </Pressable>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.md,
  },
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.card,
    padding: t.space.lg,
    marginBottom: t.space.lg,
  },
  removeAll: {
    marginTop: t.space.xl,
    height: 44,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: t.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
