// The visualizer: Rakki's sound (audio/sound.ts) drawn by audioMotion-analyzer, the library
// Feishin's visualizer uses, set up from Settings → Visualizer (settings/look.ts). It draws only
// while music plays and the window is in view; paused, the last picture stays.
import AudioMotionAnalyzer, { type Options } from 'audiomotion-analyzer';
import { useEffect, useRef } from 'react';

import { mix } from '@/lib/color';

import { soundContext, useSound } from '~/audio/sound';
import { usePlayer } from '~/player/store';
import { usePlayback } from '~/player/VideoHost';
import { useVideo } from '~/player/video';
import { useLook, type VisualizerLook } from '~/settings/look';

const BAR_MODE: Record<VisualizerLook['barsPerOctave'], number> = { 24: 1, 12: 2, 6: 4, 3: 6, 1: 8 };

function accentNow(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#fd642d';
}

/** The gradients the looks use; "accent" follows Lucid, so it's registered again when that changes. */
function registerGradients(a: AudioMotionAnalyzer) {
  a.registerGradient('rakki-mono', { bgColor: '#000', colorStops: [{ color: '#ffffff', pos: 0.7, level: 0.8 }, { color: '#757575' }] });
  // The accent (Lucid's album colour) in Feishin's shape: light at the top, the colour below.
  const accent = accentNow();
  a.registerGradient('rakki-accent', { bgColor: '#000', colorStops: [{ color: mix(accent, '#ffffff', 0.45), pos: 0.7, level: 0.8 }, { color: accent }] });
}

function options(look: VisualizerLook): Options {
  return {
    mode: look.style === 'line' ? 10 : BAR_MODE[look.barsPerOctave],
    gradient: look.colors === 'mono' ? 'rakki-mono' : look.colors === 'accent' ? 'rakki-accent' : look.colors,
    lineWidth: look.style === 'line' ? look.lineWidth : 0,
    fillAlpha: look.style === 'line' ? look.fill : 1,
    alphaBars: look.style === 'bars' && look.fill < 1,
    barSpace: 0.25,
    roundBars: look.style === 'bars',
    reflexRatio: look.reflection,
    reflexAlpha: look.reflection ? 0.1 : 0,
    reflexBright: 1,
    peakLine: look.style === 'line' && look.peaks,
    showPeaks: look.peaks,
    minFreq: look.minFreq,
    maxFreq: look.maxFreq,
    smoothing: look.smoothing,
    // The rest as in Feishin.
    channelLayout: 'single',
    frequencyScale: 'log',
    minDecibels: -85,
    maxDecibels: -25,
    fftSize: 16384,
    maxFPS: 0,
    overlay: true,
    showBgColor: false,
    bgAlpha: 0,
    showScaleX: false,
    showScaleY: false,
  };
}

export function Visualizer({ className }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const analyzer = useRef<AudioMotionAnalyzer | null>(null);
  const look = useLook((s) => s.visualizer);
  const source = useSound(true);
  const musicPlaying = usePlayer((s) => s.playing);
  const videoOpen = useVideo((s) => !!s.video);
  const videoPlaying = usePlayback((s) => s.playing);
  const hidden = usePlayer((s) => s.hidden);
  const playing = videoOpen ? videoPlaying : musicPlaying;

  useEffect(() => {
    // Rakki's gradients are registered before the look (which names them) is applied.
    const a = new AudioMotionAnalyzer(box.current!, { audioCtx: soundContext(), connectSpeakers: false, start: false, overlay: true, showBgColor: false, showScaleX: false });
    registerGradients(a);
    a.setOptions(options(useLook.getState().visualizer));
    analyzer.current = a;
    // Lucid changed colour: the accent gradient follows.
    const watch = new MutationObserver(() => {
      registerGradients(a);
      if (useLook.getState().visualizer.colors === 'accent') a.gradient = 'rakki-accent';
    });
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => {
      watch.disconnect();
      a.destroy();
      analyzer.current = null;
    };
  }, []);

  useEffect(() => {
    analyzer.current?.setOptions(options(look));
  }, [look]);

  useEffect(() => {
    const a = analyzer.current;
    if (!a || !source) return;
    a.connectInput(source);
    return () => a.disconnectInput(source);
  }, [source]);

  // Draw while there's sound to show; still otherwise (the last frame stays).
  useEffect(() => {
    const a = analyzer.current;
    if (!a) return;
    const on = playing && !hidden;
    if (on) a.start();
    else {
      // Let it fall to rest first.
      const id = setTimeout(() => a.stop(), 1200);
      return () => clearTimeout(id);
    }
  }, [playing, hidden]);

  return <div className={`visualizer${className ? ` ${className}` : ''}`} ref={box} aria-label="Sound Graph" role="img" />;
}
