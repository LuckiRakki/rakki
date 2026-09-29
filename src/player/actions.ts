// Long-press menu for a song. Phase 3 replaces this with Rakki's own context sheet; for now
// the iOS action sheet gives Play next / Add to queue everywhere.
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { usePlayer } from '@/player/store';

export function showTrackActions(track: BaseItem) {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  const favorite = track.UserData?.IsFavorite ?? false;
  const actions: { label: string; run: () => void }[] = [
    { label: 'Play next', run: () => usePlayer.getState().playNext([track]) },
    { label: 'Add to queue', run: () => usePlayer.getState().addToQueue([track]) },
    {
      label: favorite ? 'Remove from Liked Songs' : 'Add to Liked Songs',
      run: () => usePlayer.getState().setFavorite(track.Id, !favorite),
    },
  ];
  if (track.AlbumId) {
    actions.push({ label: 'Go to album', run: () => router.push(`/album/${track.AlbumId}`) });
  }

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: track.Name,
        options: [...actions.map((a) => a.label), 'Cancel'],
        cancelButtonIndex: actions.length,
        userInterfaceStyle: 'dark',
      },
      (i) => actions[i]?.run(),
    );
    return;
  }
  Alert.alert(track.Name, undefined, [
    ...actions.map((a) => ({ text: a.label, onPress: a.run })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}
