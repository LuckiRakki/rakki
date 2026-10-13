// The full-screen views' background, as in Spicy Lyrics: the cover (or the music video itself)
// bent like liquid, blurred and slowly flowing (Kawarp, WebGL), faster when the music is louder
// and with a push on each beat. Spicy reads tempo and beats from Spotify's analysis; Rakki
// listens to its own sound instead (audio/sound.ts). Settings → Backgrounds picks lively, calm
// or still, and whether it follows the music.
//
// Light: drawn at half the window's resolution (it's a blur), the blur itself only reruns when
// the picture changes, and it stops when paused, hidden or closed. Without WebGL it falls back
// to the blurred cover.
import { Kawarp } from '@kawarp/core';
import { useEffect, useRef, useState } from 'react';

import { useSound } from '~/audio/sound';
import { usePlayer } from '~/player/store';
import { useLook, type BackgroundMotion } from '~/settings/look';

const BASE_SPEED: Record<BackgroundMotion, number> = { lively: 0.5, calm: 0.18, still: 0 };
const SCALE = 0.5;

/** Loudness and beats from the sound: how fast the background should flow right now. */
function musicFollower(node: AudioNode) {
  const analyser = node.context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.5;
  node.connect(analyser);
  const wave = new Float32Array(analyser.fftSize);
  const bins = new Uint8Array(analyser.frequencyBinCount);
  const bassTop = Math.max(2, Math.round((150 / (node.context.sampleRate / 2)) * bins.length));
  let loud = 0;
  let loudAvg = 0.05;
  let bassAvg = 0;
  let pulse = 0;
  let last = performance.now();
  return {
    /** A multiplier around 1: 0.5 for quiet, up to about 3 on a loud beat. */
    factor(): number {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      analyser.getFloatTimeDomainData(wave);
      let sum = 0;
      for (let i = 0; i < wave.length; i += 4) sum += wave[i] * wave[i];
      const rms = Math.sqrt(sum / (wave.length / 4));
      loud += (rms - loud) * Math.min(1, dt * 6);
      loudAvg += (loud - loudAvg) * Math.min(1, dt * 0.3);
      analyser.getByteFrequencyData(bins);
      let bass = 0;
      for (let i = 1; i < bassTop; i++) bass += bins[i];
      bass /= bassTop - 1;
      // A beat: the bass jumps well above its recent level.
      if (bass > 40 && bass > bassAvg * 1.35) pulse = 1;
      bassAvg += (bass - bassAvg) * Math.min(1, dt * 4);
      pulse *= Math.exp(-5 * dt);
      const level = loudAvg > 0.001 ? Math.max(0.5, Math.min(2, loud / loudAvg)) : 0.5;
      return Math.max(0.1, Math.min(3, 0.6 * level + 1.4 * pulse));
    },
    stop() {
      node.disconnect(analyser);
    },
  };
}

export function DynamicBackground({ image, video, active = true }: { image?: string; video?: HTMLVideoElement | null; active?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const kawarp = useRef<Kawarp | null>(null);
  const [failed, setFailed] = useState(false);
  const { motion, followMusic } = useLook((s) => s.background);
  const playing = usePlayer((s) => s.playing);
  const hidden = usePlayer((s) => s.hidden);
  const sound = useSound(active && followMusic && motion !== 'still');

  // Make it once; size it with its box.
  useEffect(() => {
    const c = canvas.current!;
    let k: Kawarp;
    try {
      k = new Kawarp(c, { warpIntensity: 1, blurPasses: 8, animationSpeed: BASE_SPEED[useLook.getState().background.motion], saturation: 1.5, dithering: 0.008, transitionDuration: 900 });
    } catch {
      setFailed(true);
      return;
    }
    kawarp.current = k;
    const size = () => {
      c.width = Math.max(1, Math.round(c.clientWidth * SCALE));
      c.height = Math.max(1, Math.round(c.clientHeight * SCALE));
      k.resize();
      k.renderFrame();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    return () => {
      ro.disconnect();
      k.dispose();
      kawarp.current = null;
    };
  }, []);

  // The picture: the video's frames when there's a video, else the cover.
  useEffect(() => {
    const k = kawarp.current;
    if (!k) return;
    if (video) k.loadVideo(video, { smoothing: 250 });
    else if (image) void k.loadImage(image).then(() => k.renderFrame()).catch(() => {});
  }, [image, video]);

  // Flowing while there's something to see; still when paused, hidden or set to still.
  const flowing = active && !hidden && motion !== 'still' && (playing || !!video);
  useEffect(() => {
    const k = kawarp.current;
    if (!k) return;
    if (!flowing) {
      // Ease to a stop, then stop drawing.
      k.animationSpeed = 0;
      const id = setTimeout(() => k.stop(), 1500);
      return () => clearTimeout(id);
    }
    k.animationSpeed = BASE_SPEED[motion];
    k.start();
    if (!sound) return;
    const follow = musicFollower(sound);
    const id = setInterval(() => {
      k.animationSpeed = BASE_SPEED[motion] * follow.factor();
    }, 50);
    return () => {
      clearInterval(id);
      follow.stop();
    };
  }, [flowing, motion, sound]);

  if (failed) return image ? <div className="dyn-bg fallback" style={{ backgroundImage: `url("${image}")` }} /> : null;
  return <canvas className="dyn-bg" ref={canvas} aria-hidden />;
}
