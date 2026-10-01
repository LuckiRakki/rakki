// Thin Jellyfin REST client. Jellyfin 10.11 only accepts the `Authorization: MediaBrowser …`
// header and the `ApiKey` query parameter by default (X-Emby-Token / api_key are "legacy"
// and off unless the server enables them), so we use only those two.
import * as Device from 'expo-device';

import type { JellyfinLyricsDto, TtmlDto } from '@/lyrics/types';

export const CLIENT_NAME = 'Rakki';
export const CLIENT_VERSION = '0.1.0';

export interface Session {
  serverUrl: string;
  serverName: string;
  userId: string;
  userName: string;
  token: string;
  deviceId: string;
}

export interface PublicSystemInfo {
  ServerName: string;
  Version: string;
  Id: string;
}

export interface NameIdPair {
  Name: string;
  Id: string;
}

export interface BaseItem {
  Id: string;
  Name: string;
  Type: string;
  AlbumArtist?: string;
  AlbumArtists?: NameIdPair[];
  Artists?: string[];
  ArtistItems?: NameIdPair[];
  Album?: string;
  AlbumId?: string;
  AlbumPrimaryImageTag?: string;
  ProductionYear?: number;
  RunTimeTicks?: number;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  ChildCount?: number;
  ImageTags?: Record<string, string>;
  ImageBlurHashes?: Record<string, Record<string, string>>;
  BackdropImageTags?: string[];
  /** A song's position in a playlist (needed to remove/move it). */
  PlaylistItemId?: string;
  Genres?: string[];
  GenreItems?: NameIdPair[];
  Overview?: string;
  MediaType?: string;
  AlbumCount?: number;
  SongCount?: number;
  UserData?: { IsFavorite?: boolean; PlayCount?: number; LastPlayedDate?: string };
  DateCreated?: string;
}

export type SearchKind = 'songs' | 'albums' | 'artists' | 'playlists';

export interface GenreCount {
  name: string;
  count: number;
  /** An album from the genre, for its tile. */
  album?: BaseItem;
}

export interface ItemsResult {
  Items: BaseItem[];
  TotalRecordCount: number;
  StartIndex: number;
}

/** Body for /Sessions/Playing, /Progress and /Stopped. */
export interface PlaybackInfo {
  ItemId: string;
  PlaySessionId: string;
  PositionTicks: number;
  IsPaused?: boolean;
  CanSeek?: boolean;
  PlayMethod?: 'DirectPlay' | 'DirectStream' | 'Transcode';
  EventName?: 'TimeUpdate' | 'Pause' | 'Unpause';
  RepeatMode?: 'RepeatNone' | 'RepeatAll' | 'RepeatOne';
  PlaybackOrder?: 'Default' | 'Shuffle';
  PlaybackStartTimeTicks?: number;
}

interface AuthResult {
  AccessToken: string;
  User: { Id: string; Name: string };
}

export class JellyfinError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Accepts "192.168.1.5:8096", "http://host:8096/", "https://jf.example.com/jellyfin". */
export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, '');
}

function deviceName(): string {
  return Device.deviceName ?? Device.modelName ?? 'Rakki';
}

