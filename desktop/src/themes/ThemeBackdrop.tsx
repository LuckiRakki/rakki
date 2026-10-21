// What a theme puts behind the whole window (its @backdrop): the playing cover, blurred and
// still (`album`, as Lucid does in Spotify), or flowing like the full player's (`flow`). The
// panels sit on it see-through. A still one is one blurred picture: the blur is drawn once per
// song, so it costs nothing while the song plays. The theme sets how blurred, bright and
// saturated it is (--backdrop-blur, --backdrop-brightness, --backdrop-saturation).
import { useAuth } from '~/auth/session';
import { useLayout } from '~/layout/layout';
import { usePlayer } from '~/player/store';
import { useVideo } from '~/player/video';
import { DynamicBackground } from '~/ui/DynamicBackground';

import { useActiveTheme } from './themes';

export function ThemeBackdrop() {
  const mode = useActiveTheme().meta.backdrop;
  const client = useAuth((s) => s.client);
  const song = usePlayer((s) => s.queue[s.index]);
  const video = useVideo((s) => s.video);
  // The full player covers the window with its own background: a flowing one rests under it.
  const covered = useLayout((s) => s.nowPlaying);
  const item = video && client?.blurhash(video) ? video : song;
  const image = item && client ? client.imageUrl(item, 500) : undefined;
  if (mode === 'none') return null;
  return (
    <div className="theme-backdrop" aria-hidden>
      {mode === 'flow' ? <DynamicBackground image={image} active={!covered} /> : image ? <img key={image} src={image} alt="" /> : null}
    </div>
  );
}
