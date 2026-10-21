// The lyrics in the main area (the Lyrics button, as in Spotify with Spicy Lyrics): the page
// makes way for big lyrics over the cover flowing and blurred in its colours, while the
// sidebars stay (the right one keeps Now Playing, About the artist, Credits and Next in queue).
// Spicy (word by word) or Regular, as chosen in Lyrics Settings. Lyrics again, Esc, Back or
// opening any page puts the page back; Full Screen opens the full player's full-screen lyrics.
import { useLyrics } from '@/lyrics/fetch';
import { artColor } from '@/lib/blurhash';
import { useSettings } from '@/settings/store';
import { useActiveTheme } from '~/themes/themes';
import { useAuth } from '~/auth/session';
import { useLayout } from '~/layout/layout';
import { LyricsSettings } from '~/lyrics/LyricsSettings';
import { LyricsView, pickLyrics } from '~/lyrics/LyricsView';
import { usePlayer } from '~/player/store';
import { SpicyView } from '~/spicy/SpicyView';
import { DynamicBackground } from '~/ui/DynamicBackground';
import { Expand, MicVocal } from '~/ui/icons';
import { Loading } from '~/ui/states';

export function LyricsMain() {
  const item = usePlayer((s) => s.queue[s.index]);
  const client = useAuth((s) => s.client);
  const mode = useSettings((s) => s.lyricsMode);
  // The full player over it: the lyrics and the background rest.
  const covered = useLayout((s) => s.nowPlaying);
  const q = useLyrics(item?.Radio ? undefined : item?.Id);
  const lyrics = pickLyrics(q.data);
  const tint = item && client ? artColor(client.blurhash(item), '#202024') : '#202024';
  const image = item ? client?.imageUrl(item, 500) : undefined;
  // A theme that already flows behind the whole app (Kawarp): the lyrics sit on that one.
  const ownBackground = useActiveTheme().meta.backdrop !== 'flow';
  const l = useLayout.getState();

  return (
    <div className="lyrics-main" style={{ ['--tint' as string]: tint }}>
      {ownBackground ? (
        <>
          <div className="lm-solid" />
          <DynamicBackground image={image} active={!covered} />
        </>
      ) : null}
      <div className="lm-shade" />
      <div className="lm-tools">
        {lyrics ? <LyricsSettings itemId={item?.Id} /> : null}
        <button
          className="iconbtn"
          aria-label="Full Screen Lyrics"
          title="Full Screen Lyrics (F11)"
          disabled={!item}
          onClick={() => {
            l.setLyricsView(false);
            l.setNowPlaying(true, 'lyrics');
            l.setFullscreen(true);
          }}>
          <Expand size={19} />
        </button>
      </div>
      <div className="lm-body">
        {!item ? (
          <Empty text="Play something to see its lyrics." />
        ) : item.Radio ? (
          <Empty text="No lyrics for radio." />
        ) : q.isLoading ? (
          <Loading what="lyrics" />
        ) : !lyrics ? (
          <Empty text="No Lyrics Found" detail="This song has no lyrics on your server." />
        ) : mode === 'spicy' ? (
          <SpicyView key={item.Id} lyrics={lyrics} itemId={item.Id} active={!covered} onNextUp={() => l.setPanel('queue')} />
        ) : (
          <LyricsView variant="big" />
        )}
      </div>
    </div>
  );
}

function Empty({ text, detail }: { text: string; detail?: string }) {
  return (
    <div className="lm-empty">
      <MicVocal size={40} />
      <h2>{text}</h2>
      {detail ? <p>{detail}</p> : null}
    </div>
  );
}
