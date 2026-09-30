import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BaseItem, GenreCount } from '@/api/jellyfin';
import { useGenreCounts } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { kindLine } from '@/lib/items';
import { tracksOf } from '@/library/actions';
import { usePlayer, type QueueSource } from '@/player/store';
import { ensureSearchIndex, useSearchIndex } from '@/search/index';
import { genreItem, useRecentSearches } from '@/search/recent';
import { useSearchResults, type Filter, type SearchResults } from '@/search/useSearch';
import { Artwork } from '@/ui/Artwork';
import { GenreTile, useGenreColor } from '@/ui/GenreTile';
import { Chip } from '@/ui/ItemRow';
import { openGenre, openItem } from '@/ui/nav';
import { openMenu } from '@/ui/overlays';
import { SectionTitle, Shelf } from '@/ui/Shelf';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';
import { TrackRow } from '@/ui/TrackRow';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'songs', label: 'Songs' },
  { key: 'artists', label: 'Artists' },
  { key: 'albums', label: 'Albums' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'genres', label: 'Genres' },
];
const BROWSE_FIRST = 40;

/** Open a result and remember it in Recent searches. Songs play (with `queue` after them). */
function openResult(item: BaseItem, queue?: BaseItem[], term?: string) {
  useRecentSearches.getState().add(item);
  if (item.Type === 'Genre') return openGenre(item.Name);
  if (item.Type === 'Audio') {
    const list = queue?.length ? queue : [item];
    const source: QueueSource = { type: 'search', name: term ? `“${term}”` : 'Search' };
    return usePlayer.getState().playQueue(list, { startIndex: Math.max(0, list.indexOf(item)), source });
  }
  openItem(item);
}

/** Play whatever the top result is: a song, an album, an artist's popular songs, a playlist. */
async function playResult(item: BaseItem) {
  const client = useAuth.getState().client;
  if (!client) return;
  useRecentSearches.getState().add(item);
  const tracks = item.Type === 'MusicArtist' ? await client.getTopTracks(item.Id, 10) : await tracksOf(item);
  if (!tracks.length) return;
  const type =
    item.Type === 'MusicArtist' ? 'artist' : item.Type === 'MusicAlbum' ? 'album' : item.Type === 'Playlist' ? 'playlist' : 'tracks';
  usePlayer.getState().playQueue(tracks, { source: { type, id: item.Id, name: item.Name } });
}

