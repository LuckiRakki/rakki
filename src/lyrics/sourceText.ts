// The words for a lyrics source in the source pickers (the phone's Lyrics Style screen and the
// desktop's Lyrics Settings), so both apps say the same thing.
import type { LyricsSourceOption, LyricsSources } from '@/lyrics/source';

const KIND = { word: 'Word by word', line: 'Line by line', plain: 'Not synced' } as const;

/** "Word by word · 48 lines"; Automatic is whichever wins. */
export function sourceDetail(o: LyricsSourceOption): string {
  if (o.source === 'auto' || !o.kind) return 'Made in Rakki first, then your server’s order';
  return o.lines ? `${KIND[o.kind]} · ${o.lines === 1 ? '1 line' : `${o.lines} lines`}` : KIND[o.kind];
}

/** Worth showing: the plugin keeps choices, and the song has more than one source to pick from. */
export function showSourcePicker(s: LyricsSources | undefined): s is LyricsSources {
  return !!s?.supported && (s.options.filter((o) => o.source !== 'auto').length > 1 || (s.choice !== 'auto' && s.options.length > 1));
}
