// The song's position for things that show it (seek bars, the mini player).
import { useEffect, useState } from 'react';

import { currentPosition, usePlayer } from '~/player/store';

/** The song's position, redrawn a few times a second while playing and visible (never while hidden). */
export function useLivePosition(): number {
  const [, tick] = useState(0);
  const playing = usePlayer((s) => s.playing);
  const hidden = usePlayer((s) => s.hidden);
  usePlayer((s) => s.position);
  useEffect(() => {
    if (!playing || hidden) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [playing, hidden]);
  return currentPosition(usePlayer.getState());
}
