import { useEffect, useState } from 'react';

import { engine, type Progress } from '@/player/engine';

/** Playback position for UI, polled from the engine (a cheap synchronous call). */
export function useProgress(intervalMs = 500): Progress {
  const [progress, setProgress] = useState<Progress>(() => engine.getProgress());
  useEffect(() => {
    const id = setInterval(() => setProgress(engine.getProgress()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return progress;
}