export default function SearchScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const input = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [focused, setFocused] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  // Search once typing pauses; clearing the box is instant.
  useEffect(() => {
    const id = setTimeout(() => setTerm(text.trim()), text.trim() ? 220 : 0);
    return () => clearTimeout(id);
  }, [text]);

  useEffect(() => {
    void ensureSearchIndex();
  }, []);

  const active = focused || text.length > 0;
  const cancel = () => {
    setText('');
    setFilter('all');
    input.current?.blur();
    Keyboard.dismiss();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={{ paddingTop: insets.top + t.space.md, paddingHorizontal: t.space.lg }}>
        {!active ? (
          <T variant="display" style={{ marginBottom: t.space.lg }}>
            Search
          </T>
        ) : null}
        <View style={styles.barRow}>
          <View style={[styles.bar, active && styles.barActive]}>
            <Ionicons name="search" size={20} color={active ? t.colors.text : '#000'} />
            <TextInput
              ref={input}
              value={text}
              onChangeText={setText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="What do you want to listen to?"
              placeholderTextColor={active ? t.colors.textMuted : '#555'}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              keyboardAppearance="dark"
              selectionColor={t.colors.accent}
              style={[styles.input, { color: active ? t.colors.text : '#000' }]}
            />
            {text ? (
              <Pressable
                hitSlop={10}
                accessibilityLabel="Clear search"
                onPress={() => {
                  setText('');
                  input.current?.focus();
                }}>
                <Ionicons name="close" size={20} color={t.colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          {active ? (
            <Pressable hitSlop={8} onPress={cancel}>
              <T variant="bodyStrong">Cancel</T>
            </Pressable>
          ) : null}
        </View>
      </View>
      {term ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: t.space.sm, paddingHorizontal: t.space.lg, paddingVertical: t.space.md }}>
          {FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </ScrollView>
      ) : null}
      {term ? <Results term={term} filter={filter} /> : active ? <RecentSearches /> : <BrowseAll />}
    </View>
  );
}

// ---- Browse all (nothing typed) ----

function BrowseAll() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const genres = useGenreCounts();
  const [all, setAll] = useState(false);
  const list = genres.data ?? [];
  const shown = all ? list : list.slice(0, BROWSE_FIRST);
  const gap = t.space.md;
  const tileW = Math.floor((width - t.space.lg * 2 - gap) / 2);
  return (
    <FlatList
      data={shown}
      keyExtractor={(g) => g.name}
      numColumns={2}
      columnWrapperStyle={{ gap, paddingHorizontal: t.space.lg }}
      contentContainerStyle={{ gap, paddingTop: t.space.md, paddingBottom: t.space.xl }}
      keyboardDismissMode="on-drag"
      ListHeaderComponent={<SectionTitle title="Browse all" />}
      ListEmptyComponent={
        genres.isLoading ? (
          <ActivityIndicator color={t.colors.text} style={{ marginTop: t.space.xl }} />
        ) : (
          <T variant="caption" style={{ textAlign: 'center', padding: t.space.xl }}>
            {genres.error ? 'Couldn’t load genres.' : 'No genres in this library yet.'}
          </T>
        )
      }
      ListFooterComponent={
        list.length > BROWSE_FIRST ? (
          <Pressable onPress={() => setAll(!all)} style={{ alignSelf: 'center', padding: t.space.md }}>
            <T variant="caption" style={{ fontFamily: t.fonts.bold }}>
              {all ? 'Show fewer genres' : `Show all ${list.length} genres`}
            </T>
          </Pressable>
        ) : null
      }
      renderItem={({ item }) => <GenreTile genre={item} width={tileW} height={Math.round(tileW * 0.56)} />}
    />
  );
}

// ---- Recent searches (focused, nothing typed) ----

function RecentSearches() {
  const t = useTheme();
  const items = useRecentSearches((s) => s.items);
  if (!items.length) {
    return (
      <View style={{ alignItems: 'center', paddingTop: t.space.xxl, paddingHorizontal: t.space.xl }}>
        <T variant="heading" style={{ textAlign: 'center' }}>
          Play what you love
        </T>
        <T variant="caption" style={{ textAlign: 'center', marginTop: t.space.sm }}>
          Search for songs, artists, albums, playlists and genres. Typos are fine.
        </T>
      </View>
    );
  }
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingBottom: t.space.xl }}>
      <View style={{ marginTop: t.space.md }}>
        <SectionTitle title="Recent searches" />
      </View>
      {items.map((item) => (
        <ResultRow
          key={item.Id}
          item={item}
          onPress={() => openResult(item)}
          trailing={
            <Pressable
              hitSlop={10}
              accessibilityLabel={`Remove ${item.Name} from recent searches`}
              onPress={() => useRecentSearches.getState().remove(item.Id)}>
              <Ionicons name="close" size={20} color={t.colors.textSecondary} />
            </Pressable>
          }
        />
      ))}
      <Pressable
        onPress={() => useRecentSearches.getState().clear()}
        style={({ pressed }) => ({
          alignSelf: 'center',
          marginTop: t.space.lg,
          paddingHorizontal: t.space.lg,
          height: 36,
          justifyContent: 'center',
          borderRadius: t.radius.pill,
          borderWidth: 1,
          borderColor: t.colors.textMuted,
          opacity: pressed ? 0.7 : 1,
        })}>
        <T variant="bodyStrong" style={{ fontSize: t.size(13) }}>
          Clear recent searches
        </T>
      </Pressable>
    </ScrollView>
  );
}

// ---- Results ----

