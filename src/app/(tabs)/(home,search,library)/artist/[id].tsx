import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppearsOn, useArtistAlbums, useItem, useSimilar, useTopTracks } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { artColor } from '@/lib/blurhash';
import { setLiked, startRadio } from '@/library/actions';
import { usePlayer } from '@/player/store';
import { Shelf, SectionTitle } from '@/ui/Shelf';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { TrackRow } from '@/ui/TrackRow';

/** Singles and EPs: releases with only a few songs. */
const isSingleOrEp = (count?: number) => (count ?? 0) > 0 && (count ?? 0) <= 6;

export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const client = useAuth((s) => s.client);
  const artist = useItem(id);
  const albums = useArtistAlbums(id);
  const appearsOn = useAppearsOn(id);
  const top = useTopTracks(id);
  const similar = useSimilar(id);
  const currentId = usePlayer((s) => s.queue[s.index]?.item.Id);
  const playing = usePlayer((s) => s.playing);
  const isThisArtist = usePlayer((s) => s.source?.type === 'artist' && s.source.id === id);
  const [more, setMore] = useState(false);

  const a = artist.data;
  const cover = a && client ? (client.backdropUrl(a, 1200) ?? client.imageUrl(a, 800)) : undefined;
  const blurhash = a && client ? client.blurhash(a) : undefined;
  const tint = artColor(blurhash);
  const liked = a?.UserData?.IsFavorite ?? false;
  const source = { type: 'artist' as const, id, name: a?.Name ?? 'Artist' };
  const popular = top.data ?? [];
  const full = albums.data?.filter((x) => !isSingleOrEp(x.ChildCount)) ?? [];
  const singles = albums.data?.filter((x) => isSingleOrEp(x.ChildCount)) ?? [];

  function play() {
    if (isThisArtist) return usePlayer.getState().toggle();
    if (popular.length) usePlayer.getState().playQueue(popular, { source });
  }

  async function shuffle() {
    if (!client) return;
    const all = await client.items({ IncludeItemTypes: 'Audio', ArtistIds: id, Limit: 500 });
    if (all.Items.length) usePlayer.getState().playQueue(all.Items, { source, shuffle: true });
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: t.space.xxl }}>
        <View style={[styles.hero, { backgroundColor: tint }]}>
          {cover ? (
            <Image
              source={{ uri: cover }}
              placeholder={blurhash ? { blurhash } : undefined}
              style={StyleHero}
              contentFit="cover"
              transition={200}
            />
          ) : null}
          <LinearGradient colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.25)', t.colors.bg]} locations={[0, 0.6, 1]} style={StyleHero} />
          <T style={styles.name} numberOfLines={2}>
            {a?.Name ?? ' '}
          </T>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={() => a && setLiked(a, !liked)} style={[styles.likeBtn, liked && { borderColor: t.colors.accent }]}>
            <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(13), color: liked ? t.colors.accent : t.colors.text }}>
              {liked ? 'Liked' : 'Like'}
            </T>
          </Pressable>
          <Pressable hitSlop={8} onPress={shuffle}>
            <Ionicons name="shuffle" size={26} color={t.colors.textSecondary} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => a && startRadio(a)}>
            <Ionicons name="radio-outline" size={24} color={t.colors.textSecondary} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={play} style={styles.playBtn}>
            <Ionicons
              name={isThisArtist && playing ? 'pause' : 'play'}
              size={26}
              color="#000"
              style={{ marginLeft: isThisArtist && playing ? 0 : 3 }}
            />
          </Pressable>
        </View>

        {top.isLoading ? <ActivityIndicator color={t.colors.text} style={{ marginTop: t.space.xl }} /> : null}
        {popular.length ? (
          <View style={{ marginTop: t.space.lg }}>
            <SectionTitle title="Popular" />
            {popular.slice(0, more ? 10 : 5).map((track, i) => (
              <TrackRow
                key={track.Id}
                track={track}
                rank={i + 1}
                art
                active={track.Id === currentId}
                playing={playing}
                onPress={() => usePlayer.getState().playQueue(popular, { startIndex: i, source })}
              />
            ))}
            {popular.length > 5 ? (
              <Pressable onPress={() => setMore(!more)} style={styles.seeMore}>
                <T variant="caption" style={{ fontFamily: t.fonts.bold }}>
                  {more ? 'Show less' : 'See more'}
                </T>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Shelf title="Discography" items={full} />
        <Shelf title="Singles and EPs" items={singles} />
        <Shelf title="Appears on" items={appearsOn.data} />
        <Shelf title="Fans also like" items={similar.data} size={130} />

        {a?.Overview ? (
          <View style={{ marginTop: t.space.xl }}>
            <SectionTitle title="About" />
            <T variant="caption" style={{ paddingHorizontal: t.space.lg, lineHeight: t.size(20) }}>
              {a.Overview}
            </T>
          </View>
        ) : null}
      </ScrollView>

      <Pressable onPress={() => router.back()} hitSlop={10} style={[styles.back, { top: insets.top + t.space.sm }]}>
        <Ionicons name="chevron-back" size={24} color={t.colors.text} />
      </Pressable>
    </View>
  );
}

const StyleHero = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const;

const useStyles = makeStyles((t) => ({
  hero: { height: 340, justifyContent: 'flex-end', overflow: 'hidden' },
  name: {
    fontFamily: t.fonts.black,
    fontSize: t.size(44),
    lineHeight: t.size(48),
    letterSpacing: -1.2,
    color: t.colors.text,
    paddingHorizontal: t.space.lg,
    paddingBottom: t.space.md,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.lg,
    paddingHorizontal: t.space.lg,
    marginTop: t.space.sm,
  },
  likeBtn: {
    paddingHorizontal: t.space.md,
    height: 32,
    justifyContent: 'center',
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seeMore: { alignSelf: 'flex-start', marginLeft: t.space.lg, marginTop: t.space.sm, paddingVertical: t.space.xs },
  back: {
    position: 'absolute',
    left: t.space.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
