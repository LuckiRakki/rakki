// Web (dev preview): Skia runs on CanvasKit (WebAssembly), and Skia's module reads it when it
// first loads, so the Spicy view (and everything importing Skia) is loaded only after
// CanvasKit is ready. public/canvaskit.wasm is served from the site root.
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import type { ComponentProps } from 'react';

import type { SpicyLyricsView } from '@/spicy/SpicyLyricsView';

type Props = ComponentProps<typeof SpicyLyricsView>;

const load = () => import('@/spicy/SpicyLyricsView').then((m) => ({ default: m.SpicyLyricsView }));
const opts = { locateFile: (file: string) => `/${file}` };

export function SpicyLyrics(props: Props) {
  return <WithSkiaWeb getComponent={load} componentProps={props} opts={opts} fallback={null} />;
}
