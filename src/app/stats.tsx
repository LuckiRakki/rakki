// History and Stats (Rakki 2.0): your listening time, top artists, albums and songs, and every
// song you played on any device. The Rakki plugin (0.5) records the plays, so every app shares them.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { JellyfinClient, RakkiHistoryEntry, RakkiStats, RakkiTop } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { playRandom } from '@/library/actions';
import { tick } from '@/lib/haptics';
import { usePlayer } from '@/player/store';
import {
  chartBars,
  compareLine,
  deviceKind,
  deviceLabel,
  groupByDay,
  hm,
  playTime,
  RANGES,
  rangeDays,
  type StatsRange,
} from '@/stats/format';
import { useRakkiHistory, useRakkiStats } from '@/stats/queries';
import { AwayImage as Image } from '@/ui/AwayImage';
import { Ionicons } from '@/ui/Icon';
import { Chip } from '@/ui/ItemRow';
import { openAlbum, openArtist } from '@/ui/nav';
import { Segmented } from '@/ui/Segmented';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

type Tab = 'stats' | 'history';

export default function StatsScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('stats');
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.page }}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={t.colors.text} />
        </Pressable>
        <T style={styles.title}>History and Stats</T>
      </View>
      <View style={{ paddingHorizontal: t.space.lg, paddingTop: t.space.sm }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'stats', label: 'Stats' },
            { value: 'history', label: 'History' },
          ]}
        />
      </View>
      {tab === 'stats' ? <StatsTab bottom={insets.bottom} /> : <HistoryTab bottom={insets.bottom} />}
    </View>
  );
}

function useClient(): JellyfinClient | null {
  return useAuth((s) => s.client);
}

function StatsTab({ bottom }: { bottom: number }) {
  const t = useTheme();
  const styles = useStyles();
  const client = useClient();
  const [range, setRange] = useState<StatsRange>('7');
  const days = rangeDays(range);
  const stats = useRakkiStats(client, days);

  const data = stats.data;
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottom + t.space.xxl }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {RANGES.map((r) => (
          <Chip key={r.value} label={r.label} active={range === r.value} onPress={() => setRange(r.value)} />
        ))}
      </ScrollView>
      {stats.isLoading ? (
        <ActivityIndicator color={t.colors.textSecondary} style={{ marginTop: t.space.xxl }} />
      ) : stats.isError ? (
        <Message icon="cloud-offline-outline" title="Couldn't Load Your Stats" body="Check your connection to your server and try again." />
      ) : data === null || data === undefined ? (
        <Message icon="server-outline" title="Needs the Rakki Plugin" body="History and Stats come from the Rakki plugin 0.5 or newer on your Jellyfin server." />
      ) : data.Plays === 0 && range === 'all' ? (
        <Empty />
      ) : (
        <StatsBody stats={data} range={range} />
      )}
    </ScrollView>
  );
}

function StatsBody({ stats, range }: { stats: RakkiStats; range: StatsRange }) {
  const t = useTheme();
  const styles = useStyles();
  const client = useClient();
  const compare = compareLine(stats, range);
  const maxArtist = Math.max(1, ...stats.TopArtists.map((a) => a.Plays));
  return (
    <>
      <View style={[styles.card, { marginTop: 14, gap: 14 }]}>
        <View style={{ gap: 2 }}>
          <T style={styles.tileLabel}>Listening Time</T>
          <T style={styles.hero}>{hm(stats.Minutes)}</T>
          {compare ? <T style={styles.tileSub}>{compare}</T> : null}
        </View>
        <Chart stats={stats} />
      </View>
      <View style={styles.tiles}>
        <Tile label="Songs" value={String(stats.Songs)} sub={`${stats.Plays} plays`} />
        <Tile label="Artists" value={String(stats.Artists)} sub={range === 'all' ? 'All time' : RANGES.find((r) => r.value === range)?.label ?? ''} />
        <Tile label="Streak" value={`${stats.Streak} ${stats.Streak === 1 ? 'day' : 'days'}`} sub={`Best: ${stats.BestStreak}`} />
      </View>

      {stats.TopArtists.length ? (
        <Section title="Top Artists">
          {stats.TopArtists.slice(0, 5).map((a, i) => (
            <Pressable key={a.Name} disabled={!a.Id} onPress={() => a.Id && openArtist(a.Id)} style={styles.topRow} accessibilityLabel={`${i + 1}. ${a.Name}, ${a.Plays} plays`}>
              <T style={styles.rank}>{i + 1}</T>
              <Cover uri={a.Id && client ? client.primaryImageUrl(a.Id, 120) : undefined} size={44} round />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <T numberOfLines={1} style={[styles.rowTitle, { flexShrink: 1 }]}>
                    {a.Name}
                  </T>
                  <T style={styles.plays}>{a.Plays} plays</T>
                </View>
                <View style={styles.meter}>
                  <View style={{ width: `${(a.Plays / maxArtist) * 100}%`, height: '100%', borderRadius: 2, backgroundColor: t.colors.accent }} />
                </View>
              </View>
            </Pressable>
          ))}
        </Section>
      ) : null}

      <TopList title="Top Albums" items={stats.TopAlbums} onPress={(a) => a.Id && openAlbum(a.Id)} image={(a) => (a.Id && client ? client.primaryImageUrl(a.Id, 120) : undefined)} />
      <TopList title="Top Songs" items={stats.TopSongs} onPress={(a) => a.Id && void playOne(client, a.Id)} image={(a) => (a.Id && client ? client.primaryImageUrl(a.Id, 120) : undefined)} />
    </>
  );
}