function Results({ term, filter }: { term: string; filter: Filter }) {
  const t = useTheme();
  const results = useSearchResults(term, filter);
  const indexMissing = useSearchIndex((s) => !s.index && s.syncing);
  const data = results.data;

  if (!data) {
    return results.error ? (
      <T variant="caption" style={{ padding: t.space.xl, textAlign: 'center' }}>
        Search failed: {results.error.message}
      </T>
    ) : (
      <ActivityIndicator color={t.colors.text} style={{ marginTop: t.space.xl }} />
    );
  }

  const empty =
    !data.songs.length && !data.artists.length && !data.albums.length && !data.playlists.length && !data.genres.length;
  const footer = indexMissing ? (
    <T variant="caption" style={{ textAlign: 'center', padding: t.space.lg }}>
      Typo matching is still getting ready. This only happens the first time.
    </T>
  ) : null;

  if (empty && !results.isPlaceholderData) {
    return (
      <View style={{ alignItems: 'center', paddingTop: t.space.xxl, paddingHorizontal: t.space.xl }}>
        <T variant="heading" style={{ textAlign: 'center' }}>
          No results for “{term}”
        </T>
        <T variant="caption" style={{ textAlign: 'center', marginTop: t.space.sm }}>
          Try fewer words, or a different one.
        </T>
        {footer}
      </View>
    );
  }

  if (filter === 'all') return <AllResults data={data} term={term} footer={footer} />;

  if (filter === 'genres') {
    return (
      <FlatList
        data={data.genres}
        keyExtractor={(g) => g.name}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: t.space.xl }}
        ListFooterComponent={footer}
        renderItem={({ item }) => <GenreRow genre={item} />}
      />
    );
  }

  const list = data[filter];
  return (
    <FlatList
      data={list}
      keyExtractor={(x) => x.Id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingBottom: t.space.xl }}
      ListFooterComponent={footer}
      renderItem={({ item }) =>
        filter === 'songs' ? (
          <SongRow track={item} onPress={() => openResult(item, list, term)} />
        ) : (
          <ResultRow item={item} onPress={() => openResult(item)} />
        )
      }
    />
  );
}

function AllResults({ data, term, footer }: { data: SearchResults; term: string; footer: ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingBottom: t.space.xl }}>
      {data.top ? <TopResult item={data.top} songs={data.songs} term={term} /> : null}
      {data.songs.length ? (
        <View style={{ marginTop: t.space.xl }}>
          <SectionTitle title="Songs" />
          {data.songs.slice(0, 4).map((s) => (
            <SongRow key={s.Id} track={s} onPress={() => openResult(s, data.songs, term)} />
          ))}
        </View>
      ) : null}
      <Shelf title="Artists" items={data.artists} size={120} onItemPress={(x) => openResult(x)} />
      <Shelf title="Albums" items={data.albums} size={140} onItemPress={(x) => openResult(x)} />
      <Shelf title="Playlists" items={data.playlists} size={140} onItemPress={(x) => openResult(x)} />
      {data.genres.length ? (
        <View style={{ marginTop: t.space.xl }}>
          <SectionTitle title="Genres" />
          <FlatList
            horizontal
            data={data.genres}
            keyExtractor={(g) => g.name}
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: t.space.lg, gap: t.space.md }}
            renderItem={({ item }) => (
              <GenreTile genre={item} width={150} height={86} onPress={() => openResult(genreItem(item.name))} />
            )}
          />
        </View>
      ) : null}
      {footer}
    </ScrollView>
  );
}

