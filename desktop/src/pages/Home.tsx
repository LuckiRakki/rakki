// Home: a greeting, quick picks and shelves, in the order you set (pages/homeLayout.tsx). While
// it loads, each section holds its place with a placeholder, and they arrive top to bottom
// (ui/reveal.tsx), so nothing jumps.
import { useEffect } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { noteEmpty, wasEmpty } from '@/lib/shapes';
import { playItem } from '~/library/actions';
import { go } from '~/nav';
import { openCustomizeHome, SECTION_LABEL, useHomeLayout, type HomeSection } from '~/pages/homeLayout';
import {
  useDailyMixes,
  useMostPlayed,
  usePlaylists,
  useRandomAlbums,
  useRecentlyAdded,
  useRecentlyPlayed,
  useRediscover,
  useTopArtists,
} from '~/queries';
import { Disc3, Heart, SlidersHorizontal } from '~/ui/icons';
import { Artwork, Shelf } from '~/ui/parts';
import { QuickSkeleton, Reveal, revealProps, ShelfSkeleton, useReveal, type Part, type Step } from '~/ui/reveal';
import { Empty, LoadError } from '~/ui/states';

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const QUICK_TILES = 7;

/**
 * Liked Songs and your last albums as wide tiles, like Spotify's (and the phone app's) quick
 * picks. Liked Songs is there at once; the albums' tiles hold their places, then fade in one by one.
 */
function QuickPicks({ recent, step }: { recent?: BaseItem[]; step: Step }) {
  const tiles = (recent ?? []).slice(0, QUICK_TILES);
  const beat = (i: number): Step => ({ ...step, delay: step.delay + i * 35 });
  return (
    <div className="quick-grid">
      <button className="quick" onClick={() => go({ name: 'liked' })}>
        <div className="artwork empty liked-art quick-art">
          <Heart size={22} fill="#fff" />
        </div>
        <span>Liked Songs</span>
      </button>
      {step.show === 'content'
        ? tiles.map((a, i) => {
            const fade = revealProps(beat(i));
            return (
              <button
                key={a.Id}
                className={['quick', fade.className].filter(Boolean).join(' ')}
                style={fade.style}
                onClick={() => go({ name: 'album', id: a.Id })}
                onDoubleClick={() => void playItem(a)}>
                <Artwork item={a} size={120} className="quick-art" />
                <span>{a.Name}</span>
              </button>
            );
          })
        : Array.from({ length: QUICK_TILES }, (_, i) => (
            <div key={i} {...revealProps(beat(i))}>
              <QuickSkeleton i={i} />
            </div>
          ))}
    </div>
  );
}

export function Home() {
  const { order, hidden } = useHomeLayout();
  const shown = order.filter((id) => !hidden.includes(id));
  const on = (id: HomeSection) => shown.includes(id);
  const recent = useRecentlyPlayed();
  const added = useRecentlyAdded();
  const mixes = useDailyMixes();
  const playlists = usePlaylists();
  const artists = useTopArtists(on('artists'));
  const most = useMostPlayed(on('most'));
  const rediscover = useRediscover(on('rediscover'));
  const random = useRandomAlbums(on('random'));
  // Each shelf: its items, whether it failed, and Show All.
  const shelves: Record<Exclude<HomeSection, 'quick'>, { items?: BaseItem[]; failed: boolean; showAll?: () => void }> = {
    mixes: { items: mixes.data, failed: mixes.isError, showAll: () => go({ name: 'mixes' }) },
    jump: { items: recent.data?.slice(QUICK_TILES), failed: recent.isError },
    added: { items: added.data, failed: added.isError, showAll: () => go({ name: 'albums' }) },
    playlists: { items: playlists.data, failed: playlists.isError, showAll: () => go({ name: 'playlists' }) },
    artists: { items: artists.data, failed: artists.isError, showAll: () => go({ name: 'artists' }) },
    most: { items: most.data, failed: most.isError },
    rediscover: { items: rediscover.data, failed: rediscover.isError },
    random: { items: random.data, failed: random.isError },
  };
  // A new library: nothing played and nothing added yet.
  const fresh = recent.data?.length === 0 && added.data?.length === 0;
  // Quick picks first: they sit on the top band with the greeting.
  const top = !fresh && shown[0] === 'quick';

  // What each section is now. One that was empty last time doesn't hold a place while it loads.
  const parts: Part[] = shown.map((id) => {
    if (fresh) return 'empty';
    if (id === 'quick') return recent.data || recent.isError ? 'ready' : 'loading';
    const { items, failed } = shelves[id];
    if (items) return items.length ? 'ready' : 'empty';
    return failed || wasEmpty(`home.${id}`) ? 'empty' : 'loading';
  });
  const steps = useReveal(parts);

  // Remember which shelves came back empty, for next time.
  const settled = shown.map((id) => (id === 'quick' ? '' : `${id}:${shelves[id].items ? shelves[id].items.length > 0 : '?'}`)).join(',');
  useEffect(() => {
    for (const entry of settled.split(',')) {
      const [id, has] = entry.split(':');
      if (id && has !== '?') noteEmpty(`home.${id}`, has === 'false');
    }
  }, [settled]);

  const section = (id: HomeSection) => {
    const i = shown.indexOf(id);
    const step = steps[i];
    if (id === 'quick') return <QuickPicks key={id} recent={recent.data} step={step} />;
    const shelf = shelves[id];
    return (
      <Reveal key={id} step={step} placeholder={<ShelfSkeleton round={id === 'artists'} />}>
        <Shelf title={SECTION_LABEL[id]} items={shelf.items} onShowAll={shelf.showAll} />
      </Reveal>
    );
  };

  return (
    <div className="page home">
      <div className="home-top">
        <div className="home-head">
          <h1>{greeting()}</h1>
          <button className="pill-btn" onClick={openCustomizeHome} title="Reorder or hide Home's sections">
            <SlidersHorizontal size={16} />
            Customize
          </button>
        </div>
        {top ? section('quick') : null}
      </div>
      {fresh ? (
        <Empty
          icon={Disc3}
          title="Nothing Played Yet"
          detail="Albums you play show up here, with your mixes and playlists."
          action={{ label: 'Browse Albums', run: () => go({ name: 'albums' }) }}
        />
      ) : (
        (top ? shown.slice(1) : shown).map(section)
      )}
      {recent.isError && !recent.data ? <LoadError what="Home" error={recent.error} retry={() => void recent.refetch()} /> : null}
    </div>
  );
}
