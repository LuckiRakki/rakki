// The smart queue, like Spotify's radio and autoplay: songs like the ones playing, picked from
// what Last.fm listeners play alongside them (similar songs, similar artists' popular songs)
// and from your own taste (your likes and most played by those artists), plus Jellyfin's
// instant mix. It runs after the first song has started, never before, and gives itself a
// fixed time: whatever has come back by then is used, so it's done in well under 11 seconds.
// Without a Last.fm key (or the search index, which matches Last.fm's names to your library)
// it's Jellyfin's instant mix and your own plays.
import type { BaseItem, JellyfinClient } from '@/api/jellyfin';
import { artistTopTracks, matchKey, similarArtists, similarTracks } from '@/lib/lastfm';
import { libraryLookup, type LibraryLookup } from '@/search/index';
import { useSettings } from '@/settings/store';

/** Waiting for the sources (Jellyfin, Last.fm) … */
const SOURCES_MS = 6500;
/** … then for the songs Last.fm suggested that weren't already loaded. */
const FETCH_MS = 3000;
/** How many similar artists' songs to look at. */
const SIMILAR_ARTISTS = 6;

interface Candidate {
  id: string;
  item?: BaseItem;
  /** How much it's like the seed songs, 0–1 (the best of its sources). */
  sim: number;
  /** How much the world plays it, 0–1 (Last.fm), when known. */
  pop?: number;
  sources: Set<string>;
}

export interface SmartQueueResult {
  items: BaseItem[];
  /** How long it took, and how many songs each source offered (for the performance log). */
  ms: number;
  offered: Record<string, number>;
}

const popularity = (playcount: number) => Math.min(1, Math.log10(playcount + 1) / 7);
const artistOf = (item: BaseItem) => item.Artists?.[0] ?? item.AlbumArtist ?? '';
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Up to `count` songs to follow `seeds` (the last one counts most), none of `exclude`.
 * `artistRadio`: more of the seed's own artist is fine.
 */
