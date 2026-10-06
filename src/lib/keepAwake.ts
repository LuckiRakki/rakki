// Screen sleep. The lyrics and music video screens keep the screen on, and so does a music
// video while it plays (in the mini-player too); everywhere else iOS auto-locks as usual. Holds
// use fixed tags and are counted here, so the screen is let go exactly when the last one
// closes, and a reset at launch clears a hold left over from before a reload.
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

export type AwakeScreen = 'lyrics' | 'video' | 'videoPlaying';

const held: Record<AwakeScreen, number> = { lyrics: 0, video: 0, videoPlaying: 0 };
const tag = (screen: AwakeScreen) => `rakki.awake.${screen}`;

/** Keep the screen on while this screen is showing (and `on`). */
export function useScreenAwake(screen: AwakeScreen, on = true) {
  useEffect(() => {
    if (!on) return;
    if (held[screen]++ === 0) void activateKeepAwakeAsync(tag(screen)).catch(() => {});
    return () => {
      if (--held[screen] === 0) void deactivateKeepAwake(tag(screen)).catch(() => {});
    };
  }, [screen, on]);
}

/** At launch: let the screen sleep (iOS keeps it on only while a hold is active). */
export function resetScreenAwake() {
  void deactivateKeepAwake('rakki.awake.reset').catch(() => {});
}
