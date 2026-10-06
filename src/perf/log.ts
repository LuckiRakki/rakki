// The performance log (Settings → Performance log): how Rakki uses the phone, to find what
// drains the battery. About once a minute while the app is open (every 5 minutes while it
// plays in the background) it writes down what it's doing (screen, music / radio / video),
// how busy JavaScript is, its memory, and, on builds from 1.6.0, the hardware: CPU load,
// memory, thermal state, battery level, Low Power Mode and screen brightness, plus iOS's own
// daily MetricKit reports (GPU time, background audio time, why iOS closed the app…). Every
// 12 hours it's sent to the Jellyfin server, which keeps it in its log folder
// (upload_Rakki_….log), and cleared from the phone. Rows live in a small SQLite database.
import * as Device from 'expo-device';
import * as Network from 'expo-network';
import * as SQLite from 'expo-sqlite';
import { AppState, Platform } from 'react-native';

import { useAppearance } from '@/appearance/store';
import { useAuth } from '@/auth/store';
import { isOffline } from '@/lib/online';
import { readPref, writePref } from '@/lib/prefs';
import { appVersion, buildStamp } from '@/lib/updates';
import { notePerf, takeApiBytes, takePerfEvents } from '@/perf/events';
import { summarize, type Sample } from '@/perf/summary';
import { radioPlaying, usePlayer } from '@/player/store';
import { useSettings } from '@/settings/store';
import { currentPathname } from '@/ui/nav';
import { useVideoSession } from '@/video/session';
import { RakkiAudio } from '../../modules/rakki-audio';

const ACTIVE_EVERY = 60_000;
const BACKGROUND_EVERY = 5 * 60_000;
const SEND_EVERY = 12 * 3600_000;
/** Jellyfin takes up to 1 MB per upload. */
const DOC_LIMIT = 900_000;
/** Oldest rows go first past this (about two weeks of use). */
const MAX_ROWS = 20_000;
const SENT_KEY = 'rakki.perf.sentAt';

const jsStart = Date.now();
let db: SQLite.SQLiteDatabase | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let dueAt = 0;
let lastCpu: { at: number; seconds: number } | null = null;
let lastGc: { count: number; seconds: number } | null = null;
let sending = false;
let started = false;

function database(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('rakki-perf.db');
    db.execSync('CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, line TEXT NOT NULL)');
  }
  return db;
}

async function write(rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const d = database();
  for (const row of rows) await d.runAsync('INSERT INTO log (t, line) VALUES (?, ?)', [Number(row.t) || Date.now(), JSON.stringify(row)]);
}

/** How long a do-nothing timer waits for JavaScript to be free (ms). */
function jsDelay(): Promise<number> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    setTimeout(() => resolve(Date.now() - t0), 0);
  });
}

function hermes(): { heapMB?: number; gcs?: number; gcMs?: number } {
  const stats = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => Record<string, number> } }).HermesInternal?.getInstrumentedStats?.();
  if (!stats) return {};
  const count = stats.js_numGCs ?? 0;
  const seconds = stats.js_gcCPUTime ?? 0;
  const out = {
    heapMB: Math.round((stats.js_heapSize ?? 0) / 104857.6) / 10,
    gcs: lastGc ? count - lastGc.count : undefined,
    gcMs: lastGc ? Math.round((seconds - lastGc.seconds) * 1000) : undefined,
  };
  lastGc = { count, seconds };
  return out;
}

function playing(): string {
  const video = useVideoSession.getState();
  if (video.video && (video.player as { playing?: boolean } | null)?.playing) return 'video';
  const p = usePlayer.getState();
  if (p.playing) return radioPlaying(p) ? 'radio' : 'music';
  return 'idle';
}

async function hardware(now: number): Promise<Partial<Sample>> {
  if (!RakkiAudio?.deviceStats) return {};
  const s = await RakkiAudio.deviceStats().catch(() => null);
  if (!s) return {};
  let cpu: number | undefined;
  if (s.cpuSeconds !== undefined) {
    if (lastCpu && now > lastCpu.at) cpu = Math.round(((s.cpuSeconds - lastCpu.seconds) / ((now - lastCpu.at) / 1000)) * 1000) / 10;
    lastCpu = { at: now, seconds: s.cpuSeconds };
  }
  return {
    cpu,
    memMB: s.memoryMB !== undefined ? Math.round(s.memoryMB) : undefined,
    thermal: s.thermal,
    battery: s.battery !== undefined && s.battery >= 0 ? Math.round(s.battery * 100) / 100 : undefined,
    charging: s.batteryState === 2 || s.batteryState === 3,
    lowPower: s.lowPower,
    brightness: s.brightness !== undefined ? Math.round(s.brightness * 100) / 100 : undefined,
  };
}

async function sample() {
  timer = null;
  if (!useSettings.getState().perfLog) return;
  const now = Date.now();
  const late = dueAt ? Math.max(0, now - dueAt) : undefined;
  try {
    const [lag, hw, net] = await Promise.all([jsDelay(), hardware(now), Network.getNetworkStateAsync().catch(() => null)]);
    const row: Sample & Record<string, unknown> = {
      k: 's',
      t: now,
      app: AppState.currentState,
      screen: currentPathname(),
      play: playing(),
      net: net?.type ? String(net.type).toLowerCase() : undefined,
      lag,
      late,
      apiKB: Math.round(takeApiBytes() / 102.4) / 10,
      ...hermes(),
      ...hw,
    };
    const events = takePerfEvents().map((e) => ({ k: 'e', t: e.t, kind: e.kind, ...e.data }));
    const reports = (RakkiAudio?.takeMetricReports?.() ?? []).map((json) => {
      try {
        return { k: 'metrickit', t: now, report: JSON.parse(json) as unknown };
      } catch {
        return { k: 'metrickit', t: now, text: json };
      }
    });
    await write([...events, row, ...reports]);
  } catch {
    // A sample missed; the next one will do.
  }
  schedule();
  void sendIfDue();
}

