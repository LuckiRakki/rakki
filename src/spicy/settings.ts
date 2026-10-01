// The Spicy renderer's tunables (the web mod's Settings), kept apart from scene.ts: importing
// anything that touches Skia would load Skia before CanvasKit is ready in the web preview.

export interface SpicySettings {
  glowEnabled: boolean;
  glowStrength: number;
  wordPop: number;
  wordLift: number;
  sweepBand: number;
  spellingEnabled: boolean;
  spellMinMs: number;
  letterPop: number;
  letterGlow: number;
  motionSpeed: number;
  motionDamping: number;
  lineGlowEnabled: boolean;
  lineGlowAmount: number;
  lineBlurEnabled: boolean;
  blurPerLine: number;
  gapDotsMs: number;
  dotRise: number;
  lrcSweep: boolean;
  lrcBand: number;
  unsyncedAutoScroll: boolean;
  /** Rakki: 'center' centres every line (duets too); 'left' is the web mod's layout. */
  align: 'left' | 'center';
  /** Rakki: the lyrics colour, as #rrggbb (white in the web mod). */
  color: string;
}

export const SPICY_DEFAULTS: SpicySettings = {
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
  dotRise: 0.7, // web mod: 0.95; lowered a touch on request (2026-09-30)
  lrcSweep: true,
  lrcBand: 20,
  unsyncedAutoScroll: true,
  align: 'left',
  color: '#ffffff',
};