/** The big card at the top of "All": the best match, with a play button. */
function TopResult({ item, songs, term }: { item: BaseItem; songs: BaseItem[]; term: string }) {
  const t = useTheme();
  const styles = useStyles();
  const round = item.Type === 'MusicArtist';
  return (
    <View style={{ paddingHorizontal: t.space.lg, marginTop: t.space.sm }}>
      <View style={{ marginHorizontal: -t.space.lg }}>
        <SectionTitle title="Top result" />
      </View>
      <Pressable
        onPress={() => openResult(item, item.Type === 'Audio' ? songs : undefined, term)}
        onLongPress={() => openMenu(item)}
        delayLongPress={350}
        style={({ pressed }) => [styles.topCard, pressed && { backgroundColor: t.colors.surface3 }]}>
        <Artwork item={item} size={92} rounded={round ? 46 : undefined} />
        <T variant="title" numberOfLines={2} style={{ marginTop: t.space.md, marginRight: 56 }}>
          {item.Name}
        </T>
        <T variant="caption" numberOfLines={1} style={{ marginTop: 2, marginRight: 64 }}>
          {kindLine(item)}
        </T>
        <Pressable
          accessibilityLabel={`Play ${item.Name}`}
          onPress={() => void playResult(item)}
          style={({ pressed }) => [styles.topPlay, pressed && { transform: [{ scale: 0.94 }] }]}>
          <Ionicons name="play" size={24} color="#000" style={{ marginLeft: 3 }} />
        </Pressable>
      </Pressable>
    </View>
  );
}

function SongRow({ track, onPress }: { track: BaseItem; onPress: () => void }) {
  const currentId = usePlayer((s) => s.queue[s.index]?.item.Id);
  const playing = usePlayer((s) => s.playing);
  return <TrackRow track={track} art active={track.Id === currentId} playing={playing} onPress={onPress} />;
}

/** One row in Recent searches or a filtered result list. */
function ResultRow({ item, onPress, trailing }: { item: BaseItem; onPress: () => void; trailing?: ReactNode }) {
  const t = useTheme();
  const isGenre = item.Type === 'Genre';
  return (
    <Pressable
      onPress={onPress}
      onLongPress={isGenre ? undefined : () => openMenu(item)}
      delayLongPress={350}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: t.space.lg,
        paddingVertical: t.space.sm,
        backgroundColor: pressed ? t.colors.surface : 'transparent',
      })}>
      {isGenre ? (
        <GenreSwatch name={item.Name} />
      ) : (
        <Artwork item={item} size={56} rounded={item.Type === 'MusicArtist' ? 28 : undefined} />
      )}
      <View style={{ flex: 1, marginLeft: t.space.md, marginRight: trailing ? t.space.md : 0 }}>
        <T variant="bodyStrong" numberOfLines={1}>
          {item.Name}
        </T>
        <T variant="caption" numberOfLines={1}>
          {kindLine(item)}
        </T>
      </View>
      {trailing}
    </Pressable>
  );
}

function GenreRow({ genre }: { genre: GenreCount }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => openResult(genreItem(genre.name))}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: t.space.lg,
        paddingVertical: t.space.sm,
        backgroundColor: pressed ? t.colors.surface : 'transparent',
      })}>
      <GenreSwatch name={genre.name} genre={genre} />
      <View style={{ flex: 1, marginLeft: t.space.md }}>
        <T variant="bodyStrong" numberOfLines={1}>
          {genre.name}
        </T>
        <T variant="caption" numberOfLines={1}>
          {`Genre · ${genre.count} album${genre.count === 1 ? '' : 's'}`}
        </T>
      </View>
    </Pressable>
  );
}

/** A genre's colour square with its cover album inset, for list rows. */
function GenreSwatch({ name, genre }: { name: string; genre?: GenreCount }) {
  const t = useTheme();
  const all = useGenreCounts().data;
  const g = genre ?? all?.find((x) => x.name === name);
  const color = useGenreColor(g, name);
  return (
    <View
      style={{
        width: 56,
        height: 56,
        borderRadius: t.radius.art,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
      {g?.album ? <Artwork item={g.album} size={34} rounded={3} /> : <Ionicons name="pricetag" size={22} color="#fff" />}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  barRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  bar: {
    flex: 1,
    height: 46,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.space.md,
    gap: t.space.sm,
  },
  barActive: { backgroundColor: t.colors.surface3 },
  input: { flex: 1, height: '100%', fontFamily: t.fonts.medium, fontSize: t.size(15), outlineWidth: 0 },
  topCard: {
    padding: t.space.lg,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface2,
  },
  topPlay: {
    position: 'absolute',
    right: t.space.lg,
    bottom: t.space.lg,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: t.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
