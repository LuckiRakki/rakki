// Things worth a line in the performance log (src/perf/log.ts) as they happen, from anywhere
// in the app: how long the smart queue took, errors, and how much the app downloaded from
// the server. Kept in memory until the log's next sample writes them down. No imports, so
// the player and the API client can use it without import cycles.

export interface PerfEvent {
  t: number;
  kind: string;
  data?: Record<string, unknown>;
}

const MAX_WAITING = 300;
const waiting: PerfEvent[] = [];
let apiBytes = 0;

export function notePerf(kind: string, data?: Record<string, unknown>) {
  waiting.push({ t: Date.now(), kind, data });
  if (waiting.length > MAX_WAITING) waiting.shift();
}

/** The events since the last call. */
export function takePerfEvents(): PerfEvent[] {
  return waiting.splice(0);
}

/** A server answer arrived (its size in bytes, roughly: characters of text). */
export function countApiBytes(n: number) {
  apiBytes += n;
}

/** Bytes from the server since the last call. */
export function takeApiBytes(): number {
  const n = apiBytes;
  apiBytes = 0;
  return n;
}
