// Haptics, if they're on (Customize → Feel). Three kinds, used sparingly:
//   tick()    – a light click: buttons, choices, chips
//   thud()    – a firmer bump: long-press menus, picking up a song to drag
//   success() – something finished: added to a playlist, a download started
import * as Haptics from 'expo-haptics';

import { useAppearance } from '@/appearance/store';

const on = () => useAppearance.getState().haptics;

export function tick() {
  if (on()) void Haptics.selectionAsync().catch(() => {});
}

export function thud() {
  if (on()) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function success() {
  if (on()) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
