// An artist's page: the picture, popular songs (Last.fm's worldwide plays when there's a key,
// else yours), albums, singles, appearances, similar artists and the biography.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { isSingleOrEp } from '@/lib/items';
import { artistTopTracks, matchPopular } from '@/lib/lastfm';
import { useSettings } from '@/settings/store';
import { useAuth } from '~/auth/session';
import { setLiked } from '~/library/actions';
import { useAppearsOn, useArtistAlbums, useArtistTracks, useItem, useSimilarArtists, useTopTracks } from '~/queries';
import { ActionBar, LibraryHeader, Shelf, TrackTable } from '~/ui/parts';
import { QueryState } from '~/ui/states';

/** The artist's most played songs worldwide (Last.fm, matched to your library), else by your plays. */
function usePopular(artist: BaseItem | undefined) {
  const key = useSettings((s) => s.lastfmApiKey.trim());
  const sortMine = useSettings((s) => s.popularSort === 'mine');
  const mine = useTopTracks(artist?.Id ?? '').data ?? [];
  const library = useArtistTracks(artist?.Id ?? '').data;
  const lastfm = useQuery({
    queryKey: ['artistPopular', artist?.Id],
    enabled: !!artist && !!key && !sortMine && !!library,
    staleTime: 24 * 3600_000,
    queryFn: async () => matchPopular(await artistTopTracks(artist!.Name), library!, artist!.Id).slice(0, 10),
  });
  if (lastfm.data?.length) {
    const counts = Object.fromEntries(lastfm.data.map((p) => [p.track.Id, p.playcount]));
    return { tracks: lastfm.data.map((p) => p.track), playsOf: (t: BaseItem) => counts[t.Id], source: 'Last.fm' as const };
  }
  return { tracks: mine, playsOf: undefined, source: 'you' as const };
}

export function Artist({ id }: { id: string }) {
  const itemQ = useItem(id);
  const item = itemQ.data;
  const client = useAuth((s) => s.client);
  const popular = usePopular(item);
  const albums = useArtistAlbums(id).data;
  const appears = useAppearsOn(id).data;
  const similar = useSimilarArtists(id).data;
  const [showAll, setShowAll] = useState(false);
  const full = albums?.filter((a) => !isSingleOrEp(a));
  const singles = albums?.filter(isSingleOrEp);
  const backdrop = item && client ? client.backdropUrl(item, 1600) : undefined;
  const following = !!item?.UserData?.IsFavorite;
  if (itemQ.isError && !item) return <div className="page"><QueryState q={itemQ} what="this artist" /></div>;
  return (
    <div>
      <div className={`artist-hero${backdrop ? ' with-image' : ''}`} style={backdrop ? { backgroundImage: `url("${backdrop}")` } : undefined}>
        {!backdrop ? (
          <LibraryHeader item={item} kind="Artist" meta={item?.Genres?.slice(0, 3).join(' · ')} />
        ) : (
          <div className="artist-name">
            <div className="kind">Artist</div>
            <h1>{item?.Name}</h1>
            <div className="meta">{item?.Genres?.slice(0, 3).join(' · ')}</div>
          </div>
        )}
      </div>
      <ActionBar
        tracks={popular.tracks}
        item={item}
        shuffleFirst
        extra={
          <button className={`pill${following ? ' on' : ''}`} aria-pressed={following} onClick={() => item && void setLiked([item], !following)}>
            {following ? 'Following' : 'Follow'}
          </button>
        }
      />
      {popular.tracks.length ? (
        <>
          <div className="page" style={{ paddingTop: 0, paddingBottom: 4 }}>
            <h2>
              Popular <span className="muted small">{popular.source === 'Last.fm' ? 'worldwide plays from Last.fm' : 'your plays'}</span>
            </h2>
          </div>
          <TrackTable tracks={showAll ? popular.tracks : popular.tracks.slice(0, 5)} album plays playsOf={popular.playsOf} />
        </>
      ) : null}
      {popular.tracks.length > 5 ? (
        <div className="page" style={{ padding: '0 28px' }}>
          <button className="textbtn" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show Less' : 'See More'}
          </button>
        </div>
      ) : null}
      <div className="page">
        <Shelf title="Albums" items={full} />
        <Shelf title="Singles and EPs" items={singles} />
        <Shelf title="Appears On" items={appears} />
        <Shelf title="Fans Also Like" items={similar} />
        {item?.Overview ? (
          <section className="shelf">
            <h2 style={{ marginBottom: 10 }}>About</h2>
            <p className="overview">{item.Overview}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
