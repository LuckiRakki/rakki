// Keeps the Home Screen and Lock Screen widgets (layouts.tsx) up to date: the song playing or
// played last, the albums played recently, and (2.0) Open Player, Up Next, the first Daily Mix,
// Like and the sleep timer. Shuffle All has nothing to show but its button. Widgets can't reach the server, so their album
// art is saved into the folder they share with the app. Builds from before widgets existed
// (still getting over-the-air updates) have no native side, so everything here is guarded.
import { requireOptionalNativeModule } from 'expo';
import { Directory, File } from 'expo-file-system';
import type { Widget } from 'expo-widgets';
import { AppState } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { queryClient } from '@/api/queries';
import { useAppearance } from '@/appearance/store';
import { useAuth } from '@/auth/store';
import { localArtUri } from '@/downloads/store';
import { blurhashAverage, blurhashColors } from '@/lib/blurhash';
import { mix, tileColor, widgetGradient } from '@/lib/color';
import { ticksToSeconds } from '@/lib/format';
import { artistLine } from '@/lib/items';
import { displayName, isMix, mixArtists, mixNumber } from '@/lib/mixes';
import { isOffline } from '@/lib/online';
import { engine } from '@/player/engine';
import { useSleepTimer } from '@/player/sleep';
import { usePlayer } from '@/player/store';
import type {
  DailyMixProps,
  JumpBackInProps,
  LikeProps,
  NowPlayingProps,
  OpenPlayerProps,
  ShuffleAllProps,
  SleepTimerProps,
  UpNextProps,
  WidgetAlbum,
} from '@/widgets/layouts';

const available = !!requireOptionalNativeModule('ExpoWidgets');

let started = false;
let folder: Directory | null = null;
let nowPlaying: Widget<NowPlayingProps> | null = null;
let jumpBackIn: Widget<JumpBackInProps> | null = null;
let openPlayerWidget: Widget<OpenPlayerProps> | null = null;
let upNext: Widget<UpNextProps> | null = null;
let dailyMix: Widget<DailyMixProps> | null = null;
let like: Widget<LikeProps> | null = null;
let sleepTimer: Widget<SleepTimerProps> | null = null;

/** Art files each widget is showing; anything else in the folder is left over and removed. */
const shown = { nowPlaying: new Set<string>(), jumpBackIn: new Set<string>() };
/** What each widget was last given, to skip reloading it with the same thing. */
const lastSent = new Map<string, string>();

export function startWidgets() {
  if (!available || started) return;
  started = true;
  void (async () => {
    const [{ createWidget, widgetsDirectory }, layouts] = await Promise.all([
      import('expo-widgets'),
      import('@/widgets/layouts'),
    ]);
    // No shared folder means the app group is missing; the widgets would have nothing to read.
    if (!widgetsDirectory) return;
    folder = new Directory(widgetsDirectory);
    nowPlaying = createWidget('NowPlaying', layouts.NowPlayingLayout);
    jumpBackIn = createWidget('JumpBackIn', layouts.JumpBackInLayout);
    openPlayerWidget = createWidget('OpenPlayer', layouts.OpenPlayerLayout);
    upNext = createWidget('UpNext', layouts.UpNextLayout);
    dailyMix = createWidget('DailyMix', layouts.DailyMixLayout);
    like = createWidget('Like', layouts.LikeLayout);
    sleepTimer = createWidget('SleepTimer', layouts.SleepTimerLayout);
    const shuffleAll = createWidget<ShuffleAllProps>('ShuffleAll', layouts.ShuffleAllLayout);
    send('shuffleAll', shuffleAll, [{ date: new Date(), props: {} }]);
    watch();
    scheduleNowPlaying();
    pushUpNext();
    pushSleep();
    void refreshJumpBackIn();
    void refreshDailyMix();
  })();
}

