// Home: a greeting, quick picks and shelves, in the order you set (pages/homeLayout.tsx).
import type { BaseItem } from '@/api/jellyfin';
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
import { Empty, QueryState } from '~/ui/states';

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Liked Songs and your last albums as wide tiles, like Spotify's (and the phone app's) quick picks. */
function QuickPicks({ recent }: { recent?: BaseItem[] }) {
  const tiles = (recent ?? []).slice(0, 7);
  const tile = (key: string, label: string, art: React.ReactNode, onClick: () => void, item?: BaseItem) => (
    <button key={key} className="quick" onClick={onClick} onDoubleClick={item ? () => void playItem(item) : undefined}>
      {art}
      <span>{label}</span>
    </button>
  );
  return (
    <div className="quick-grid">
      {tile(
        'liked',
        'Liked Songs',
        <div className="artwork empty liked-art quick-art">
          <Heart size={22} fill="#fff" />
        </div>,
        () => go({ name: 'liked' }),
      )}
      {tiles.map((a) => tile(a.Id, a.Name, <Artwork item={a} size={120} className="quick-art" />, () => go({ name: 'album', id: a.Id }), a))}
    </div>
  );
}

// Each section fetches its own shelf, so hidden ones cost nothing.
const HOME_SECTIONS: Record<HomeSection, () => React.ReactNode> = {
  quick: () => <QuickPicks recent={useRecentlyPlayed().data} />,
  mixes: () => <Shelf title={SECTION_LABEL.mixes} items={useDailyMixes().data} onShowAll={() => go({ name: 'mixes' })} />,
  jump: () => <Shelf title={SECTION_LABEL.jump} items={useRecentlyPlayed().data?.slice(7)} />,
  added: () => <Shelf title={SECTION_LABEL.added} items={useRecentlyAdded().data} onShowAll={() => go({ name: 'albums' })} />,
  playlists: () => <Shelf title={SECTION_LABEL.playlists} items={usePlaylists().data} onShowAll={() => go({ name: 'playlists' })} />,
  artists: () => <Shelf title={SECTION_LABEL.artists} items={useTopArtists().data} onShowAll={() => go({ name: 'artists' })} />,
  most: () => <Shelf title={SECTION_LABEL.most} items={useMostPlayed().data} />,
  rediscover: () => <Shelf title={SECTION_LABEL.rediscover} items={useRediscover().data} />,
  random: () => <Shelf title={SECTION_LABEL.random} items={useRandomAlbums().data} />,
};

function HomeSectionView({ id }: { id: HomeSection }) {
  return <>{HOME_SECTIONS[id]()}</>;
}

export function Home() {
  const { order, hidden } = useHomeLayout();
  const recent = useRecentlyPlayed();
  const added = useRecentlyAdded();
  // A new library: nothing played and nothing added yet.
  const fresh = recent.data?.length === 0 && added.data?.length === 0;
  const shown = order.filter((id) => !hidden.includes(id));
  // Quick picks first: they sit on the top band with the greeting.
  const top = !fresh && shown[0] === 'quick';
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
        {top ? <HomeSectionView id="quick" /> : null}
      </div>
      {fresh ? (
        <Empty
          icon={Disc3}
          title="Nothing Played Yet"
          detail="Albums you play show up here, with your mixes and playlists."
          action={{ label: 'Browse Albums', run: () => go({ name: 'albums' }) }}
        />
      ) : (
        (top ? shown.slice(1) : shown).map((id) => <HomeSectionView key={id} id={id} />)
      )}
      <QueryState q={recent} what="Home" />
    </div>
  );
}
