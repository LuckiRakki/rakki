// The web mod's settings that LyricsAnimator reads, fixed at the web mod's defaults (where 1 =
// official Spicy Lyrics). The web mod has a settings panel for them; the desktop doesn't yet.
export const Settings = {
  values: {
    glowEnabled: true,
    glowStrength: 1,
    wordPop: 1,
    wordLift: 1,
    sweepBand: 20,
    spellingEnabled: true,
    spellMinMs: 1000,
    letterPop: 1,
    letterGlow: 1,
    motionSpeed: 1,
    motionDamping: 1,
    lineGlowEnabled: true,
    lineGlowAmount: 0.18,
    lineBlurEnabled: true,
    blurPerLine: 1.25,
    gapDotsMs: 4000,
    dotRise: 0.95,
    lrcSweep: true,
    lrcBand: 20,
    unsyncedAutoScroll: true,
  },
};
