// History and Stats (Rakki 2.0): your listening time, top artists and albums, and every song you
// played on any device, newest first. The Rakki plugin (0.5) records the plays, so the phone and the
// desktop show the same history (phone: src/app/stats.tsx; shared helpers: src/stats/format.ts).
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import type { JellyfinClient, RakkiHistoryEntry, RakkiStats, RakkiTop } from '@/api/jellyfin';
import { chartBars, compareLine, deviceKind, deviceLabel, groupByDay, hm, playTime, RANGES, rangeDays, type StatsRange } from '@/stats/format';
import { useAuth } from '~/auth/session';
import { go } from '~/nav';
import { usePlayer } from '~/player/store';
import { AudioWave, Globe, Monitor, Music, Smartphone, Stats as StatsIcon, type Icon } from '~/ui/icons';
import { Picture } from '~/ui/parts';
import { Empty, Loading } from '~/ui/states';

const PAGE = 60;

export function StatsPage() {
  const client = useAuth((s) => s.client);
  const userId = client?.session.userId;
  const [range, setRange] = useState<StatsRange>('7');
  const days = rangeDays(range);
  const stats = useQuery({
    queryKey: ['rakkiStats', userId, days],
    enabled: !!client,
    staleTime: 60_000,
    queryFn: () => (client ? client.getRakkiStats(days) : Promise.resolve(null)),
  });
  const data = stats.data;
  return (
    <div className="page stats-page">
      <div className="stats-head">
        <h1>History and Stats</h1>
        <div className="filters" role="group" aria-label="Time Range">
          {RANGES.map((r) => (
            <button key={r.value} className={range === r.value ? 'on' : ''} aria-pressed={range === r.value} onClick={() => setRange(r.value)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {stats.isLoading ? (
        <Loading what="your stats" />
      ) : stats.isError ? (
        <Empty icon={StatsIcon} title="Couldn't Load Your Stats" detail="Check your connection to your server and try again." action={{ label: 'Try Again', run: () => void stats.refetch() }} />
      ) : !data ? (
        <Empty icon={StatsIcon} title="Needs the Rakki Plugin" detail="History and Stats come from the Rakki plugin 0.5 or newer on your Jellyfin server." />
      ) : data.Plays === 0 && range === 'all' ? (
        <Empty icon={StatsIcon} title="Nothing Played Yet" detail="Play a few songs and your listening time, top artists and history show up here." />
      ) : (
        <div className="stats-layout">
          <StatsBody stats={data} range={range} client={client} />
          <HistoryColumn client={client} />
        </div>
      )}
    </div>
  );
}

function StatsBody({ stats, range, client }: { stats: RakkiStats; range: StatsRange; client: JellyfinClient | null }) {
  const compare = compareLine(stats, range);
  const maxArtist = Math.max(1, ...stats.TopArtists.map((a) => a.Plays));
  return (
    <div className="stats-main">
      <div className="stats-tiles">
        <Tile label="Listening Time" value={hm(stats.Minutes)} sub={compare ?? `${stats.Plays} plays`} wide />
        <Tile label="Songs" value={String(stats.Songs)} sub={`${stats.Plays} plays`} />
        <Tile label="Artists" value={String(stats.Artists)} sub={RANGES.find((r) => r.value === range)?.label ?? ''} />
        <Tile label="Day Streak" value={`${stats.Streak} ${stats.Streak === 1 ? 'day' : 'days'}`} sub={`Best: ${stats.BestStreak} days`} />
      </div>
      <section className="stats-card">
        <h2>Listening Time by {stats.PerDay.length > 31 ? 'Month' : 'Day'}</h2>
        <Chart stats={stats} />
      </section>
      <div className="stats-pair">
        <section className="stats-card">
          <h2>Top Artists</h2>
          <div className="stats-list">
            {stats.TopArtists.slice(0, 5).map((a, i) => (
              <button key={a.Name} className="stats-row" disabled={!a.Id} onClick={() => a.Id && go({ name: 'artist', id: a.Id })}>
                <span className="stats-rank">{i + 1}</span>
                <Cover client={client} id={a.Id} round />
                <span className="stats-text">
                  <span className="stats-line">
                    <span className="stats-name">{a.Name}</span>
                    <span className="stats-plays">{a.Plays} plays</span>
                  </span>
                  <span className="stats-meter" aria-hidden="true">
                    <span style={{ width: `${(a.Plays / maxArtist) * 100}%` }} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
        <TopCard title="Top Albums" items={stats.TopAlbums} client={client} onOpen={(a) => a.Id && go({ name: 'album', id: a.Id })} />
      </div>
      <TopCard title="Top Songs" items={stats.TopSongs} client={client} onOpen={(a) => a.Id && void playOne(client, a.Id)} />
    </div>
  );
}

function Tile({ label, value, sub, wide }: { label: string; value: string; sub: string; wide?: boolean }) {
  return (
    <div className={`stats-tile${wide ? ' wide' : ''}`}>
      <span className="stats-tile-label">{label}</span>
      <span className="stats-tile-value">{value}</span>
      <span className="stats-tile-sub">{sub}</span>
    </div>
  );
}

/** Listening time by day (or month): one series in the album colour, rounded tops on a flat baseline, hover for the time. */
function Chart({ stats }: { stats: RakkiStats }) {
  const bars = useMemo(() => chartBars(stats), [stats]);
  const max = Math.max(30, ...bars.map((b) => b.minutes));
  const top = Math.ceil(max / 60) * 60;
  const lines = [0, top / 3, (top * 2) / 3, top].map((m) => Math.round(m));
  const thin = bars.length > 12;
  return (
    <div className="stats-chart" role="img" aria-label={`Listening time: ${bars.map((b) => `${b.title} ${hm(b.minutes)}`).join(', ')}`}>
      <div className="stats-plot">
        {lines.map((m) => (
          <div key={m} className={`stats-grid${m === 0 ? ' base' : ''}`} style={{ bottom: `${(m / top) * 100}%` }}>
            <span>{m >= 60 ? `${Math.round(m / 60)} h` : `${m} m`}</span>
          </div>
        ))}
        <div className="stats-bars">
          {bars.map((b) => (
            <div key={b.key} className="stats-col" title={`${b.title}: ${hm(b.minutes)}`}>
              <div className="stats-bar" style={{ height: `${(b.minutes / top) * 100}%` }} />
              <div className="stats-tip" role="tooltip">
                <span>{b.title}</span>
                <b>{hm(b.minutes)}</b>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="stats-labels">
        {bars.map((b, i) => (
          <span key={b.key} className={b.today ? 'today' : ''}>
            {thin && i % 5 !== 0 && !b.today ? '' : b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function TopCard({ title, items, client, onOpen }: { title: string; items: RakkiTop[]; client: JellyfinClient | null; onOpen(a: RakkiTop): void }) {
  if (!items.length) return null;
  return (
    <section className="stats-card">
      <h2>{title}</h2>
      <div className="stats-list">
        {items.slice(0, 5).map((a, i) => (
          <button key={a.Id ?? a.Name} className="stats-row" onClick={() => onOpen(a)}>
            <span className="stats-rank">{i + 1}</span>
            <Cover client={client} id={a.Id} />
            <span className="stats-text">
              <span className="stats-name">{a.Name}</span>
              <span className="stats-by">{a.Artist}</span>
            </span>
            <span className="stats-plays">{a.Plays} plays</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Cover({ client, id, round }: { client: JellyfinClient | null; id?: string | null; round?: boolean }) {
  return (
    <span className={`stats-cover${round ? ' round' : ''}`}>
      {client && id ? <Picture src={client.primaryImageUrl(id, 120)} /> : <Music size={18} />}
    </span>
  );
}

async function playOne(client: JellyfinClient | null, id: string) {
  if (!client) return;
  try {
    const item = await client.getItem(id);
    usePlayer.getState().playQueue([item]);
  } catch {
    // Gone from the library.
  }
}

const DEVICE_ICON: Record<ReturnType<typeof deviceKind>, Icon> = { phone: Smartphone, desktop: Monitor, web: Globe, other: Music };

function HistoryColumn({ client }: { client: JellyfinClient | null }) {
  const userId = client?.session.userId;
  const history = useInfiniteQuery({
    queryKey: ['rakkiHistory', userId],
    enabled: !!client,
    staleTime: 30_000,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => (client ? client.getRakkiHistory(PAGE, pageParam) : Promise.resolve(null)),
    getNextPageParam: (last) => (last && last.length === PAGE ? last[last.length - 1].At : undefined),
  });
  const all = useMemo(() => (history.data?.pages ?? []).flatMap((p) => p ?? []), [history.data]);
  const groups = useMemo(() => groupByDay(all), [all]);
  return (
    <section className="stats-card stats-history" aria-label="History">
      <h2>History</h2>
      <div
        className="stats-history-list"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight > el.scrollHeight - 400 && history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage();
        }}>
        {history.isLoading ? <Loading what="your history" /> : null}
        {groups.map((g) => (
          <div key={g.title}>
            <h3>{g.title}</h3>
            {g.entries.map((e) => (
              <HistoryRow key={`${e.Id}-${e.At}`} entry={e} client={client} />
            ))}
          </div>
        ))}
        {!history.isLoading && all.length === 0 ? <p className="muted">Nothing played yet.</p> : null}
      </div>
    </section>
  );
}

function HistoryRow({ entry, client }: { entry: RakkiHistoryEntry; client: JellyfinClient | null }) {
  const when = playTime(entry);
  const now = when === 'Now';
  const DeviceIcon = DEVICE_ICON[deviceKind(entry)];
  return (
    <button className={`stats-hrow${now ? ' now' : ''}`} onClick={() => void playOne(client, entry.Id)} title={`${entry.Name} · ${deviceLabel(entry)}`}>
      <span className="stats-when">
        {now ? <AudioWave size={14} /> : null}
        {when}
      </span>
      <Cover client={client} id={entry.AlbumId} />
      <span className="stats-text">
        <span className="stats-name">{entry.Name}</span>
        <span className="stats-by">{entry.Artist}</span>
      </span>
      <span className="stats-device" role="img" aria-label={deviceLabel(entry)}>
        <DeviceIcon size={15} />
      </span>
    </button>
  );
}