export async function buildSmartQueue(
  client: JellyfinClient,
  seeds: BaseItem[],
  opts: { exclude: Set<string>; count: number; artistRadio?: boolean },
): Promise<SmartQueueResult> {
  const started = Date.now();
  const seed = seeds[seeds.length - 1];
  const pool = new Map<string, Candidate>();
  const offered: Record<string, number> = {};
  const offer = (source: string, id: string, sim: number, pop?: number, item?: BaseItem) => {
    if (opts.exclude.has(id)) return;
    offered[source] = (offered[source] ?? 0) + 1;
    const c = pool.get(id);
    if (!c) {
      pool.set(id, { id, item, sim, pop, sources: new Set([source]) });
      return;
    }
    c.sim = Math.max(c.sim, sim);
    if (pop !== undefined) c.pop = Math.max(c.pop ?? 0, pop);
    c.item ??= item;
    c.sources.add(source);
  };

  const lastfm = !!useSettings.getState().lastfmApiKey.trim();
  const lookup = lastfm ? libraryLookup() : null;
  const seedArtistIds = [...(seed.ArtistItems ?? []), ...(seed.AlbumArtists ?? [])].map((a) => a.Id).filter(Boolean);

  const sources: Promise<unknown>[] = [
    // Jellyfin's instant mix: same genres and artists, from your server.
    client.getInstantMix(seed.Id, 80).then((mix) => {
      mix.forEach((m, i) => offer('mix', m.Id, 0.15 + 0.6 * (1 - i / mix.length), undefined, m));
    }),
  ];
  if (lookup) {
    // What Last.fm listeners play alongside the last two songs.
    for (const [i, s] of seeds.slice(-2).reverse().entries()) {
      const weight = i === 0 ? 1 : 0.75;
      sources.push(
        similarTracks(artistOf(s), s.Name).then((list) => {
          for (const t of list) {
            for (const id of lookup.song(t.artist, t.name)) offer('similar', id, weight * (0.35 + 0.65 * t.match), popularity(t.playcount));
          }
        }),
      );
    }
    // The seed artist's most played songs worldwide.
    sources.push(
      artistTopTracks(artistOf(seed)).then((top) => {
        top.forEach((t, r) => {
          for (const id of lookup.song(artistOf(seed), t.name)) offer('artist', id, 0.5 * (1 - (r / top.length) * 0.5), popularity(t.playcount));
        });
      }),
    );
  }
  // Similar artists you have: their popular songs (Last.fm), and what you play of theirs.
  sources.push(
    // (Your own picks don't wait on a slow Last.fm for more than 3 s.)
    (lookup ? Promise.race([similarArtists(artistOf(seed)).catch(() => []), sleep(3000).then(() => [])]) : Promise.resolve([])).then((similar) =>
      Promise.allSettled([
        ...(lookup ? similarPopular(lookup, similar, offer) : []),
        yourFavourites(client, seedArtistIds, lookup, similar, offer),
      ]),
    ),
  );

  await Promise.race([Promise.allSettled(sources), sleep(SOURCES_MS)]);

  // Load the suggested songs that only came from Last.fm (most promising first).
  const missing = [...pool.values()]
    .filter((c) => !c.item)
    .sort((a, b) => b.sim + (b.pop ?? 0) - (a.sim + (a.pop ?? 0)))
    .slice(0, 120)
    .map((c) => c.id);
  if (missing.length) {
    const loaded = await Promise.race([client.getItemsByIds(missing).catch(() => []), sleep(FETCH_MS).then(() => [])]);
    for (const item of loaded) {
      const c = pool.get(item.Id);
      if (c) c.item = item;
    }
  }

  const items = arrange(
    [...pool.values()].filter((c) => c.item && c.item.Type === 'Audio' && !c.item.Radio),
    opts.count,
    { lastfm, seedArtist: matchKey(artistOf(seed)), artistRadio: !!opts.artistRadio },
  );
  return { items, ms: Date.now() - started, offered };
}

function similarPopular(lookup: LibraryLookup, similar: { name: string; match: number }[], offer: Offer): Promise<void>[] {
  return similar
    .filter((a) => lookup.artist(a.name))
    .slice(0, SIMILAR_ARTISTS)
    .map((a) =>
      artistTopTracks(a.name).then((top) => {
        top.slice(0, 30).forEach((t, r) => {
          for (const id of lookup.song(a.name, t.name)) {
            offer('similarArtists', id, 0.1 + a.match * 0.6 * (1 - (r / 30) * 0.5), popularity(t.playcount));
          }
        });
      }),
    );
}

type Offer = (source: string, id: string, sim: number, pop?: number, item?: BaseItem) => void;

/** Your most played and liked songs by the seed's artist and the similar ones you have. */
async function yourFavourites(
  client: JellyfinClient,
  seedArtistIds: string[],
  lookup: LibraryLookup | null,
  similar: { name: string; match: number }[],
  offer: Offer,
): Promise<void> {
  const match = new Map<string, number>(seedArtistIds.map((id) => [id, 0.55]));
  for (const a of similar.slice(0, 15)) {
    const id = lookup?.artist(a.name);
    if (id && !match.has(id)) match.set(id, 0.2 + a.match * 0.45);
  }
  if (!match.size) return;
  const ArtistIds = [...match.keys()].join('|');
  const [played, liked] = await Promise.all([
    client.items({ IncludeItemTypes: 'Audio', ArtistIds, Filters: 'IsPlayed', SortBy: 'PlayCount', SortOrder: 'Descending', Limit: 120 }),
    client.items({ IncludeItemTypes: 'Audio', ArtistIds, Filters: 'IsFavorite', Limit: 80 }),
  ]);
  for (const item of [...played.Items, ...liked.Items]) {
    const ids = [...(item.ArtistItems ?? []), ...(item.AlbumArtists ?? [])].map((a) => a.Id);
    const sim = Math.max(0.15, ...ids.map((id) => match.get(id) ?? 0));
    offer('yours', item.Id, sim, undefined, item);
  }
}

