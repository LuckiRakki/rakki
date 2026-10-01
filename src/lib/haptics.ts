// Haptics, if they're on (Customize → Feel).
import * as Haptics from 'expo-haptics';

import { useAppearance } from '@/appearance/store';

/** A light click: buttons, menu choices. */
export function tick() {
  if (useAppearance.getState().haptics) void Haptics.selectionAsync().catch(() => {});
}
