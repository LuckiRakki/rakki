// Your radio stations on every Rakki: the list is kept on your server by the Rakki plugin
// (GET / PUT /Rakki/User/Data/stations) as well as on each device. Signing in pulls it; adding,
// renaming, removing or playing a station pushes it a moment later. The first time a device
// syncs, its own stations join the server's (none are lost); after that the server's list is
// the list. A station's own picture is a file on the device it was set on, so it stays there.
// Without the plugin (or an older one) nothing happens and each device keeps its own list.
import type { JellyfinClient } from '@/api/jellyfin';
import { readPref, writePref } from '@/lib/prefs';
import { useStations, type Station } from '@/radio/stations';

const NAME = 'stations';
const JOINED = 'rakki.stationsJoined';
const PUSH_AFTER_MS = 3000;

interface Doc {
  stations: Station[];
  at: number;
}

let stop: (() => void) | null = null;
/** The list as the server last had it, so a pull doesn't push straight back. */
let lastSynced = '';

const same = (a: Station, b: Station) => a.streamUrl === b.streamUrl;
const withoutPictures = (list: Station[]) => list.map(({ image: _image, ...s }) => s);

/** Keep each device's own pictures when the server's list comes in. */
function keepPictures(incoming: Station[], local: Station[]): Station[] {
  return incoming.map((s) => {
    const mine = local.find((l) => same(l, s));
    return mine?.image ? { ...s, image: mine.image } : s;
  });
}

async function push(client: JellyfinClient) {
  const list = withoutPictures(useStations.getState().stations);
  const json = JSON.stringify(list);
  if (json === lastSynced) return;
  await client.putRakkiData(NAME, { stations: list, at: Date.now() } satisfies Doc);
  lastSynced = json;
}

/** Pull the server's list (joining this device's the first time), then keep pushing changes. */
export async function startStationSync(client: JellyfinClient): Promise<void> {
  stop?.();
  stop = null;
  try {
    const doc = await client.getRakkiData<Doc>(NAME);
    const local = useStations.getState().stations;
    const joined = readPref(JOINED) === '1';
    if (!doc) {
      if (local.length) await push(client);
    } else {
      const theirs = Array.isArray(doc.stations) ? doc.stations : [];
      const merged = joined ? theirs : [...theirs, ...local.filter((l) => !theirs.some((t) => same(t, l)))];
      lastSynced = JSON.stringify(withoutPictures(theirs));
      useStations.getState().replaceAll(keepPictures(merged, local));
      if (merged.length !== theirs.length) await push(client);
    }
    writePref(JOINED, '1');
  } catch {
    // No plugin, or the server's busy: this device keeps its own list for now.
    return;
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsub = useStations.subscribe((s, prev) => {
    if (s.stations === prev.stations) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void push(client).catch(() => {}), PUSH_AFTER_MS);
  });
  stop = () => {
    unsub();
    if (timer) clearTimeout(timer);
  };
}
