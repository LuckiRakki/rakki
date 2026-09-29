// Thin Jellyfin REST client. Jellyfin 10.11 only accepts the `Authorization: MediaBrowser …`
// header and the `ApiKey` query parameter by default (X-Emby-Token / api_key are "legacy"
// and off unless the server enables them), so we use only those two.
import * as Device from 'expo-device';

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
  UserData?: { IsFavorite?: boolean; PlayCount?: number; LastPlayedDate?: string };
  DateCreated?: string;
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
    const r = await this.get<ItemsResult>('/Items', {
      userId: this.session.userId,
      IncludeItemTypes: 'Audio',
      Recursive: true,
      Filters: 'IsPlayed',
      SortBy: 'DatePlayed',
      SortOrder: 'Descending',
      Limit: limit * 6,
      EnableImageTypes: 'Primary',
      ImageTypeLimit: 1,
    });
    const seen = new Set<string>();
    const albums: BaseItem[] = [];
    for (const t of r.Items) {
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

  getItem(id: string) {
    return this.get<BaseItem>(`/Items/${id}`, { userId: this.session.userId });
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
