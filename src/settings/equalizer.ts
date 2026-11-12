// The equalizer's bands and presets, shared by the phone (Settings → Playback → Equalizer, run
// in the native engine) and the desktop (the same setting plus each song's Edit Audio, in mpv).

/** The EQ's bands, in Hz. */
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const FLAT_EQ = EQ_BANDS.map(() => 0);

export const EQ_PRESETS: { id: string; label: string; eq: number[] }[] = [
  { id: 'flat', label: 'Flat', eq: FLAT_EQ },
  { id: 'bass', label: 'Bass Boost', eq: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: 'treble', label: 'Treble Boost', eq: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
  { id: 'vocal', label: 'Vocal', eq: [-2, -2, -1, 0, 2, 4, 4, 2, 0, -1] },
  { id: 'loudness', label: 'Loudness', eq: [5, 4, 2, 0, -1, -1, 0, 2, 4, 5] },
  { id: 'acoustic', label: 'Acoustic', eq: [3, 3, 2, 1, 1, 1, 2, 3, 2, 1] },
  { id: 'electronic', label: 'Electronic', eq: [4, 4, 1, 0, -2, 1, 0, 1, 4, 5] },
  { id: 'late-night', label: 'Late Night', eq: [-3, -2, -1, 0, 1, 2, 2, 1, -1, -3] },
];

/** The preset these gains match, if any. */
export const eqPreset = (bands: number[]) => EQ_PRESETS.find((p) => p.eq.every((v, i) => v === bands[i]))?.id;
