import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import process from 'node:process';

import { autoPull } from './autopull';

const host = process.env.TAURI_DEV_HOST;
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
/** Desktop stand-ins for the phone app's platform modules (same import paths). */
const overrides = path.join(here, 'src', 'overrides');
/** Rakki's own code (the phone app), shared where it's plain TypeScript. */
const shared = path.join(here, '..', 'src');

/**
 * `@/x` imports (the phone app's) resolve to a desktop stand-in when there is one, else to the
 * phone app's file, so its Jellyfin client, lyrics and helpers are used as they are.
 */
function rakkiShared(): Plugin {
  return {
    name: 'rakki-shared',
    enforce: 'pre',
    async resolveId(id, importer, options) {
      if (!id.startsWith('@/')) return null;
      const rest = id.slice(2);
      for (const base of [overrides, shared]) {
        const resolved = await this.resolve(path.join(base, rest), importer, { ...options, skipSelf: true });
        if (resolved) return resolved;
      }
      return null;
    },
  };
}

export default defineConfig(() => ({
  plugins: [rakkiShared(), react(), autoPull()],
  resolve: {
    alias: {
      '~': path.join(here, 'src'),
      'expo-device': path.join(here, 'src', 'shims', 'expo-device.ts'),
      'react-native': path.join(here, 'src', 'shims', 'react-native.ts'),
    },
    dedupe: ['react', 'react-dom', 'zustand', '@tanstack/react-query'],
  },
  // Tauri: keep Rust errors visible, a fixed port, and don't watch the Rust side.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    fs: { allow: [path.join(here, '..')] },
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
}));
