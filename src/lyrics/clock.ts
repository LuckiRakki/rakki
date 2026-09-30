import { engine } from '@/player/engine';

/**
 * Playback time in ms, smooth every frame. The native engine already interpolates
 * getProgress(); the fallback engine only updates every 250 ms, so we extrapolate between
 * its updates with the wall clock.
 */
export function createPlaybackClock() {
  let lastPos = -1;
  let lastWall = 0;
  return {
    nowMs(): number {
      const p = engine.getProgress();
      const wall = Date.now();
      if (p.position !== lastPos) {
        lastPos = p.position;
        lastWall = wall;
      }
      return (lastPos + (p.playing ? (wall - lastWall) / 1000 : 0)) * 1000;
    },
    durationMs(): number {
      return engine.getProgress().duration * 1000;
    },
  };
}
