// Giving memory back. iOS closes background apps that hold a lot of it (the performance log
// showed Rakki at 450–570 MB, and 14 background "memory pressure" closes in a day), so when
// Rakki has been in the background for about 3 minutes, or iOS says memory is low, it drops what it can get back
// cheaply: decoded pictures (they come back from the disk cache) and cached server answers no
// screen is showing (fetched again if one needs them).
import { Image } from 'expo-image';
import { AppState } from 'react-native';

import { queryClient } from '@/api/queries';
import { letGoNow, onLetGo } from '@/lib/appActive';
import { notePerf } from '@/perf/events';

function release(reason: 'background' | 'memoryWarning') {
  void Image.clearMemoryCache().catch(() => {});
  const cache = queryClient.getQueryCache();
  let dropped = 0;
  for (const q of cache.findAll({ type: 'inactive' })) {
    cache.remove(q);
    dropped++;
  }
  if (reason === 'memoryWarning') notePerf('memoryWarning', { dropped });
}

let started = false;

/** Once, at launch (the root layout). */
export function startMemoryCare() {
  if (started) return;
  started = true;
  // Not at once: a quick trip to another app shouldn't cost the covers (about 3 minutes, lib/appActive.ts).
  onLetGo(() => release('background'));
  AppState.addEventListener('memoryWarning', () => {
    letGoNow();
    release('memoryWarning');
  });
}
