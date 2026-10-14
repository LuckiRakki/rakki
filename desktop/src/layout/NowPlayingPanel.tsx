// The right sidebar (like Spotify's Now Playing view and Feishin's side queue). Two modes:
// - Now playing: the artwork, the song, a lyrics card that follows the song (click it for the
//   full player's lyrics), About the artist, Credits (artists, writers, producers; album, year,
//   genre, file format), and the next song.
// - Queue: everything that's coming, then what already played.
import { ChevronLeft, Ellipsis, ListMusic, Maximize2, X } from '~/ui/icons';
import type { ReactNode } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { artColor } from '@/lib/blurhash';
import { useAuth } from '~/auth/session';
import { songMenu } from '~/library/menus';
import { DevicesPanel } from '~/layout/Devices';
import { useLayout } from '~/layout/layout';
import { LyricsView } from '~/lyrics/LyricsView';
import { go } from '~/nav';
import { usePlayer } from '~/player/store';
import { useVideo } from '~/player/video';
import { VideoPanel } from '~/player/VideoHost';
import { useItem } from '~/queries';
import { openMenu } from '~/ui/overlays';
import { ArtistLinks, Artwork, formatTime, SaveButton, ticksToSeconds } from '~/ui/parts';

type Stream = { Type: string; Codec?: string; SampleRate?: number; BitDepth?: number; BitRate?: number };

/** "FLAC · 24-bit 96 kHz · 2,304 kbps" from the file's details, as far as they're known. */
export function formatOf(item: BaseItem): string[] {
  const source = item.MediaSources?.[0];
  const audio = (source?.MediaStreams as Stream[] | undefined)?.find((s) => s.Type === 'Audio');
  const container = (audio?.Codec || source?.Container || item.Container)?.split(',')[0];
  const out: string[] = [];
  if (container) out.push(container.toUpperCase());
  if (audio?.SampleRate) out.push(`${audio.BitDepth ? `${audio.BitDepth}-bit ` : ''}${(audio.SampleRate / 1000).toLocaleString()} kHz`);
  const kbps = Math.round((audio?.BitRate ?? source?.Bitrate ?? 0) / 1000);
  if (kbps) out.push(`${kbps.toLocaleString()} kbps`);
  return out;
}

/** Who made the song: its artists, then the people in its tags (one row each, roles joined). */
export function creditsOf(item: BaseItem): { name: string; roles: string; artistId?: string }[] {
  const rows = new Map<string, { name: string; roles: string[]; artistId?: string }>();
  for (const a of item.ArtistItems ?? (item.Artists ?? []).map((n) => ({ Name: n, Id: '' }))) {
    rows.set(a.Name.toLowerCase(), { name: a.Name, roles: ['Artist'], artistId: a.Id || undefined });
  }
  for (const p of item.People ?? []) {
    const role = p.Role || p.Type || 'Credit';
    const key = p.Name.toLowerCase();
    const row = rows.get(key) ?? { name: p.Name, roles: [] };
    if (!row.roles.includes(role)) row.roles.push(role);
    rows.set(key, row);
  }
  return [...rows.values()].map((r) => ({ ...r, roles: r.roles.join(', ') }));
}

