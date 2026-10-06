// The top of every uploaded performance log: the raw samples boiled down to what matters for
// battery life. Time is split by what the app was doing (on screen or in the background;
// music, radio, video or nothing), and for each: how fast the battery went down (on battery
// only), CPU load, and the phone's temperature state.

/** One sample row, as written by src/perf/log.ts. */
export interface Sample {
  k: 's';
  t: number;
  app: string;
  screen: string;
  play: string;
  net?: string;
  lag?: number;
  heapMB?: number;
  cpu?: number;
  memMB?: number;
  thermal?: number;
  battery?: number;
  charging?: boolean;
  lowPower?: boolean;
  brightness?: number;
  apiKB?: number;
}

interface Bucket {
  ms: number;
  drainPct: number;
  drainMs: number;
  cpuSum: number;
  cpuN: number;
  cpuMax: number;
  hot: number;
}

const THERMAL = ['nominal', 'fair', 'serious', 'critical'];
const fmtMin = (ms: number) => (ms >= 3600_000 ? `${(ms / 3600_000).toFixed(1)} h` : `${Math.round(ms / 60_000)} min`);

/**
 * `lines`: the log's JSON lines, oldest first. `expectGapMs`: the longest normal gap between
 * samples; longer gaps (the app was suspended) don't count as time spent.
 */
export function summarize(lines: string[], expectGapMs: number): string {
  const samples: Sample[] = [];
  const queueMs: number[] = [];
  const errors: string[] = [];
  let heapMax = 0;
  const lags: number[] = [];
  let apiKB = 0;
  let metricKit = 0;
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as { k: string; kind?: string; ms?: number; message?: string } & Partial<Sample>;
      if (row.k === 's') {
        samples.push(row as Sample);
        heapMax = Math.max(heapMax, row.heapMB ?? 0);
        if (row.lag !== undefined) lags.push(row.lag);
        apiKB += row.apiKB ?? 0;
      } else if (row.k === 'e' && row.kind === 'queue' && row.ms !== undefined) queueMs.push(row.ms);
      else if (row.k === 'e' && row.kind === 'error' && row.message) errors.push(row.message);
      else if (row.k === 'metrickit') metricKit++;
    } catch {
      // Skip a damaged line.
    }
  }
  if (!samples.length) return 'No samples.';

  const buckets = new Map<string, Bucket>();
  let thermalMax = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const gap = b.t - a.t;
    if (gap <= 0 || gap > expectGapMs) continue;
    const name = `${a.app === 'active' ? 'on screen' : 'background'}, ${a.play}`;
    const bucket = buckets.get(name) ?? { ms: 0, drainPct: 0, drainMs: 0, cpuSum: 0, cpuN: 0, cpuMax: 0, hot: 0 };
    bucket.ms += gap;
    if (a.battery !== undefined && b.battery !== undefined && a.battery >= 0 && b.battery >= 0 && !a.charging && !b.charging) {
      bucket.drainPct += (a.battery - b.battery) * 100;
      bucket.drainMs += gap;
    }
    if (b.cpu !== undefined) {
      bucket.cpuSum += b.cpu;
      bucket.cpuN++;
      bucket.cpuMax = Math.max(bucket.cpuMax, b.cpu);
    }
    if ((a.thermal ?? 0) >= 2) bucket.hot += gap;
    thermalMax = Math.max(thermalMax, a.thermal ?? 0);
    buckets.set(name, bucket);
  }

  const out: string[] = [];
  const first = samples[0].t;
  const last = samples[samples.length - 1].t;
  out.push(`From ${new Date(first).toISOString()} to ${new Date(last).toISOString()}, ${samples.length} samples.`);
  out.push('');
  out.push('Time by activity (battery use only counts while not charging):');
  for (const [name, b] of [...buckets.entries()].sort((x, y) => y[1].ms - x[1].ms)) {
    const drain = b.drainMs >= 10 * 60_000 ? `${((b.drainPct / b.drainMs) * 3600_000).toFixed(1)} %/h` : 'n/a';
    const cpu = b.cpuN ? `CPU avg ${(b.cpuSum / b.cpuN).toFixed(0)} %, max ${b.cpuMax.toFixed(0)} %` : 'CPU n/a';
    const hot = b.hot ? `, serious+ heat ${fmtMin(b.hot)}` : '';
    out.push(`- ${name}: ${fmtMin(b.ms)}; battery ${drain}; ${cpu}${hot}`);
  }
  out.push('');
  out.push(`Hottest: ${THERMAL[thermalMax] ?? thermalMax}.`);
  const sorted = [...lags].sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : undefined;
  out.push(`JS heap max ${heapMax.toFixed(0)} MB; JS delay p95 ${p95 ?? 'n/a'} ms; from the server ${(apiKB / 1024).toFixed(1)} MB (API only).`);
  if (queueMs.length) {
    const q = [...queueMs].sort((a, b) => a - b);
    out.push(`Smart queue: ${q.length} built, median ${(q[Math.floor(q.length / 2)] / 1000).toFixed(1)} s, slowest ${(q[q.length - 1] / 1000).toFixed(1)} s.`);
  }
  if (metricKit) out.push(`iOS MetricKit reports: ${metricKit} (below, as "metrickit" lines).`);
  out.push(errors.length ? `Errors: ${errors.length}. First: ${errors.slice(0, 3).join(' | ')}` : 'Errors: none.');
  return out.join('\n');
}
