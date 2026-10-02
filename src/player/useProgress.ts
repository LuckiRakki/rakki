import { useEffect, useState } from 'react';

import { useAppActive } from '@/lib/appActive';
import { engine, type Progress } from '@/player/engine';

/**
 * Playback position for UI, polled from the engine (a cheap synchronous call). Not while the
 * app is in the background: nothing is on screen to update.
 */
export function useProgress(intervalMs = 500): Progress {
  const [progress, setProgress] = useState<Progress>(() => engine.getProgress());
  const active = useAppActive();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setProgress(engine.getProgress()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
  return progress;
}
