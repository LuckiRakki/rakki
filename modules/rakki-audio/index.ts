// JS side of the native Rakki audio engine (modules/rakki-audio/ios). The module only exists
// in our own iOS builds; on web, Android and in Expo Go `RakkiAudio` is null and the app uses
// the expo-audio fallback engine instead (src/player/engine).
import { NativeModule, requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import type { ColorValue, ViewProps } from 'react-native';

export type RepeatMode = 'off' | 'all' | 'one';

export interface RakkiTrack {
  /** Unique per queue entry (the same song can be queued twice). */
  key: string;
  /** Jellyfin item id. */
  id: string;
  url: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string | null;
  /** Seconds. */
  duration: number;
  /** Linear volume factor, 0–1. */
  gain: number;
}

export interface StateEvent {
  playing: boolean;
  buffering: boolean;
  index: number | null;
  key: string | null;
  repeatMode: RepeatMode;
  /** True once when the queue ran out (repeat off). */
  ended: boolean;
}

export interface TrackChangeEvent {
  index: number;
  key: string;
  id: string;
  previousKey: string | null;
  /** Where the previous song stopped, in seconds (its duration if it played to the end). */
  previousPosition: number | null;
  reason: 'skip' | 'ended' | 'queueEnded';
}

export interface ErrorEvent {
  key: string | null;
  index: number | null;
  message: string;
}

export interface Progress {
  position: number;
  duration: number;
  buffered: number;
  playing: boolean;
}

type RakkiAudioEvents = {
  onState(event: StateEvent): void;
  onTrackChange(event: TrackChangeEvent): void;
  onError(event: ErrorEvent): void;
};

declare class RakkiAudioModule extends NativeModule<RakkiAudioEvents> {
  setQueue(tracks: RakkiTrack[], startIndex: number, startPosition: number, autoplay: boolean): Promise<void>;
  updateQueue(tracks: RakkiTrack[]): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  togglePlayPause(): Promise<void>;
  skipToNext(): Promise<void>;
  skipToPrevious(): Promise<void>;
  skipTo(index: number): Promise<void>;
  seekTo(seconds: number): Promise<void>;
  setRepeatMode(mode: RepeatMode): Promise<void>;
  setVolume(volume: number): Promise<void>;
  stop(): Promise<void>;
  /** Synchronous; cheap enough to call every frame. */
  getProgress(): Progress;
}

/** null where the native engine isn't built in (web, Android, Expo Go). */
export const RakkiAudio = requireOptionalNativeModule<RakkiAudioModule>('RakkiAudio');

export interface RoutePickerProps extends ViewProps {
  tintColor?: ColorValue;
  activeTintColor?: ColorValue;
}

let routePicker: ComponentType<RoutePickerProps> | null = null;

/** The native AirPlay / output picker, or null where it isn't available. */
export function getRoutePicker(): ComponentType<RoutePickerProps> | null {
  if (!RakkiAudio) return null;
  routePicker ??= requireNativeView<RoutePickerProps>('RakkiAudio');
  return routePicker;
}
