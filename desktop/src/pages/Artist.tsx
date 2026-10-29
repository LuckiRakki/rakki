// An artist's page: the picture, popular songs (Last.fm's worldwide plays when there's a key,
// else yours), albums, singles, appearances, similar artists and the biography. They arrive in
// that order (ui/reveal.tsx): Popular and Albums hold their places while they load; the rest
// (often empty) join at the bottom once settled, so nothing above them ever moves.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { artColor } from '@/lib/blurhash';
import { isSingleOrEp } from '@/lib/items';
import { artistTopTracks, matchPopular } from '@/lib/lastfm';
import { useSettings } from '@/settings/store';
import { useAuth } from '~/auth/session';
import { setLiked } from '~/library/actions';
import { useAppearsOn, useArtistAlbums, useArtistTracks, useItem, useSimilarArtists, useTopTracks } from '~/queries';
import { ActionBar, LibraryHeader, Picture, Shelf, TrackTable } from '~/ui/parts';
import { Bar, partOf, Reveal, revealProps, ShelfSkeleton, useReveal, type Part, type Step } from '~/ui/reveal';
import { QueryState } from '~/ui/states';

/** The artist's most played songs worldwide (Last.fm, matched to your library), else by your plays. */
function usePopular(artist: BaseItem | undefined) {
  const key = useSettings((s) => s.lastfmApiKey.trim());
  const sortMine = useSettings((s) => s.popularSort === 'mine');
  const mineQ = useTopTracks(artist?.Id ?? '');
  const mine = mineQ.data ?? [];
  const library = useArtistTracks(artist?.Id ?? '').data;
  const fromLastfm = !!artist && !!key && !sortMine;
  const lastfm = useQuery({
    queryKey: ['artistPopular', artist?.Id],
    enabled: fromLastfm && !!library,
    staleTime: 24 * 3600_000,
    queryFn: async () => matchPopular(await artistTopTracks(artist!.Name), library!, artist!.Id).slice(0, 10),
  });
  // Still loading: your plays, and Last.fm's when it's in use (so the list doesn't swap after showing).
  const loading = !mineQ.data && !mineQ.isError ? true : fromLastfm && !lastfm.data && !lastfm.isError;
  if (lastfm.data?.length) {
    const counts = Object.fromEntries(lastfm.data.map((p) => [p.track.Id, p.playcount]));
    return { tracks: lastfm.data.map((p) => p.track), playsOf: (t: BaseItem) => counts[t.Id], source: 'Last.fm' as const, loading: false };
  }
  return { tracks: mine, playsOf: undefined, source: 'you' as const, loading };
}

/** Popular: the heading, five songs (ten with See More), and the button; placeholder rows until then. */
function Popular({ popular, step }: { popular: ReturnType<typeof usePopular>; step: Step }) {
  const [showAll, setShowAll] = useState(false);
  const holding = step.show === 'placeholder';
  return (
    <>
      <div className="page" style={{ paddingTop: 0, paddingBottom: 4 }}>
        {holding ? (
          <Bar as="h2" width={18} />
        ) : (
          <h2>
            Popular <span className="muted small">{popular.source === 'Last.fm' ? 'worldwide plays from Last.fm' : 'your plays'}</span>
          </h2>
        )}
      </div>
      <TrackTable tracks={showAll ? popular.tracks : popular.tracks.slice(0, 5)} step={step} holdRows={5} album plays playsOf={popular.playsOf} />
      {holding || popular.tracks.length > 5 ? (
        <div className="page" style={{ padding: '0 28px', visibility: holding ? 'hidden' : undefined }}>
          <button className="textbtn" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show Less' : 'See More'}
          </button>
        </div>
      ) : null}
    </>
  );
}

export function Artist({ id }: { id: string }) {
  const itemQ = useItem(id);
  const item = itemQ.data;
  const client = useAuth((s) => s.client);
  const popular = usePopular(item);
  const albums = useArtistAlbums(id).data;
  const appears = useAppearsOn(id).data;
  const similar = useSimilarArtists(id).data;
  const full = albums?.filter((a) => !isSingleOrEp(a));
  const singles = albums?.filter(isSingleOrEp);
  const backdrop = item && client ? client.backdropUrl(item, 1600) : undefined;
  const following = !!item?.UserData?.IsFavorite;
  const later = (list: BaseItem[] | undefined): Part => partOf(list, { reserve: false });
  const [hero, popularStep, albumsStep, singlesStep, appearsStep, similarStep, aboutStep] = useReveal([
    partOf(item, { failed: itemQ.isError }),
    popular.loading ? 'loading' : popular.tracks.length ? 'ready' : 'empty',
    partOf(full),
    later(singles),
    later(appears),
    later(similar),
    item?.Overview ? 'ready' : 'empty',
  ]);
  if (itemQ.isError && !item) return <div className="page"><QueryState q={itemQ} what="this artist" /></div>;
  return (
    <div>
      <div className={`artist-hero${backdrop ? ' with-image' : ''}`} style={backdrop && item && client ? { background: artColor(client.blurhash(item), '#26262a') } : undefined}>
        {backdrop ? <Picture key={backdrop} src={backdrop} className="hero-img" /> : null}
        {!backdrop ? (
          <LibraryHeader item={item} step={hero} kind="Artist" meta={item?.Genres?.slice(0, 3).join(' · ')} />
        ) : (
          <div {...revealProps(hero)} className={['artist-name', revealProps(hero).className].filter(Boolean).join(' ')}>
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
      {popularStep.show !== 'none' ? <Popular popular={popular} step={popularStep} /> : null}
      <div className="page">
        <Reveal step={albumsStep} placeholder={<ShelfSkeleton />}>
          <Shelf title="Albums" items={full} />
        </Reveal>
        <Reveal step={singlesStep}>
          <Shelf title="Singles and EPs" items={singles} />
        </Reveal>
        <Reveal step={appearsStep}>
          <Shelf title="Appears On" items={appears} />
        </Reveal>
        <Reveal step={similarStep}>
          <Shelf title="Fans Also Like" items={similar} />
        </Reveal>
        <Reveal step={aboutStep}>
          <section className="shelf">
            <h2 style={{ marginBottom: 10 }}>About</h2>
            <p className="overview">{item?.Overview}</p>
          </section>
        </Reveal>
      </div>
    </div>
  );
}
