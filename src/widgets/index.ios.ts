// Keeps the Home Screen and Lock Screen widgets (layouts.tsx) up to date: the song playing or
// played last, and the albums played recently. Widgets can't reach the server, so their album
// art is saved into the folder they share with the app. Builds from before widgets existed
// (still getting over-the-air updates) have no native side, so everything here is guarded.
import { requireOptionalNativeModule } from 'expo';
import { Directory, File } from 'expo-file-system';
import type { Widget } from 'expo-widgets';
import { AppState } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { queryClient } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { localArtUri } from '@/downloads/store';
import { blurhashAverage } from '@/lib/blurhash';
import { tileColor } from '@/lib/color';
import { ticksToSeconds } from '@/lib/format';
import { artistLine } from '@/lib/items';
import { isOffline } from '@/lib/online';
import { engine } from '@/player/engine';
import { usePlayer } from '@/player/store';
import type { JumpBackInProps, NowPlayingProps, WidgetAlbum } from '@/widgets/layouts';

const available = !!requireOptionalNativeModule('ExpoWidgets');

let started = false;
let folder: Directory | null = null;
let nowPlaying: Widget<NowPlayingProps> | null = null;
let jumpBackIn: Widget<JumpBackInProps> | null = null;

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
    watch();
    scheduleNowPlaying();
    void refreshJumpBackIn();
  })();
}

function watch() {
  usePlayer.subscribe((s, prev) => {
    if (s.queue[s.index]?.key !== prev.queue[prev.index]?.key || s.playing !== prev.playing) scheduleNowPlaying();
  });

  useAuth.subscribe((s, prev) => {
    if (s.session?.userId === prev.session?.userId) return;
    scheduleNowPlaying();
    void refreshJumpBackIn();
  });

  // Home's "Jump back in" list, whenever it's fetched (online only: offline it's the downloads).
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    const [name, userId, ...rest] = event.query.queryKey;
    if (name !== 'recentlyPlayed' || userId !== useAuth.getState().session?.userId) return;
    if (rest[rest.length - 1] !== 'online') return;
    void pushJumpBackIn(event.query.state.data as BaseItem[]);
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
    return;
  }

  shown.nowPlaying = new Set();
  const art = await saveArt(track, 400, shown.nowPlaying, { allowLocal: true });
  const base: NowPlayingProps = compact({
    title: track.Name,
    artist: artistLine(track),
    album: track.Album,
    art,
    color: tileColor(blurhashAverage(client.blurhash(track)), track.AlbumId ?? track.Id),
  });

  const progress = engine.getProgress();
  const duration = progress.duration > 0 ? progress.duration : ticksToSeconds(track.RunTimeTicks);
  if (playing && duration > 0) {
    const start = Math.round(now - progress.position * 1000);
    const end = Math.round(start + duration * 1000);
    send('nowPlaying', widget, [
      { date: new Date(now), props: { ...base, playing: true, start, end } },
      // If the app is closed mid-song nothing updates the widget, so it stops saying
      // "Now playing" once the song would have ended.
      { date: new Date(end + 5000), props: { ...base, playing: false, progress: 1 } },
    ]);
  } else {
    const fraction = duration > 0 ? Math.min(1, Math.max(0, progress.position / duration)) : 0;
    send('nowPlaying', widget, [{ date: new Date(now), props: { ...base, playing: false, progress: fraction } }]);
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
  const names = new Set<string>();
  shown.jumpBackIn = names;
  const albums: WidgetAlbum[] = await Promise.all(
    picked.map(async (album) =>
      compact({ id: album.Id, name: album.Name, artist: album.AlbumArtist ?? '', art: await saveArt(album, 300, names) }),
    ),
  );
  const first = picked[0];
  const color = first ? tileColor(blurhashAverage(client.blurhash(first)), first.Id) : undefined;
  send('jumpBackIn', widget, [{ date: new Date(), props: compact({ albums, color }) }]);
  removeLeftoverArt();
}

// ---- Shared ----

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