function Card({ title, action, children, style, className }: { title: string; action?: ReactNode; children: ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <section className={`np-card${className ? ` ${className}` : ''}`} style={style}>
      <header>
        <h3>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

function AboutArtist({ id }: { id: string }) {
  const artist = useItem(id).data;
  const client = useAuth((s) => s.client);
  if (!artist) return null;
  const img = client?.imageUrl(artist, 600);
  return (
    <section className="np-card about" onClick={() => go({ name: 'artist', id })}>
      {img ? <div className="about-img" style={{ backgroundImage: `url("${img}")` }} /> : null}
      <div className="about-body">
        <h3>About the Artist</h3>
        <div className="about-name">{artist.Name}</div>
        {artist.Overview ? <p className="about-text">{artist.Overview}</p> : null}
      </div>
    </section>
  );
}

function NowView({ item }: { item: BaseItem }) {
  const client = useAuth((s) => s.client);
  const radio = !!item.Radio;
  const full = useItem(radio ? undefined : item.Id).data;
  const { queue, index } = usePlayer();
  const next = queue[index + 1];
  const song = { ...item, ...full, UserData: item.UserData };
  const tint = client ? artColor(client.blurhash(item), '#2a2a2e') : '#2a2a2e';
  const year = song.ProductionYear;
  const format = formatOf(song);
  const credits = creditsOf(song);
  const artistId = item.ArtistItems?.[0]?.Id ?? item.AlbumArtists?.[0]?.Id;

  return (
    <div className="panel-body np-view">
      <Artwork item={item} size={700} className="np-view-cover" />
      <div className="np-view-head" onContextMenu={radio ? undefined : (e) => openMenu(e, songMenu([item]))}>
        <div className="t">
          <div className="np-view-title linkish" onClick={() => item.AlbumId && go({ name: 'album', id: item.AlbumId })}>
            {item.Name}
          </div>
          <div className="np-view-by">
            <ArtistLinks item={item} />
          </div>
        </div>
        {radio ? null : (
          <button className="iconbtn" aria-label="More" title="More" onClick={(e) => openMenu(e, songMenu([item]))}>
            <Ellipsis size={18} />
          </button>
        )}
        <SaveButton item={item} size={19} />
      </div>
      <div className="np-tags">
        {item.Album ? (
          <span className="linkish" onClick={() => item.AlbumId && go({ name: 'album', id: item.AlbumId })}>
            {item.Album}
          </span>
        ) : null}
        {year ? <span>{year}</span> : null}
        {format[0] ? <span>{format[0]}</span> : null}
      </div>

      {radio ? null : (
        <Card
          title="Lyrics"
          className="lyrics-card"
          style={{ ['--tint' as string]: tint }}
          action={
            <button className="iconbtn" aria-label="Open Lyrics" title="Open Lyrics" onClick={() => useLayout.getState().setNowPlaying(true, 'lyrics')}>
              <Maximize2 size={15} />
            </button>
          }>
          <LyricsView variant="card" onOpen={() => useLayout.getState().setNowPlaying(true, 'lyrics')} />
        </Card>
      )}

      {artistId && !radio ? <AboutArtist id={artistId} /> : null}

        {radio ? null : (
        <Card title="Credits">
          {credits.map((c) => (
            <div key={c.name} className="credit">
              <div className={`credit-name${c.artistId ? ' linkish' : ''}`} onClick={() => c.artistId && go({ name: 'artist', id: c.artistId })}>
                {c.name}
              </div>
              <div className="credit-role">{c.roles}</div>
            </div>
          ))}
          <dl className="details">
            {song.Album ? (
              <>
                <dt>Album</dt>
                <dd className="linkish" onClick={() => song.AlbumId && go({ name: 'album', id: song.AlbumId })}>
                  {song.Album}
                </dd>
              </>
            ) : null}
            {year ? (
              <>
                <dt>Released</dt>
                <dd>{year}</dd>
              </>
            ) : null}
            {song.Genres?.length ? (
              <>
                <dt>Genre</dt>
                <dd>
                  {song.Genres.map((g, i) => (
                    <span key={g}>
                      {i ? ', ' : ''}
                      <span className="linkish" onClick={() => go({ name: 'genre', id: g })}>
                        {g}
                      </span>
                    </span>
                  ))}
                </dd>
              </>
            ) : null}
            {song.IndexNumber ? (
              <>
                <dt>Track</dt>
                <dd>
                  {song.ParentIndexNumber && song.ParentIndexNumber > 1 ? `Disc ${song.ParentIndexNumber} · ` : ''}
                  {song.IndexNumber}
                </dd>
              </>
            ) : null}
            {song.RunTimeTicks ? (
              <>
                <dt>Length</dt>
                <dd>{formatTime(ticksToSeconds(song.RunTimeTicks))}</dd>
              </>
            ) : null}
            {format.length ? (
              <>
                <dt>Format</dt>
                <dd>{format.join(' · ')}</dd>
              </>
            ) : null}
            {song.UserData?.PlayCount || full?.UserData?.PlayCount ? (
              <>
                <dt>Your Plays</dt>
                <dd>{(full?.UserData?.PlayCount ?? song.UserData?.PlayCount ?? 0).toLocaleString()}</dd>
              </>
            ) : null}
          </dl>
        </Card>
      )}

      <Card
        title="Next in Queue"
        action={
          <button className="text-btn" onClick={() => useLayout.getState().setPanel('queue')}>
            Open Queue
          </button>
        }>
        {next ? (
          <QueueRow item={next} at={index + 1} />
        ) : (
          <p className="muted small">Nothing after this song{queue.length ? '' : ' yet'}.</p>
        )}
      </Card>
    </div>
  );
}

function QueueRow({ item, at, now = false, past = false }: { item: BaseItem; at: number; now?: boolean; past?: boolean }) {
  return (
    <button
      className={`qrow${now ? ' now' : ''}${past ? ' past' : ''}`}
      onDoubleClick={() => !now && usePlayer.getState().playAt(at)}
      onContextMenu={(e) => openMenu(e, songMenu([item], now ? {} : { queueIndex: at }))}>
      <Artwork item={item} size={80} className="thumb" />
      <div className="t">
        <div className="name">{item.Name}</div>
        <div className="sub">
          <ArtistLinks item={item} />
        </div>
      </div>
      <span className="qlen">{formatTime(ticksToSeconds(item.RunTimeTicks))}</span>
    </button>
  );
}

function QueueView() {
  const { queue, index } = usePlayer();
  const now = queue[index];
  const upcoming = queue.slice(index + 1, index + 301);
  const played = queue.slice(Math.max(0, index - 50), index);
  return (
    <div className="panel-body">
      {now ? (
        <>
          <div className="label">Now Playing</div>
          <QueueRow item={now} at={index} now />
        </>
      ) : (
        <p className="muted pad">Nothing playing yet. Double-click a song, or press play on an album.</p>
      )}
      {upcoming.length ? <div className="label">Next Up</div> : null}
      {upcoming.map((t, i) => (
        <QueueRow key={`${t.Id}-${index + 1 + i}`} item={t} at={index + 1 + i} />
      ))}
      {queue.length - index - 1 > upcoming.length ? <p className="muted pad">and {queue.length - index - 1 - upcoming.length} more</p> : null}
      {played.length ? <div className="label">Played</div> : null}
      {played.map((t, i) => (
        <QueueRow key={`${t.Id}-p${i}`} item={t} at={index - played.length + i} past />
      ))}
    </div>
  );
}

export function NowPlayingPanel() {
  const panel = useLayout((s) => s.panel);
  const item = usePlayer((s) => s.queue[s.index]);
  const video = useVideo((s) => s.video);
  if (!panel) return null;
  if (panel === 'devices') return <DevicesPanel />;
  // A music video takes the sidebar over: the video, what it is, Up next.
  if (video) {
    return (
      <aside className="rightpanel panel">
        <header className="rp-head">
          <div className="rp-title">Music Video</div>
          <button className="iconbtn" aria-label="Close" title="Close" onClick={() => useLayout.getState().setPanel(null)}>
            <X size={17} />
          </button>
        </header>
        <VideoPanel video={video} />
      </aside>
    );
  }
  const queue = panel === 'queue';
  return (
    <aside className="rightpanel panel">
      <header className="rp-head">
        {queue ? (
          <button className="iconbtn" aria-label="Back to Now Playing" title="Now Playing" onClick={() => useLayout.getState().setPanel('now')}>
            <ChevronLeft size={18} />
          </button>
        ) : null}
        <div className="rp-title">{queue ? 'Queue' : (item?.Album ?? 'Now Playing')}</div>
        {queue ? null : (
          <button className="iconbtn" aria-label="Queue" title="Queue" onClick={() => useLayout.getState().setPanel('queue')}>
            <ListMusic size={17} />
          </button>
        )}
        <button className="iconbtn" aria-label="Close" title="Close" onClick={() => useLayout.getState().setPanel(null)}>
          <X size={17} />
        </button>
      </header>
      {queue ? <QueueView /> : item ? <NowView item={item} /> : <p className="muted pad">Nothing playing yet. Double-click a song, or press play on an album.</p>}
    </aside>
  );
}