/** Listening time by day (or month): one series in the album colour, 4px rounded tops on a flat baseline. Tap a bar for its time. */
function Chart({ stats }: { stats: RakkiStats }) {
  const t = useTheme();
  const styles = useStyles();
  const bars = useMemo(() => chartBars(stats), [stats]);
  const [picked, setPicked] = useState<string | null>(null);
  const max = Math.max(30, ...bars.map((b) => b.minutes));
  const shown = bars.find((b) => b.key === picked);
  const thin = bars.length > 12;
  const label = `Listening time: ${bars.map((b) => `${b.title} ${hm(b.minutes)}`).join(', ')}`;
  return (
    <View accessible accessibilityLabel={label} style={{ gap: 8 }}>
      <T style={[styles.tileSub, { minHeight: 18 }]}>{shown ? `${shown.title}: ${hm(shown.minutes)}` : ' '}</T>
      <View style={{ height: 96, flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.18)' }}>
        {bars.map((b) => (
          <Pressable
            key={b.key}
            onPress={() => setPicked(picked === b.key ? null : b.key)}
            style={{ flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', borderRadius: 6, backgroundColor: picked === b.key ? 'rgba(255,255,255,0.05)' : 'transparent' }}>
            <View
              style={{
                width: thin ? '62%' : 22,
                maxWidth: '70%',
                height: `${(b.minutes / max) * 100}%`,
                minHeight: b.minutes > 0 ? 2 : 0,
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
                backgroundColor: t.colors.accent,
              }}
            />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {bars.map((b, i) => (
          <T
            key={b.key}
            numberOfLines={1}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: t.size(thin ? 9 : 11),
              fontFamily: b.today ? t.fonts.black : t.fonts.semibold,
              color: b.today ? t.colors.text : t.colors.textSecondary,
            }}>
            {thin && i % 5 !== 0 && !b.today ? '' : b.label}
          </T>
        ))}
      </View>
    </View>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  const styles = useStyles();
  return (
    <View style={[styles.card, styles.tile]}>
      <T style={styles.tileLabel}>{label}</T>
      <T numberOfLines={1} adjustsFontSizeToFit style={styles.tileValue}>
        {value}
      </T>
      <T numberOfLines={1} style={styles.tileSub}>
        {sub}
      </T>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  const styles = useStyles();
  return (
    <View style={{ marginTop: 22, paddingHorizontal: t.space.lg, gap: 12 }}>
      <T style={styles.sectionTitle}>{title}</T>
      {children}
    </View>
  );
}

function TopList({ title, items, onPress, image }: { title: string; items: RakkiTop[]; onPress: (a: RakkiTop) => void; image: (a: RakkiTop) => string | undefined }) {
  const styles = useStyles();
  if (!items.length) return null;
  return (
    <Section title={title}>
      {items.slice(0, 5).map((a, i) => (
        <Pressable key={`${a.Id ?? a.Name}`} onPress={() => onPress(a)} style={styles.topRow} accessibilityLabel={`${i + 1}. ${a.Name} by ${a.Artist}, ${a.Plays} plays`}>
          <T style={styles.rank}>{i + 1}</T>
          <Cover uri={image(a)} size={44} />
          <View style={{ flex: 1 }}>
            <T numberOfLines={1} style={styles.rowTitle}>
              {a.Name}
            </T>
            <T numberOfLines={1} style={styles.rowSub}>
              {a.Artist}
            </T>
          </View>
          <T style={styles.plays}>{a.Plays} plays</T>
        </Pressable>
      ))}
    </Section>
  );
}

function Cover({ uri, size, round }: { uri?: string; size: number; round?: boolean }) {
  const t = useTheme();
  return (
    <Image
      source={uri ? { uri } : undefined}
      style={{ width: size, height: size, borderRadius: round ? size / 2 : 6, backgroundColor: t.colors.surface3 }}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={uri}
    />
  );
}

async function playOne(client: JellyfinClient | null, id: string) {
  if (!client) return;
  tick();
  try {
    const item = await client.getItem(id);
    usePlayer.getState().playQueue([item], { source: { type: 'tracks', name: 'History' } });
  } catch {
    // Gone from the library: nothing to play.
  }
}

const PAGE = 50;

function HistoryTab({ bottom }: { bottom: number }) {
  const t = useTheme();
  const styles = useStyles();
  const client = useClient();
  const [query, setQuery] = useState('');
  const history = useRakkiHistory(client, PAGE);
  const pages = history.data?.pages;
  const missing = pages?.[0] === null;
  const all = useMemo(() => (pages ?? []).flatMap((p) => p ?? []), [pages]);
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((e) => `${e.Name} ${e.Artist} ${e.Album}`.toLowerCase().includes(q)) : all;
  const groups = useMemo(() => groupByDay(shown), [shown]);

  if (history.isLoading) return <ActivityIndicator color={t.colors.textSecondary} style={{ marginTop: t.space.xxl }} />;
  if (history.isError) return <Message icon="cloud-offline-outline" title="Couldn't Load Your History" body="Check your connection to your server and try again." />;
  if (missing) return <Message icon="server-outline" title="Needs the Rakki Plugin" body="History and Stats come from the Rakki plugin 0.5 or newer on your Jellyfin server." />;
  if (all.length === 0) return <Empty />;

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingBottom: bottom + t.space.xxl }}
      onScroll={(e) => {
        const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
        if (contentOffset.y + layoutMeasurement.height > contentSize.height - 600 && history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage();
      }}
      scrollEventThrottle={200}>
      <View style={styles.searchWell}>
        <Ionicons name="search-outline" size={18} color={t.colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search Your History"
          placeholderTextColor={t.colors.textSecondary}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      <View style={{ paddingHorizontal: t.space.lg }}>
        {groups.map((g) => (
          <View key={g.title}>
            <T style={styles.dayHead}>{g.title}</T>
            {g.entries.map((e) => (
              <HistoryRow key={`${e.Id}-${e.At}`} entry={e} />
            ))}
          </View>
        ))}
        {history.isFetchingNextPage ? <ActivityIndicator color={t.colors.textSecondary} style={{ marginVertical: t.space.lg }} /> : null}
      </View>
    </ScrollView>
  );
}

const DEVICE_ICON = { phone: 'phone-portrait-outline', desktop: 'desktop-outline', web: 'globe-outline', other: 'musical-notes' } as const;

function HistoryRow({ entry }: { entry: RakkiHistoryEntry }) {
  const t = useTheme();
  const styles = useStyles();
  const client = useClient();
  const when = playTime(entry);
  const now = when === 'Now';
  const art = entry.AlbumId && client ? client.primaryImageUrl(entry.AlbumId, 120) : undefined;
  return (
    <Pressable
      onPress={() => void playOne(client, entry.Id)}
      onLongPress={() => entry.AlbumId && openAlbum(entry.AlbumId)}
      accessibilityLabel={`${entry.Name} by ${entry.Artist}, ${when}. ${deviceLabel(entry)}`}
      style={({ pressed }) => [styles.historyRow, pressed && { opacity: 0.7 }]}>
      <Cover uri={art} size={48} />
      <View style={{ flex: 1 }}>
        <T numberOfLines={1} style={[styles.rowTitle, now && { color: t.colors.accentText }]}>
          {entry.Name}
        </T>
        <T numberOfLines={1} style={styles.rowSub}>
          {entry.Artist}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <T style={[styles.plays, { fontSize: t.size(12) }, now && { color: t.colors.accentText, fontFamily: t.fonts.bold }]}>{when}</T>
        <Ionicons name={DEVICE_ICON[deviceKind(entry)]} size={15} color={t.colors.textMuted} />
      </View>
    </Pressable>
  );
}

function Message({ icon, title, body }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string }) {
  const t = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.message}>
      <View style={styles.messageIcon}>
        <Ionicons name={icon} size={32} color={t.colors.textSecondary} />
      </View>
      <T style={styles.messageTitle}>{title}</T>
      <T style={styles.messageBody}>{body}</T>
    </View>
  );
}

/** Nothing recorded yet. */
function Empty() {
  const t = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.message}>
      <View style={styles.messageIcon}>
        <Ionicons name="stats-chart-outline" size={32} color={t.colors.textSecondary} />
      </View>
      <T style={styles.messageTitle}>Nothing Played Yet</T>
      <T style={styles.messageBody}>Play a few songs and your listening time, top artists and history show up here.</T>
      <Pressable
        onPress={() => {
          tick();
          void playRandom();
        }}
        style={({ pressed }) => [styles.shuffleBtn, pressed && { opacity: 0.8 }]}>
        <Ionicons name="shuffle" size={18} color={t.colors.bg} />
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(15), color: t.colors.bg }}>Shuffle Your Library</T>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 52, paddingHorizontal: t.space.sm },
  title: { fontFamily: t.fonts.black, fontSize: t.size(26), letterSpacing: -0.4 },
  chips: { gap: 8, paddingHorizontal: t.space.lg, paddingTop: 14 },
  card: { marginHorizontal: t.space.lg, padding: 16, borderRadius: 18, backgroundColor: t.colors.row },
  hero: { fontFamily: t.fonts.black, fontSize: t.size(34), letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 12, marginHorizontal: t.space.lg },
  tile: { flex: 1, marginHorizontal: 0, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, gap: 4 },
  tileLabel: { fontFamily: t.fonts.semibold, fontSize: t.size(13), color: t.colors.textSecondary },
  tileValue: { fontFamily: t.fonts.black, fontSize: t.size(22), letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  tileSub: { fontFamily: t.fonts.medium, fontSize: t.size(12), color: t.colors.textSecondary },
  sectionTitle: { fontFamily: t.fonts.black, fontSize: t.size(20), letterSpacing: -0.2 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { width: 18, textAlign: 'right', fontFamily: t.fonts.bold, fontSize: t.size(13), color: t.colors.textMuted, fontVariant: ['tabular-nums'] },
  rowTitle: { fontFamily: t.fonts.bold, fontSize: t.size(14) },
  rowSub: { fontFamily: t.fonts.medium, fontSize: t.size(12), color: t.colors.textSecondary, marginTop: 2 },
  plays: { fontFamily: t.fonts.semibold, fontSize: t.size(13), color: t.colors.textSecondary, fontVariant: ['tabular-nums'] },
  meter: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
  searchWell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    marginHorizontal: t.space.lg,
    marginTop: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  searchInput: { flex: 1, height: 40, fontFamily: t.fonts.medium, fontSize: t.size(15), color: t.colors.text },
  dayHead: { marginTop: 14, marginBottom: 4, fontFamily: t.fonts.bold, fontSize: t.size(13), color: t.colors.textSecondary },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  message: { alignItems: 'center', paddingHorizontal: 36, paddingTop: 80, gap: 12 },
  messageIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: t.colors.row, alignItems: 'center', justifyContent: 'center' },
  messageTitle: { marginTop: 6, fontFamily: t.fonts.black, fontSize: t.size(20), textAlign: 'center' },
  messageBody: { fontFamily: t.fonts.medium, fontSize: t.size(15), lineHeight: t.size(15) * 1.45, color: t.colors.textSecondary, textAlign: 'center' },
  shuffleBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    backgroundColor: t.colors.text,
  },
}));
