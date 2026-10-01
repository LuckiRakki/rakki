import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BaseItem } from '@/api/jellyfin';
import { useAppearsOn, useArtistAlbums, useArtistPopular, useItem, useSimilar, useTopTracks } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { artColor } from '@/lib/blurhash';
import { setLiked, startRadio } from '@/library/actions';
import { offlineArtistTracks } from '@/downloads/offline';
import { isSingleOrEp } from '@/lib/items';
import { formatCount } from '@/lib/lastfm';
import { isOffline, useOffline } from '@/lib/online';
import { usePlayer } from '@/player/store';
import { useSettings, type PopularSort } from '@/settings/store';
import { StickyTitleBar, useScrollY } from '@/ui/CollapsingHeader';
import { artistGenres, GenreChips } from '@/ui/GenreChips';
import { openReleases } from '@/ui/nav';
import { openOptions, showToast } from '@/ui/overlays';
import { OfflineUnavailable } from '@/ui/OfflineUnavailable';
import { Shelf, SectionTitle } from '@/ui/Shelf';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { TrackRow } from '@/ui/TrackRow';

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
  const lastfm = useArtistPopular(id, artist.data?.Name);
  const offline = useOffline();
  const hasKey = useSettings((s) => s.lastfmApiKey.trim().length > 0);
  const popularSort = useSettings((s) => s.popularSort);
  const currentId = usePlayer((s) => s.queue[s.index]?.item.Id);
  const playing = usePlayer((s) => s.playing);
  const isThisArtist = usePlayer((s) => s.source?.type === 'artist' && s.source.id === id);
  const [more, setMore] = useState(false);
  const { y, onScroll } = useScrollY();
  // The photo drifts slower than the page (parallax) and stretches when you pull down.
  const heroMotion = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(y.value, [-200, 0, 340], [-100, 0, 120], Extrapolation.CLAMP) },
      { scale: interpolate(y.value, [-200, 0], [1.6, 1], Extrapolation.CLAMP) },
    ],
  }));

  const a = artist.data;
  const cover = a && client ? (client.backdropUrl(a, 1200) ?? client.imageUrl(a, 800)) : undefined;
  const blurhash = a && client ? client.blurhash(a) : undefined;
  const tint = artColor(blurhash);
  const liked = a?.UserData?.IsFavorite ?? false;
  const source = { type: 'artist' as const, id, name: a?.Name ?? 'Artist' };
  // Popular: Last.fm's worldwide order and counts when set up and online, otherwise your plays.
  const byLastfm = popularSort === 'lastfm' && hasKey && !offline && !!lastfm.data?.length;
  const rows: { track: BaseItem; subtitle: string }[] = byLastfm
    ? lastfm.data!.map((x) => ({ track: x.track, subtitle: `${formatCount(x.playcount)} plays` }))
    : (top.data ?? []).map((track) => ({ track, subtitle: myPlays(track) }));
  const popular = rows.map((r) => r.track);
  const popularLoading = popularSort === 'lastfm' && hasKey && !offline ? lastfm.isLoading : top.isLoading;

  function chooseSort() {
    openOptions({
      title: 'Sort popular songs by',
      options: [
        { key: 'lastfm', label: 'Popular worldwide (Last.fm)' },
        { key: 'mine', label: 'My plays' },
      ],
      selected: popularSort,
      onSelect: (key) => {
        if (key === 'lastfm' && !hasKey) showToast('Add a Last.fm API key in Settings first');
        useSettings.getState().set('popularSort', key as PopularSort);
      },
    });
  }
  const full = albums.data?.filter((x) => !isSingleOrEp(x)) ?? [];
  const singles = albums.data?.filter((x) => isSingleOrEp(x)) ?? [];

  function play() {
    if (isThisArtist) return usePlayer.getState().toggle();
    if (popular.length) usePlayer.getState().playQueue(popular, { source });
  }

  async function shuffle() {
    if (!client) return;
    const all = isOffline()
      ? offlineArtistTracks(id)
      : (await client.items({ IncludeItemTypes: 'Audio', ArtistIds: id, Limit: 500 })).Items;
    if (all.length) usePlayer.getState().playQueue(all, { source, shuffle: true });
  }

  // Offline with no songs by this artist on the phone.
  if (artist.data === null) return <OfflineUnavailable />;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: t.space.xxl }}>
        <View style={[styles.hero, { backgroundColor: t.tint(tint) }]}>
          {cover ? (
            <Animated.View style={[StyleHero, heroMotion]}>
              <Image
                source={{ uri: cover }}
                placeholder={blurhash ? { blurhash } : undefined}
                style={StyleHero}
                contentFit="cover"
                transition={200}
              />
            </Animated.View>
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
        <View style={{ paddingHorizontal: t.space.lg, marginTop: -t.space.sm }}>
          <GenreChips genres={artistGenres(a?.Genres, albums.data)} />
        </View>

        {popularLoading ? <ActivityIndicator color={t.colors.text} style={{ marginTop: t.space.xl }} /> : null}
        {popular.length ? (
          <View style={{ marginTop: t.space.lg }}>
            <View style={styles.popularHead}>
              <T variant="heading" style={{ flex: 1 }}>
                Popular
              </T>
              <Pressable
                hitSlop={8}
                onPress={chooseSort}
                accessibilityLabel={`Sort by ${byLastfm ? 'Last.fm plays' : 'my plays'}`}
                style={styles.sort}>
                <Ionicons name="swap-vertical" size={15} color={t.colors.text} />
                <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(13) }}>{byLastfm ? 'Last.fm' : 'My plays'}</T>
              </Pressable>
            </View>
            {rows.slice(0, more ? 10 : 5).map(({ track, subtitle }, i) => (
              <TrackRow
                key={track.Id}
                track={track}
                rank={i + 1}
                art
                subtitle={subtitle}
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
            {byLastfm ? (
              <T variant="caption" style={styles.source}>
                Worldwide plays from Last.fm
              </T>
            ) : popularSort === 'lastfm' && hasKey && !offline && lastfm.isError ? (
              <T variant="caption" style={styles.source}>
                Couldn’t get Last.fm play counts, so these are your plays
              </T>
            ) : null}
          </View>
        ) : null}

        <Shelf title="Discography" items={full} onShowAll={full.length > 3 ? () => openReleases(id, 'albums') : undefined} />
        <Shelf
          title="Singles and EPs"
          items={singles}
          onShowAll={singles.length > 3 ? () => openReleases(id, 'singles') : undefined}
        />
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
      </Animated.ScrollView>
      <StickyTitleBar y={y} title={a?.Name ?? ''} color={t.tint(tint)} showAt={300} />

      <Pressable onPress={() => router.back()} hitSlop={10} style={[styles.back, { top: insets.top + t.space.sm }]}>
        <Ionicons name="chevron-back" size={24} color={t.colors.text} />
      </Pressable>
    </View>
  );
}

const StyleHero = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const;

/** "12 plays", "1 play", "Not played yet": your own plays of a song. */
function myPlays(track: BaseItem): string {
  const n = track.UserData?.PlayCount ?? 0;
  if (!n) return 'Not played yet';
  return n === 1 ? '1 play' : `${formatCount(n)} plays`;
}

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
  popularHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg, marginBottom: t.space.md },
  sort: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  source: { paddingHorizontal: t.space.lg, marginTop: t.space.sm, fontSize: t.size(11), color: t.colors.textMuted },
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