function watch() {
  usePlayer.subscribe((s, prev) => {
    const current = s.queue[s.index];
    const before = prev.queue[prev.index];
    if (current?.key !== before?.key || s.playing !== prev.playing) scheduleNowPlaying();
    else if (current?.item.UserData?.IsFavorite !== before?.item.UserData?.IsFavorite) pushLike();
    if (s.queue !== prev.queue || s.index !== prev.index || s.repeat !== prev.repeat) pushUpNext();
  });

  useSleepTimer.subscribe((s, prev) => {
    if (s.endsAt !== prev.endsAt || s.endOfSong !== prev.endOfSong) pushSleep();
  });

  // The backgrounds follow Look's Glass setting.
  useAppearance.subscribe((s, prev) => {
    if (s.glass === prev.glass) return;
    scheduleNowPlaying(0);
    void refreshJumpBackIn();
  });

  useAuth.subscribe((s, prev) => {
    if (s.session?.userId === prev.session?.userId) return;
    scheduleNowPlaying();
    void refreshJumpBackIn();
    void refreshDailyMix();
  });

  // Home's "Jump back in" list, whenever it's fetched (online only: offline it's the downloads).
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    const [name, userId, ...rest] = event.query.queryKey;
    if (userId !== useAuth.getState().session?.userId || rest[rest.length - 1] !== 'online') return;
    if (name === 'recentlyPlayed') void pushJumpBackIn(event.query.state.data as BaseItem[]);
    // The Daily Mixes are among the playlists (lib/mixes.ts).
    else if (name === 'playlists' && rest.length === 1) pushDailyMix(event.query.state.data as BaseItem[]);
  });

  // Leaving the app: catch up on seeks (the progress bar runs on its own from start to end)
  // and on what was played since.
  AppState.addEventListener('change', (state) => {
    if (state !== 'background') return;
    scheduleNowPlaying(0);
    void refreshJumpBackIn();
  });
}

// ---- Now Playing ----

let nowPlayingTimer: ReturnType<typeof setTimeout> | null = null;

/** Skipping through songs quickly sends one update, not one per song. */
function scheduleNowPlaying(delayMs = 500) {
  if (nowPlayingTimer) clearTimeout(nowPlayingTimer);
  nowPlayingTimer = setTimeout(() => void pushNowPlaying(), delayMs);
}

async function pushNowPlaying() {
  const widget = nowPlaying;
  if (!widget) return;
  const client = useAuth.getState().client;
  const { queue, index, playing } = usePlayer.getState();
  const track = queue[index]?.item;
  const now = Date.now();
  if (!client || !track) {
    shown.nowPlaying.clear();
    send('nowPlaying', widget, [{ date: new Date(now), props: {} }]);
    if (openPlayerWidget) send('openPlayer', openPlayerWidget, [{ date: new Date(now), props: {} }]);
    pushLike();
    return;
  }

  shown.nowPlaying = new Set();
  const art = await saveArt(track, 400, shown.nowPlaying, { allowLocal: true });
  const colors = glassColors(widgetGradient(blurhashColors(client.blurhash(track)), track.AlbumId ?? track.Id));
  const base: NowPlayingProps = compact({
    title: track.Name,
    artist: artistLine(track),
    album: track.Album,
    art,
    color: tileColor(blurhashAverage(client.blurhash(track)), track.AlbumId ?? track.Id),
    colors,
  });
  if (openPlayerWidget) send('openPlayer', openPlayerWidget, [{ date: new Date(now), props: compact({ art, colors }) }]);
  pushLike();

  const progress = engine.getProgress();
  const duration = progress.duration > 0 ? progress.duration : ticksToSeconds(track.RunTimeTicks);
  if (playing && duration > 0) {
    const start = Math.round(now - progress.position * 1000);
    const end = Math.round(start + duration * 1000);
    // The Lock Screen ring can't run on its own like the bars, so it moves in steps: one
    // every 10 seconds, at most 60 for the song.
    const step = Math.max(10_000, Math.ceil((end - now) / 60));
    const entries: { date: Date; props: NowPlayingProps }[] = [];
    for (let at = now; at < end; at += step) {
      entries.push({ date: new Date(at), props: { ...base, playing: true, start, end, progress: fraction(at - start, end - start) } });
    }
    // If the app is closed mid-song nothing updates the widget, so it stops saying
    // "Now Playing" once the song would have ended.
    entries.push({ date: new Date(end + 5000), props: { ...base, playing: false, progress: 1 } });
    send('nowPlaying', widget, entries);
  } else {
    send('nowPlaying', widget, [{ date: new Date(now), props: { ...base, playing: false, progress: fraction(progress.position, duration) } }]);
  }
  removeLeftoverArt();
}

// ---- Jump Back In ----