/** You like it: liked, or played a fair bit (0–1). */
function personal(item: BaseItem): number {
  if (item.UserData?.IsFavorite) return 1;
  return Math.min(1, Math.log2((item.UserData?.PlayCount ?? 0) + 1) / 5);
}

/** Heard very recently: less likely to come round again so soon. */
function freshness(item: BaseItem): number {
  const last = item.UserData?.LastPlayedDate;
  if (!last) return 1;
  const hours = (Date.now() - Date.parse(last)) / 3600_000;
  return hours < 3 ? 0.25 : hours < 24 ? 0.6 : hours < 72 ? 0.85 : 1;
}

/**
 * Score every song (how alike × how loved by the world × how loved by you), drop repeats of the
 * same song from other albums, then deal them out so the same artist never plays twice in a
 * row, no artist takes over, and songs you know mix with ones you don't.
 */
function arrange(candidates: Candidate[], count: number, ctx: { lastfm: boolean; seedArtist: string; artistRadio: boolean }): BaseItem[] {
  const scored = candidates.map((c) => {
    const item = c.item!;
    const pop = c.pop ?? (ctx.lastfm ? 0.25 : 0.35);
    const agree = Math.min(0.15, 0.05 * (c.sources.size - 1));
    const jitter = 1 + (Math.random() - 0.5) * 0.16;
    const score = (0.55 * c.sim + 0.25 * pop + 0.2 * personal(item) + agree) * freshness(item) * jitter;
    const familiar = !!item.UserData?.IsFavorite || (item.UserData?.PlayCount ?? 0) >= 2;
    return { item, score, familiar, artist: matchKey(artistOf(item)), song: `${matchKey(artistOf(item))}|${matchKey(item.Name)}` };
  });

  // The same song on several albums: keep the one you play most.
  const bySong = new Map<string, (typeof scored)[number]>();
  for (const s of scored) {
    const had = bySong.get(s.song);
    if (!had || personal(s.item) > personal(had.item) || (personal(s.item) === personal(had.item) && s.score > had.score)) bySong.set(s.song, s);
  }
  const left = [...bySong.values()].sort((a, b) => b.score - a.score);

  const cap = Math.max(3, Math.ceil(count / 8));
  const perArtist = new Map<string, number>();
  const out: BaseItem[] = [];
  let lastArtist = ctx.seedArtist;
  let run = { familiar: false, length: 0 };
  // Rules, loosened only when nothing fits (a small library): first the artist cap and never
  // the same artist twice in a row; then over the cap; then anything.
  let level = 0;
  while (out.length < count && left.length) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < left.length; i++) {
      const s = left[i];
      const limit = ctx.artistRadio && s.artist === ctx.seedArtist ? cap * 2 : cap;
      if (level < 1 && (perArtist.get(s.artist) ?? 0) >= limit) continue;
      if (level < 2 && s.artist === lastArtist) continue;
      let v = s.score;
      // Two of a kind in a row (songs you know, or new ones), then the other kind is due.
      if (run.length >= 2 && s.familiar === run.familiar) v *= 0.55;
      if (v > bestScore) {
        bestScore = v;
        best = i;
      }
      // The list is sorted, so nothing further down can beat an unpenalised pick.
      if (v === s.score) break;
    }
    if (best < 0) {
      if (level === 2) break;
      level++;
      continue;
    }
    level = 0;
    const [pick] = left.splice(best, 1);
    out.push(pick.item);
    perArtist.set(pick.artist, (perArtist.get(pick.artist) ?? 0) + 1);
    lastArtist = pick.artist;
    run = pick.familiar === run.familiar ? { familiar: run.familiar, length: run.length + 1 } : { familiar: pick.familiar, length: 1 };
  }
  return out;
}