function schedule() {
  if (timer) clearTimeout(timer);
  const every = AppState.currentState === 'active' ? ACTIVE_EVERY : BACKGROUND_EVERY;
  dueAt = Date.now() + every;
  timer = setTimeout(() => void sample(), every);
}

/** The settings that change how hard the phone works, when they change. */
function watchSettings() {
  const pick = () => {
    const a = useAppearance.getState();
    const s = useSettings.getState();
    return {
      playerBackground: a.playerBackground,
      playerMotion: a.playerMotion,
      motion: a.motion,
      miniVisualizer: a.miniVisualizer,
      lyricsMode: s.lyricsMode,
      wifiKbps: s.wifiBitrate,
      cellularKbps: s.cellularBitrate,
      videoBackgroundAudio: s.videoBackgroundAudio,
    };
  };
  let last = JSON.stringify(pick());
  notePerf('settings', pick());
  const check = () => {
    const now = JSON.stringify(pick());
    if (now !== last) {
      last = now;
      notePerf('settings', pick());
    }
  };
  useAppearance.subscribe(check);
  useSettings.subscribe(check);
}

/** JavaScript errors (the app keeps running after most of them). */
function watchErrors() {
  const utils = (globalThis as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, fatal) => {
    notePerf('error', { message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300), fatal: !!fatal });
    // A fatal one: write it down now, the app is about to close.
    if (fatal) void write(takePerfEvents().map((e) => ({ k: 'e', t: e.t, kind: e.kind, ...e.data }))).catch(() => {});
    previous(error, fatal);
  });
}

/** Once, at launch (the root layout). */
export function startPerfLog() {
  if (started || Platform.OS !== 'ios') return;
  started = true;
  const stamp = buildStamp();
  notePerf('start', {
    version: appVersion(),
    update: stamp.update,
    commit: stamp.commit,
    readyMs: Date.now() - jsStart,
    nativeStats: !!RakkiAudio?.deviceStats,
  });
  watchSettings();
  watchErrors();
  AppState.addEventListener('change', (state) => {
    if (state !== 'active' && state !== 'background') return;
    notePerf('app', { state });
    // A sample right at the switch, then the next one on the new schedule.
    void sample();
  });
  useSettings.subscribe((s, prev) => {
    if (s.perfLog && !prev.perfLog) void sample();
  });
  void sample();
}

/** Rows waiting to be sent, and when it was last sent. */
export async function perfLogStatus(): Promise<{ rows: number; sentAt: number | null }> {
  const row = await database()
    .getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM log')
    .catch(() => null);
  const sentAt = Number(readPref(SENT_KEY)) || null;
  return { rows: row?.n ?? 0, sentAt };
}

async function sendIfDue() {
  const sentAt = Number(readPref(SENT_KEY)) || 0;
  if (Date.now() - sentAt < SEND_EVERY) return;
  await sendPerfLog().catch(() => {});
}

function header(): string {
  const stamp = buildStamp();
  return [
    'Rakki performance log',
    `App ${appVersion()} (update ${stamp.update ?? 'built in'}${stamp.commit ? `, ${stamp.commit}` : ''})`,
    `${Device.modelName ?? 'iPhone'} (${Device.modelId ?? '?'}), iOS ${Device.osVersion ?? '?'}, ${Device.totalMemory ? `${Math.round(Device.totalMemory / 1e9)} GB` : '? GB'} RAM`,
    `Hardware readings: ${RakkiAudio?.deviceStats ? 'yes' : 'no (needs the 1.6.0 native build)'}`,
  ].join('\n');
}

/**
 * Send what's been logged to the server and clear it from the phone. Throws when it couldn't
 * (offline, server said no); returns how many rows went.
 */
export async function sendPerfLog(): Promise<number> {
  const client = useAuth.getState().client;
  if (!client || isOffline()) throw new Error("Can't reach your server.");
  if (sending) return 0;
  sending = true;
  try {
    const d = database();
    // Keep the table from growing forever if sending keeps failing.
    await d.runAsync('DELETE FROM log WHERE id <= (SELECT MAX(id) FROM log) - ?', [MAX_ROWS]);
    const rows = await d.getAllAsync<{ id: number; line: string }>('SELECT id, line FROM log ORDER BY id');
    if (!rows.length) {
      writePref(SENT_KEY, String(Date.now()));
      return 0;
    }
    // Split into uploads under Jellyfin's limit, each with the header and its own summary.
    let sent = 0;
    for (let start = 0; start < rows.length; ) {
      let size = 0;
      let end = start;
      while (end < rows.length && (end === start || size + rows[end].line.length + 1 < DOC_LIMIT - 20_000)) {
        size += rows[end].line.length + 1;
        end++;
      }
      const lines = rows.slice(start, end).map((r) => r.line);
      const doc = `${header()}\n\n${summarize(lines, BACKGROUND_EVERY * 1.5)}\n\n---- samples (JSON lines) ----\n${lines.join('\n')}\n`;
      await client.uploadClientLog(doc);
      await d.runAsync('DELETE FROM log WHERE id <= ?', [rows[end - 1].id]);
      sent += end - start;
      start = end;
    }
    writePref(SENT_KEY, String(Date.now()));
    return sent;
  } finally {
    sending = false;
  }
}
