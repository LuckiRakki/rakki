// The main area: the page for the current route (nav.ts).
import { AudioEditor } from '~/audio/AudioEditor';
import { LyricsMaker } from '~/lyrics/LyricsMaker';
import { useNav } from '~/nav';
import { Artist } from '~/pages/Artist';
import { Album, Liked, Playlist } from '~/pages/Collections';
import { Home } from '~/pages/Home';
import { Albums, Artists, Genre, Genres, Mixes, Playlists, Songs } from '~/pages/Library';
import { Radio, Videos } from '~/pages/RadioVideos';
import { SearchPage } from '~/pages/Search';
import { Settings } from '~/pages/Settings';

export function Page() {
  const route = useNav((s) => s.route);
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'albums':
      return <Albums />;
    case 'songs':
      return <Songs />;
    case 'artists':
      return <Artists />;
    case 'genres':
      return <Genres />;
    case 'genre':
      return <Genre key={route.id} name={route.id} />;
    case 'playlists':
      return <Playlists />;
    case 'radio':
      return <Radio />;
    case 'videos':
      return <Videos />;
    case 'mixes':
      return <Mixes />;
    case 'liked':
      return <Liked />;
    case 'album':
      return <Album key={route.id} id={route.id} />;
    case 'artist':
      return <Artist key={route.id} id={route.id} />;
    case 'playlist':
      return <Playlist key={route.id} id={route.id} />;
    case 'search':
      return <SearchPage term={route.term ?? ''} />;
    case 'settings':
      return <Settings />;
    case 'editAudio':
      return <AudioEditor key={route.id} id={route.id} />;
    case 'makeLyrics':
      return <LyricsMaker key={route.id} id={route.id} />;
  }
}
