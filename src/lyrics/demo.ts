// Made-up lyrics on a looping clock: the dev demo (/lyrics-demo) and the Lyrics style preview.
// They exercise everything: word timing, a long held note, background vocals, a duet, a pause.
import type { LyricLine, Lyrics, WordCue } from '@/lyrics/types';

export const LOOP_MS = 30_000;

/** Words spread evenly over [start, end]; `hold` gives one word a long, spelled-out duration. */
function words(text: string, start: number, end: number, hold?: { word: string; ms: number }): WordCue[] {
  const parts = text.split(' ');
  const holdMs = hold ? hold.ms : 0;
  const each = (end - start - holdMs) / (parts.length - (hold ? 1 : 0));
  let t = start;
  return parts.map((p, i) => {
    const dur = hold && p === hold.word ? holdMs : each;
    const cue = { text: i < parts.length - 1 ? `${p} ` : p, startMs: Math.round(t), endMs: Math.round(t + dur) };
    t += dur;
    return cue;
  });
}

function line(text: string, start: number, end: number, opts: Partial<LyricLine> & { hold?: { word: string; ms: number } } = {}): LyricLine {
  return { text, startMs: start, endMs: end, words: words(text, start, end, opts.hold), agent: opts.agent ?? 'v1', bgWords: opts.bgWords };
}

export const DEMO_LYRICS: Lyrics = {
  kind: 'ttml',
  isSynced: true,
  hasWordCues: true,
  songwriters: ['Rakki Demo'],
  source: 'spicy_lyrics',
  attribution: { maker: { username: 'demo', url: '' } },
  lines: [
    line('Rakki runs the lyrics now', 1000, 3400),
    line('every single word begins to glow', 3500, 6600, {
      hold: { word: 'glow', ms: 1300 },
      bgWords: words('(glow, glow)', 5800, 7000),
    }),
    line('and the second voice replies', 7100, 9400, { agent: 'v2' }),
    line('somewhere on the other side', 9500, 11800),
    // 5 s pause → interlude dots
    line('back again after the break', 17000, 19600),
    line('holding on to one long note', 19700, 23300, { hold: { word: 'long', ms: 1600 } }),
    line('we sing it all together', 23400, 26000, { agent: 'v2' }),
  ],
};