function authHeader(deviceId: string, token?: string): string {
  const esc = (v: string) => v.replace(/"/g, '');
  const parts = [
    `Client="${CLIENT_NAME}"`,
    `Device="${esc(deviceName())}"`,
    `DeviceId="${deviceId}"`,
    `Version="${CLIENT_VERSION}"`,
  ];
  if (token) parts.push(`Token="${token}"`);
  return `MediaBrowser ${parts.join(', ')}`;
}

async function request<T>(
  url: string,
  init: RequestInit & { deviceId: string; token?: string; timeoutMs?: number },
): Promise<T> {
  const { deviceId, token, timeoutMs = 15000, headers, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: authHeader(deviceId, token),
        ...headers,
      },
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new JellyfinError(
      aborted
        ? "The server didn't answer in time. Is Tailscale on and the address right?"
        : "Couldn't reach the server. Check the address and that Tailscale is on.",
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    if (res.status === 401) {
      throw new JellyfinError(
        token ? 'Your session has expired. Sign in again.' : 'Wrong username or password.',
        401,
      );
    }
    throw new JellyfinError(`Server error ${res.status}`, res.status);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

// ---- Unauthenticated (login flow) ----------------------------------------------------

export function getPublicInfo(serverUrl: string, deviceId: string) {
  return request<PublicSystemInfo>(`${serverUrl}/System/Info/Public`, {
    deviceId,
    timeoutMs: 8000,
  });
}

export async function authenticateByName(
  serverUrl: string,
  deviceId: string,
  username: string,
  password: string,
): Promise<Pick<Session, 'userId' | 'userName' | 'token'>> {
  const r = await request<AuthResult>(`${serverUrl}/Users/AuthenticateByName`, {
    method: 'POST',
    deviceId,
    body: JSON.stringify({ Username: username, Pw: password }),
  });
  return { userId: r.User.Id, userName: r.User.Name, token: r.AccessToken };
}

export async function quickConnectEnabled(serverUrl: string, deviceId: string): Promise<boolean> {
  try {
    return (await request<boolean>(`${serverUrl}/QuickConnect/Enabled`, { deviceId })) === true;
  } catch {
    return false;
  }
}

export function quickConnectInitiate(serverUrl: string, deviceId: string) {
  return request<{ Secret: string; Code: string }>(`${serverUrl}/QuickConnect/Initiate`, {
    method: 'POST',
    deviceId,
  });
}

export function quickConnectState(serverUrl: string, deviceId: string, secret: string) {
  return request<{ Authenticated: boolean }>(
    `${serverUrl}/QuickConnect/Connect${query({ secret })}`,
    { deviceId },
  );
}

export async function authenticateWithQuickConnect(
  serverUrl: string,
  deviceId: string,
  secret: string,
): Promise<Pick<Session, 'userId' | 'userName' | 'token'>> {
  const r = await request<AuthResult>(`${serverUrl}/Users/AuthenticateWithQuickConnect`, {
    method: 'POST',
    deviceId,
    body: JSON.stringify({ Secret: secret }),
  });
  return { userId: r.User.Id, userName: r.User.Name, token: r.AccessToken };
}

// ---- Authenticated client -------------------------------------------------------------

/** The distinct albums of a list of songs, in order, as album items. */
function albumsOf(tracks: BaseItem[], limit: number): BaseItem[] {
  const seen = new Set<string>();
  const albums: BaseItem[] = [];
  for (const t of tracks) {
    if (!t.AlbumId || seen.has(t.AlbumId)) continue;
    seen.add(t.AlbumId);
    albums.push({
      Id: t.AlbumId,
      Name: t.Album ?? t.Name,
      Type: 'MusicAlbum',
      AlbumArtist: t.AlbumArtist,
      ImageTags: t.AlbumPrimaryImageTag ? { Primary: t.AlbumPrimaryImageTag } : undefined,
      ImageBlurHashes: t.ImageBlurHashes,
    });
    if (albums.length >= limit) break;
  }
  return albums;
}

const ALBUM_FIELDS = 'DateCreated,ChildCount';

export class JellyfinClient {
  constructor(readonly session: Session) {}

  private get<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}) {
    const { serverUrl, deviceId, token } = this.session;
    return request<T>(`${serverUrl}${path}${query(params)}`, { deviceId, token });
  }

  private send<T = void>(
    method: 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    params: Record<string, string | number | boolean | undefined> = {},
  ) {
    const { serverUrl, deviceId, token } = this.session;
    return request<T>(`${serverUrl}${path}${query(params)}`, {
      method,
      deviceId,
      token,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  // Playback reporting (drives play counts, "Recently played", Last.fm via the server).
  reportPlaybackStart(info: PlaybackInfo) {
    return this.send('POST', '/Sessions/Playing', info);
  }

  reportPlaybackProgress(info: PlaybackInfo) {
    return this.send('POST', '/Sessions/Playing/Progress', info);
  }

  reportPlaybackStopped(info: PlaybackInfo) {
    return this.send('POST', '/Sessions/Playing/Stopped', info);
  }

  /** Spicy Lyrics plugin: word-timed TTML as JSON (404 when the song has none). */
  getSpicyLyrics(itemId: string) {
    return this.get<TtmlDto>(`/SpicyLyrics/${itemId}/ttml`);
  }

  /** Jellyfin's own lyrics (LRC or plain; 404 when none). */
  getLyrics(itemId: string) {
    return this.get<JellyfinLyricsDto>(`/Audio/${itemId}/Lyrics`);
  }

  setFavorite(itemId: string, favorite: boolean) {
    return this.send(favorite ? 'POST' : 'DELETE', `/UserFavoriteItems/${itemId}`, undefined, {
      userId: this.session.userId,
    });
  }

  getAlbums(opts: { startIndex?: number; limit?: number; sortBy?: string; sortOrder?: string }) {
    return this.get<ItemsResult>('/Items', {
      userId: this.session.userId,
      IncludeItemTypes: 'MusicAlbum',
      Recursive: true,
      SortBy: opts.sortBy ?? 'SortName',
      SortOrder: opts.sortOrder ?? 'Ascending',
      StartIndex: opts.startIndex ?? 0,
      Limit: opts.limit ?? 60,
      Fields: ALBUM_FIELDS,
      EnableImageTypes: 'Primary',
      ImageTypeLimit: 1,
    });
  }

  /** Albums of the most recently played tracks, de-duplicated, newest first. */
  async getRecentlyPlayedAlbums(limit = 12): Promise<BaseItem[]> {
    const r = await this.items({
      IncludeItemTypes: 'Audio',
      Filters: 'IsPlayed',
      SortBy: 'DatePlayed',
      SortOrder: 'Descending',
      Limit: limit * 6,
    });
    return albumsOf(r.Items, limit);
  }

  getItem(id: string) {
    return this.get<BaseItem>(`/Items/${id}`, { userId: this.session.userId });
  }

  /** /Items with the defaults every list needs (this user, recursive, one primary image). */
  items(params: Record<string, string | number | boolean | undefined>) {
    return this.get<ItemsResult>('/Items', {
      userId: this.session.userId,
      Recursive: true,
      EnableImageTypes: 'Primary,Backdrop',
      ImageTypeLimit: 1,
      ...params,
    });
  }

  // ---- Artists ----

  /** Album artists (the Library's Artists tab), sorted by name. */
  getAlbumArtists(opts: { startIndex?: number; limit?: number; sortBy?: string; sortOrder?: string } = {}) {
    return this.get<ItemsResult>('/Artists/AlbumArtists', {
      userId: this.session.userId,
      SortBy: opts.sortBy ?? 'SortName',
      SortOrder: opts.sortOrder ?? 'Ascending',
      StartIndex: opts.startIndex ?? 0,
      Limit: opts.limit ?? 100,
      Fields: 'ChildCount',
      EnableImageTypes: 'Primary,Backdrop',
      ImageTypeLimit: 1,
    });
  }

  /** The artist's own albums, newest first. */
  getArtistAlbums(artistId: string) {
    return this.items({
      IncludeItemTypes: 'MusicAlbum',
      AlbumArtistIds: artistId,
      SortBy: 'ProductionYear,PremiereDate,SortName',
      SortOrder: 'Descending',
      Fields: 'ChildCount',
    });
  }

  /** Albums by others that the artist features on. */
  async getAppearsOn(artistId: string): Promise<BaseItem[]> {
    const r = await this.items({
      IncludeItemTypes: 'MusicAlbum',
      ContributingArtistIds: artistId,
      SortBy: 'ProductionYear,SortName',
      SortOrder: 'Descending',
      Limit: 40,
    });
    return r.Items.filter((a) => !a.AlbumArtists?.some((x) => x.Id === artistId));
  }

  /** The artist's most played songs (by this user), then alphabetical. */
  async getTopTracks(artistId: string, limit = 10): Promise<BaseItem[]> {
    const r = await this.items({
      IncludeItemTypes: 'Audio',
      ArtistIds: artistId,
      SortBy: 'PlayCount,SortName',
      SortOrder: 'Descending,Ascending',
      Limit: limit,
    });
    return r.Items;
  }

  async getSimilar(itemId: string, limit = 12): Promise<BaseItem[]> {
    const r = await this.get<ItemsResult>(`/Items/${itemId}/Similar`, {
      userId: this.session.userId,
      Limit: limit,
    });
    return r.Items;
  }

  /** Jellyfin's radio: songs like a song, album, artist, playlist or genre. */
  async getInstantMix(itemId: string, limit = 100): Promise<BaseItem[]> {
    const r = await this.get<ItemsResult>(`/Items/${itemId}/InstantMix`, {
      userId: this.session.userId,
      Limit: limit,
    });
    return r.Items;
  }

  // ---- Home shelves ----

  /** Albums of the most played songs. */
  async getMostPlayedAlbums(limit = 16): Promise<BaseItem[]> {
    const r = await this.items({
      IncludeItemTypes: 'Audio',
      Filters: 'IsPlayed',
      SortBy: 'PlayCount',
      SortOrder: 'Descending',
      Limit: limit * 6,
    });
    return albumsOf(r.Items, limit);
  }

  /** Albums you played, but longest ago. */
  async getRediscoverAlbums(limit = 16): Promise<BaseItem[]> {
    const r = await this.items({
      IncludeItemTypes: 'Audio',
      Filters: 'IsPlayed',
      SortBy: 'DatePlayed',
      SortOrder: 'Ascending',
      Limit: limit * 8,
    });
    return albumsOf(r.Items, limit);
  }

  /** The album artists you play most, counted over your most played songs. */
  async getTopArtists(limit = 12): Promise<BaseItem[]> {
    const songs = await this.items({
      IncludeItemTypes: 'Audio',
      SortBy: 'PlayCount',
      SortOrder: 'Descending',
      Filters: 'IsPlayed',
      EnableImages: false,
      Limit: 400,
    });
    const plays = new Map<string, number>();
    for (const s of songs.Items) {
      for (const a of s.AlbumArtists?.length ? s.AlbumArtists : (s.ArtistItems ?? [])) {
        plays.set(a.Id, (plays.get(a.Id) ?? 0) + (s.UserData?.PlayCount ?? 1));
      }
    }
    const ids = [...plays].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
    const byId = new Map((await this.getItemsByIds(ids)).map((a) => [a.Id, a]));
    return ids.map((id) => byId.get(id)).filter((a): a is BaseItem => !!a);
  }

  async getRandomAlbums(limit = 16): Promise<BaseItem[]> {
    return (await this.items({ IncludeItemTypes: 'MusicAlbum', SortBy: 'Random', Limit: limit })).Items;
  }

  /** All Liked Songs (newest to the library first; Jellyfin doesn't record when you liked them). */
  getFavoriteTracks(opts: { startIndex?: number; limit?: number } = {}) {
    return this.items({
      IncludeItemTypes: 'Audio',
      Filters: 'IsFavorite',
      SortBy: 'DateCreated,SortName',
      SortOrder: 'Descending',
      StartIndex: opts.startIndex ?? 0,
      Limit: opts.limit ?? 5000,
    });
  }

  // ---- Genres ----
  // Jellyfin's genre list only works scoped to a library, and this library has hundreds of
  // fine-grained genres, so Rakki ranks them by how many albums use them instead.

  /**
   * Genres by number of albums, most used first, each with a cover album for its tile.
   * Covers are spread out so neighbouring tiles don't all show the same album.
   */
  async getGenreCounts(): Promise<GenreCount[]> {
    const r = await this.get<ItemsResult>('/Items', {
      userId: this.session.userId,
      Recursive: true,
      IncludeItemTypes: 'MusicAlbum',
      Fields: 'Genres',
      EnableImageTypes: 'Primary',
      ImageTypeLimit: 1,
      EnableUserData: false,
      SortBy: 'SortName',
      Limit: 5000,
    });
    const byGenre = new Map<string, BaseItem[]>();
    for (const album of r.Items) {
      for (const g of album.Genres ?? []) {
        const list = byGenre.get(g);
        if (list) list.push(album);
        else byGenre.set(g, [album]);
      }
    }
    const used = new Set<string>();
    return [...byGenre]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([name, albums]) => {
        const withArt = albums.filter((x) => x.ImageTags?.Primary);
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
        const start = withArt.length ? Math.abs(hash) % withArt.length : 0;
        let cover: BaseItem | undefined;
        for (let i = 0; i < withArt.length && !cover; i++) {
          const x = withArt[(start + i) % withArt.length];
          if (!used.has(x.Id)) cover = x;
        }
        cover ??= withArt[start];
        if (cover) used.add(cover.Id);
        const album = cover && {
          Id: cover.Id,
          Name: cover.Name,
          Type: cover.Type,
          ImageTags: cover.ImageTags,
          ImageBlurHashes: cover.ImageBlurHashes,
        };
        return { name, count: albums.length, album };
      });
  }

  /** Albums tagged with a genre (matched by name). */
  getGenreAlbums(genre: string, opts: { startIndex?: number; limit?: number } = {}) {
    return this.items({
      IncludeItemTypes: 'MusicAlbum',
      Genres: genre,
      SortBy: 'SortName',
      StartIndex: opts.startIndex ?? 0,
      Limit: opts.limit ?? 500,
    });
  }

  /** Album artists with albums in a genre. */
  getGenreArtists(genre: string) {
    return this.get<ItemsResult>('/Artists/AlbumArtists', {
      userId: this.session.userId,
      Genres: genre,
      Limit: 200,
      Fields: 'ChildCount',
    });
  }

  /** Songs in a genre: shuffled for Play, or your most played. */
  getGenreTracks(genre: string, opts: { mostPlayed?: boolean; limit?: number } = {}) {
    return this.items({
      IncludeItemTypes: 'Audio',
      Genres: genre,
      ...(opts.mostPlayed
        ? { SortBy: 'PlayCount,SortName', SortOrder: 'Descending', Filters: 'IsPlayed' }
        : { SortBy: 'Random' }),
      Limit: opts.limit ?? 200,
    });
  }

  // ---- Search (Jellyfin matches substrings of names; typos are handled on the device) ----

  async search(term: string, limit = 20, kinds: SearchKind[] = ['songs', 'albums', 'artists', 'playlists']) {
    const want = (k: SearchKind) => kinds.includes(k);
    const none = Promise.resolve({ Items: [] as BaseItem[] });
    const [songs, albums, playlists, artists] = await Promise.all([
      want('songs') ? this.items({ searchTerm: term, IncludeItemTypes: 'Audio', Limit: limit }) : none,
      want('albums') ? this.items({ searchTerm: term, IncludeItemTypes: 'MusicAlbum', Limit: limit }) : none,
      want('playlists')
        ? this.items({ searchTerm: term, IncludeItemTypes: 'Playlist', Limit: limit, Fields: 'ChildCount' })
        : none,
      want('artists')
        ? this.get<ItemsResult>('/Artists', {
            userId: this.session.userId,
            searchTerm: term,
            Limit: limit,
            EnableImageTypes: 'Primary',
            ImageTypeLimit: 1,
          })
        : none,
    ]);
    return { songs: songs.Items, albums: albums.Items, playlists: playlists.Items, artists: artists.Items };
  }

  /** Full items for a list of ids (any type), in no particular order. Missing ids are skipped. */
  async getItemsByIds(ids: string[]): Promise<BaseItem[]> {
    if (ids.length === 0) return [];
    return (await this.items({ Ids: ids.join(','), Fields: 'ChildCount' })).Items;
  }

  /**
   * One page of the search index: every song, album or playlist, name and artist only. The
   * server sends whole items, so this is the slow part of building the index (~1 MB/1000 songs).
   */
  getIndexPage(kind: 'Audio' | 'MusicAlbum' | 'Playlist', startIndex: number, limit: number, since?: string) {
    return this.get<ItemsResult>('/Items', {
      userId: this.session.userId,
      Recursive: true,
      IncludeItemTypes: kind,
      EnableImages: false,
      EnableUserData: false,
      EnableTotalRecordCount: true,
      SortBy: 'SortName',
      StartIndex: startIndex,
      Limit: limit,
      MinDateLastSaved: since,
    });
  }

  // ---- Playlists ----

  getPlaylists() {
    return this.items({
      IncludeItemTypes: 'Playlist',
      SortBy: 'SortName',
      Fields: 'ChildCount,DateCreated',
    });
  }

  getPlaylistItems(playlistId: string) {
    return this.get<ItemsResult>(`/Playlists/${playlistId}/Items`, {
      userId: this.session.userId,
      EnableImageTypes: 'Primary',
      ImageTypeLimit: 1,
    });
  }

  async createPlaylist(name: string, itemIds: string[] = []): Promise<string> {
    const r = await this.send<{ Id: string }>('POST', '/Playlists', {
      Name: name,
      Ids: itemIds,
      UserId: this.session.userId,
      MediaType: 'Audio',
    });
    return r.Id;
  }

  addToPlaylist(playlistId: string, itemIds: string[]) {
    return this.send('POST', `/Playlists/${playlistId}/Items`, undefined, {
      ids: itemIds.join(','),
      userId: this.session.userId,
    });
  }

  /** @param entryIds the songs' PlaylistItemId values, not their item ids */
  removeFromPlaylist(playlistId: string, entryIds: string[]) {
    return this.send('DELETE', `/Playlists/${playlistId}/Items`, undefined, { entryIds: entryIds.join(',') });
  }

  movePlaylistItem(playlistId: string, entryId: string, newIndex: number) {
    return this.send('POST', `/Playlists/${playlistId}/Items/${entryId}/Move/${newIndex}`);
  }

  renamePlaylist(playlistId: string, name: string) {
    return this.send('POST', `/Playlists/${playlistId}`, { Name: name });
  }

  deletePlaylist(playlistId: string) {
    return this.send('DELETE', `/Items/${playlistId}`);
  }

  getAlbumTracks(albumId: string) {
    return this.get<ItemsResult>('/Items', {
      userId: this.session.userId,
      ParentId: albumId,
      IncludeItemTypes: 'Audio',
      Recursive: true,
      SortBy: 'ParentIndexNumber,IndexNumber,SortName',
      SortOrder: 'Ascending',
      EnableImageTypes: 'Primary',
      ImageTypeLimit: 1,
    });
  }

  /** Album art for an album, or a track's album. */
  imageUrl(item: BaseItem, size = 300): string | undefined {
    const own = item.ImageTags?.Primary;
    const id = own ? item.Id : item.AlbumId;
    const tag = own ?? item.AlbumPrimaryImageTag;
    if (!id || !tag) return undefined;
    return `${this.session.serverUrl}/Items/${id}/Images/Primary${query({
      fillWidth: size,
      fillHeight: size,
      quality: 90,
      tag,
    })}`;
  }

  /** An artist's (or album's) wide backdrop image, if it has one. */
  backdropUrl(item: BaseItem, width = 1200): string | undefined {
    const tag = item.BackdropImageTags?.[0];
    if (!tag) return undefined;
    return `${this.session.serverUrl}/Items/${item.Id}/Images/Backdrop/0${query({ maxWidth: width, quality: 85, tag })}`;
  }

  blurhash(item: BaseItem): string | undefined {
    const tag = item.ImageTags?.Primary ?? item.AlbumPrimaryImageTag;
    return tag ? item.ImageBlurHashes?.Primary?.[tag] : undefined;
  }

  /**
   * Direct-play what iOS can decode natively; everything else (or anything above the bitrate
   * cap) is transcoded to AAC over HLS, the same approach as Finamp.
   * @param maxKbps 0 = no cap (original file whenever possible).
   */
  streamUrl(trackId: string, maxKbps = 0): string {
    const { serverUrl, userId, deviceId, token } = this.session;
    return `${serverUrl}/Audio/${trackId}/universal${query({
      UserId: userId,
      DeviceId: deviceId,
      ApiKey: token,
      Container: 'mp3,aac,m4a|aac,m4b|aac,flac,alac,m4a|alac,wav',
      TranscodingContainer: 'ts',
      TranscodingProtocol: 'hls',
      AudioCodec: 'aac',
      MaxStreamingBitrate: maxKbps > 0 ? maxKbps * 1000 : 140000000,
    })}`;
  }
}
