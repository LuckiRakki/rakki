// What the widgets and controls ask Rakki to do (2.0). Two ways in:
// - rakki://widget/<action> links, from the widget buttons (src/app/+native-intent.ts), which
//   open the app first;
// - App Intents from the Control Center and Lock Screen controls, which run without opening it
//   (plugins/withRakkiIntents.js puts them in the app and the widget extension; the native
//   module hands them over here, see startIntentActions).
// Anything that arrives before the account and the saved queue are back waits for
// widgetActionsReady().
import { AppState } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { queryClient } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { playRandom, tracksOf } from '@/library/actions';
import { displayName, isMix, mixNumber } from '@/lib/mixes';
import { setSleepTimer, useSleepTimer } from '@/player/sleep';
import { usePlayer } from '@/player/store';
import { openPlayer } from '@/ui/nav';
import { showToast } from '@/ui/overlays';

import { RakkiAudio } from '../../modules/rakki-audio';

export type WidgetAction = 'playpause' | 'play' | 'pause' | 'next' | 'shuffle' | 'like' | 'sleep' | 'mix' | 'player';

const ACTIONS = new Set<string>(['playpause', 'play', 'pause', 'next', 'shuffle', 'like', 'sleep', 'mix', 'player']);

/** "/widget/mix/2" or "mix/2" → { action: 'mix', arg: '2' }. */
export function parseWidgetAction(path: string): { action: WidgetAction; arg?: string } | null {
  const parts = path.replace(/^\/+/, '').replace(/^widget\//, '').split('/').filter(Boolean);
  const [action, arg] = parts;
  if (!action || !ACTIONS.has(action)) return null;
  return { action: action as WidgetAction, arg };
}

let ready = false;
const waiting: { action: WidgetAction; arg?: string }[] = [];

export function runWidgetAction(action: WidgetAction, arg?: string) {
  if (!ready) {
    waiting.push({ action, arg });
    return;
  }
  perform(action, arg);
}

/** Signed in and the saved queue restored: run what came in meanwhile. */
export function widgetActionsReady() {
  if (ready) return;
  ready = true;
  // A beat, so the restored queue reaches the player first.
  setTimeout(() => {
    for (const { action, arg } of waiting.splice(0)) perform(action, arg);
  }, 300);
}

function perform(action: WidgetAction, arg?: string) {
  const player = usePlayer.getState();
  const track = player.queue[player.index]?.item;
  switch (action) {
    case 'player':
      openPlayer();
      return;
    case 'playpause':
    case 'play':
    case 'pause':
      if (!track) {
        if (action !== 'pause') void playRandom();
        return;
      }
      if ((action === 'play' && player.playing) || (action === 'pause' && !player.playing)) return;
      player.toggle();
      return;
    case 'next':
      if (track) player.next();
      return;
    case 'shuffle':
      void playRandom();
      return;
    case 'like': {
      if (!track || track.Radio) return;
      const liked = !track.UserData?.IsFavorite;
      player.setFavorite(track.Id, liked);
      showToast(liked ? 'Added to Liked Songs' : 'Removed from Liked Songs');
      return;
    }
    case 'sleep': {
      const { endsAt } = useSleepTimer.getState();
      const left = endsAt ? Math.max(0, Math.round((endsAt - Date.now()) / 60_000)) : 0;
      const minutes = left + 15;
      setSleepTimer(minutes);
      showToast(`Sleep timer: ${minutes} minutes`);
      return;
    }
    case 'mix':
      void playDailyMix(Number(arg) || undefined);
      return;
  }
}

/** Daily Mix `n` (the lowest-numbered one if it's missing or not given). */
async function playDailyMix(n?: number) {
  const client = useAuth.getState().client;
  const userId = useAuth.getState().session?.userId;
  if (!client || !userId) return;
  let playlists = queryClient.getQueryData<BaseItem[]>(['playlists', userId, 'online']);
  if (!playlists) {
    try {
      playlists = (await client.getPlaylists()).Items;
    } catch {
      showToast('Couldn’t reach your server');
      return;
    }
  }
  const mixes = playlists.filter(isMix).sort((a, b) => mixNumber(a) - mixNumber(b));
  const mix = mixes.find((m) => mixNumber(m) === n) ?? mixes[0];
  if (!mix) {
    showToast('No Daily Mixes yet');
    return;
  }
  try {
    const songs = await tracksOf(mix);
    if (!songs.length) return;
    usePlayer.getState().playQueue(songs, { source: { type: 'playlist', id: mix.Id, name: displayName(mix) } });
  } catch {
    showToast('Couldn’t reach your server');
  }
}

let listening = false;

/**
 * The Control Center and Lock Screen controls: take what they asked for whenever the native
 * side rings, when Rakki comes to the front, and now (an intent may have started the app).
 * Builds from before 2.0.0 have no controls.
 */
export function startIntentActions() {
  const audio = RakkiAudio;
  if (listening || !audio?.takeIntents) return;
  listening = true;
  const take = () => {
    let list: string[] = [];
    try {
      list = audio.takeIntents?.() ?? [];
    } catch {
      return;
    }
    const now = Date.now();
    for (const entry of list) {
      const [path = '', at] = entry.split('|');
      // Left over from a time Rakki didn't pick it up: too late to act on.
      const time = Number(at);
      if (Number.isFinite(time) && now - time > 60_000) continue;
      const parsed = parseWidgetAction(path);
      if (parsed) runWidgetAction(parsed.action, parsed.arg);
    }
  };
  audio.addListener('onIntent', take);
  AppState.addEventListener('change', (state) => {
    if (state === 'active') take();
  });
  take();
}
