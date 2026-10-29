import { useEffect, useState } from 'react';

import { useAppActive } from '@/lib/appActive';
import { engine, type Progress } from '@/player/engine';

/**
 * Playback position for UI, polled from the engine (a cheap synchronous call). Not while the
 * app is in the background: nothing is on screen to update. `on` false stops it too (a screen
 * another one covers: the player kept redrawing itself four times a second under the queue).
 */
export function useProgress(intervalMs = 500, on = true): Progress {
  const [progress, setProgress] = useState<Progress>(() => engine.getProgress());
  const active = useAppActive();
  useEffect(() => {
    if (!active || !on) return;
    const id = setInterval(() => setProgress(engine.getProgress()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active, on]);
  return progress;
}