/** Fetch the recently played albums (the cache subscription above then updates the widget). */
async function refreshJumpBackIn() {
  const client = useAuth.getState().client;
  const userId = useAuth.getState().session?.userId;
  if (!jumpBackIn) return;
  if (!client || !userId) {
    shown.jumpBackIn.clear();
    send('jumpBackIn', jumpBackIn, [{ date: new Date(), props: {} }]);
    return;
  }
  const key = ['recentlyPlayed', userId, 'online'];
  const cached = queryClient.getQueryData<BaseItem[]>(key);
  if (cached) await pushJumpBackIn(cached);
  if (isOffline()) return;
  // Same key and request as Home's shelf, so both share the answer.
  await queryClient
    .fetchQuery({ queryKey: key, queryFn: () => client.getRecentlyPlayedAlbums(14), staleTime: 2 * 60_000 })
    .catch(() => undefined);
}

async function pushJumpBackIn(items: BaseItem[] | undefined) {
  const widget = jumpBackIn;
  const client = useAuth.getState().client;
  if (!widget || !client || !items) return;
  const picked = items.slice(0, 6);
  const glass = useAppearance.getState().glass;
  const names = new Set<string>();
  shown.jumpBackIn = names;
  const albums: WidgetAlbum[] = await Promise.all(
    picked.map(async (album) =>
      compact({ id: album.Id, name: album.Name, artist: album.AlbumArtist ?? '', art: await saveArt(album, 300, names) }),
    ),
  );
  const first = picked[0];
  const color = first ? tileColor(blurhashAverage(client.blurhash(first)), first.Id) : undefined;
  const colors = first ? glassColors(widgetGradient(blurhashColors(client.blurhash(first)), first.Id), glass) : undefined;
  send('jumpBackIn', widget, [{ date: new Date(), props: compact({ albums, color, colors }) }]);
  removeLeftoverArt();
}

// ---- Up Next, Like, Daily Mix, Sleep Timer ----

function pushUpNext() {
  const widget = upNext;
  if (!widget) return;
  const { queue, index, repeat } = usePlayer.getState();
  const next = queue[index + 1] ?? (repeat === 'all' && queue.length > 1 ? queue[0] : undefined);
  const item = next?.item;
  send('upNext', widget, [{ date: new Date(), props: item ? compact({ title: item.Name, artist: artistLine(item) }) : {} }]);
}

function pushLike() {
  const widget = like;
  if (!widget) return;
  const { queue, index } = usePlayer.getState();
  const item = queue[index]?.item;
  const props: LikeProps = item && !item.Radio ? { title: item.Name, liked: !!item.UserData?.IsFavorite } : {};
  send('like', widget, [{ date: new Date(), props }]);
}

/** Fetch the playlists (the cache subscription above then updates the Daily Mix widget). */
async function refreshDailyMix() {
  const client = useAuth.getState().client;
  const userId = useAuth.getState().session?.userId;
  if (!dailyMix) return;
  if (!client || !userId) {
    send('dailyMix', dailyMix, [{ date: new Date(), props: {} }]);
    return;
  }
  const key = ['playlists', userId, 'online'];
  const cached = queryClient.getQueryData<BaseItem[]>(key);
  if (cached) pushDailyMix(cached);
  if (isOffline()) return;
  // Same key and request as Home's Daily Mixes shelf.
  await queryClient
    .fetchQuery({ queryKey: key, queryFn: async () => (await client.getPlaylists()).Items, staleTime: 10 * 60_000 })
    .catch(() => undefined);
}

function pushDailyMix(playlists: BaseItem[] | undefined) {
  const widget = dailyMix;
  if (!widget || !playlists) return;
  const first = playlists.filter(isMix).sort((a, b) => mixNumber(a) - mixNumber(b))[0];
  const props: DailyMixProps = first ? { number: mixNumber(first), name: displayName(first), artists: mixArtists(first) } : {};
  send('dailyMix', widget, [{ date: new Date(), props }]);
}

function pushSleep() {
  const widget = sleepTimer;
  if (!widget) return;
  const { endsAt, endOfSong } = useSleepTimer.getState();
  const now = Date.now();
  if (!endsAt || endsAt <= now) {
    send('sleepTimer', widget, [{ date: new Date(now), props: endOfSong ? { endOfSong: true } : {} }]);
    return;
  }
  // Full when it's set (or added to), emptying as it runs down.
  const total = Math.max(1, Math.ceil((endsAt - now) / 60_000));
  // A step a minute (at most 4 hours of them), then off.
  const entries: { date: Date; props: SleepTimerProps }[] = [];
  for (let at = now; at < endsAt && entries.length < 240; at += 60_000) {
    entries.push({ date: new Date(at), props: { left: Math.max(1, Math.ceil((endsAt - at) / 60_000)), total } });
  }
  entries.push({ date: new Date(endsAt), props: {} });
  send('sleepTimer', widget, entries);
}

// ---- Shared ----

/**
 * A widget background after Look's Glass setting: Frost smokes it, Clear keeps the cover's
 * colours and fades the bottom dark, Tint washes it in the album's colour.
 */
function glassColors(colors: string[], glass = useAppearance.getState().glass): string[] {
  const [top = '#2a2a2a', bottom = '#121212'] = colors;
  if (glass === 'clear') return [top, bottom, mix(bottom, '#000000', 0.55)];
  if (glass === 'tint') {
    const wash = mix('#000000', top, 0.3);
    return [mix(top, wash, 0.5), mix(bottom, wash, 0.62)];
  }
  return [mix(top, '#121216', 0.42), mix(bottom, '#121216', 0.42)];
}

function fraction(part: number, whole: number): number {
  return whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0;
}

function send<P extends object>(name: string, widget: Widget<P>, entries: { date: Date; props: P }[]) {
  const signature = JSON.stringify(entries.map((e) => e.props));
  if (lastSent.get(name) === signature) return;
  lastSent.set(name, signature);
  try {
    widget.updateTimeline(entries);
  } catch {
    lastSent.delete(name);
  }
}

/**
 * Save an album's art into the widgets' folder (small: widgets have little memory) and return
 * its file URL. Named after the art's tag, so changed art is fetched again. Offline (or if the
 * server doesn't answer) the downloaded copy can stand in, when `allowLocal`.
 */
async function saveArt(
  item: BaseItem,
  size: number,
  names: Set<string>,
  opts: { allowLocal?: boolean } = {},
): Promise<string | undefined> {
  const client = useAuth.getState().client;
  if (item.Radio) return saveRadioArt(item.Radio.coverUrl, names);
  const albumId = item.ImageTags?.Primary ? item.Id : item.AlbumId;
  const tag = item.ImageTags?.Primary ?? item.AlbumPrimaryImageTag;
  if (!folder || !client || !albumId) return undefined;
  const name = `art-${albumId}-${(tag ?? 'local').slice(0, 10)}-${size}.jpg`;
  // Claimed before it exists, so tidying up meanwhile doesn't delete it.
  names.add(name);
  const file = new File(folder, name);
  if (file.exists) return file.uri;
  const url = isOffline() ? undefined : client.imageUrl(item, size);
  if (url) {
    const saved = await File.downloadFileAsync(url, file, { idempotent: true }).then(
      () => true,
      () => false,
    );
    if (saved) return file.uri;
  }
  const local = opts.allowLocal ? localArtUri(albumId) : null;
  if (!local) return undefined;
  try {
    new File(local).copy(file);
    return file.uri;
  } catch {
    return undefined;
  }
}

/** The cover of the song on a radio station (from the station), named after its address. */
async function saveRadioArt(coverUrl: string | undefined, names: Set<string>): Promise<string | undefined> {
  if (!folder || !coverUrl || isOffline()) return undefined;
  let hash = 0;
  for (let i = 0; i < coverUrl.length; i++) hash = (hash * 31 + coverUrl.charCodeAt(i)) | 0;
  const name = `art-radio-${Math.abs(hash).toString(36)}.jpg`;
  names.add(name);
  const file = new File(folder, name);
  if (file.exists) return file.uri;
  const saved = await File.downloadFileAsync(coverUrl, file, { idempotent: true }).then(
    () => true,
    () => false,
  );
  return saved ? file.uri : undefined;
}

function removeLeftoverArt() {
  if (!folder) return;
  try {
    for (const entry of folder.list()) {
      if (!(entry instanceof File) || !entry.name.startsWith('art-')) continue;
      if (shown.nowPlaying.has(entry.name) || shown.jumpBackIn.has(entry.name)) continue;
      entry.delete();
    }
  } catch {
    // Left for next time.
  }
}

/** Without empty fields: widget data is saved as a property list, which can't hold null. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null)) as T;
}
