// Dialogs shared by the inbox and the library: Spotify links from an album, and Auto-Fill from
// iTunes and MusicBrainz. Both show exactly what would change and write nothing by themselves:
// they hand the chosen values back (the inbox puts them into its cards, the library writes them
// as one batch you can undo).
import { useEffect, useMemo, useRef, useState } from 'react';

import { autofillLookup, runJob, type Lookup, type LookupResult } from '~/tagging/api';
import { pairSongs, spotifyList, type SpotifySong } from '~/tagging/spotify';
import { fmtLength } from '~/tagging/data';
import { ExternalLink } from '~/ui/icons';
import { closeDialog, showDialog } from '~/ui/overlays';
import { kv } from '~/lib/kv';
import { openLink } from '~/lib/links';

// ---- Spotify links from an album ----

export interface LinkSong {
  key: string;
  title: string;
  /** Track number (place in the album), 0 when unknown. */
  n: number;
  length: number;
  /** The link it has now (an id), '' for none. */
  has: string;
}

export function spotifyLinksDialog(songs: LinkSong[], onApply: (ids: Map<string, string>, albumLink: string) => void, initialLink = '') {
  showDialog(<SpotifyLinks songs={songs} onApply={onApply} initialLink={initialLink} />);
}

function SpotifyLinks({ songs, onApply, initialLink }: { songs: LinkSong[]; onApply(ids: Map<string, string>, albumLink: string): void; initialLink: string }) {
  const [link, setLink] = useState(initialLink);
  const [list, setList] = useState<{ name: string; tracks: SpotifySong[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [scores, setScores] = useState<Record<string, number>>({});

  const load = () => {
    setBusy(true);
    setError('');
    spotifyList(link)
      .then((l) => {
        setList(l);
        const pairs = pairSongs(songs, l.tracks);
        setPicks(Object.fromEntries(pairs.map((p) => [p.key, p.at])));
        setScores(Object.fromEntries(pairs.map((p) => [p.key, p.score])));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Spotify didn’t answer.'))
      .finally(() => setBusy(false));
  };
  useEffect(() => {
    if (initialLink) load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const taken = new Map<number, string>();
  for (const [k, at] of Object.entries(picks)) if (at >= 0) taken.set(at, k);
  const changes = new Map<string, string>();
  if (list) for (const s of songs) {
    const at = picks[s.key] ?? -1;
    if (at >= 0 && list.tracks[at].id !== s.has) changes.set(s.key, list.tracks[at].id);
  }

  return (
    <div className="tg-dialog tg-links">
      <h2 className="dialog-title">Spotify Links From an Album</h2>
      <p className="muted small">Each song gets the link of the Spotify song it matches. Spicy Lyrics finds word-synced lyrics by these links.</p>
      <form
        className="row-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (link.trim()) load();
        }}>
        <input className="field" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste the album's link (open.spotify.com/album/…) or a playlist's" aria-label="Spotify album link" spellCheck={false} autoFocus />
        <button className="secondary" disabled={busy || !link.trim()}>
          {busy ? 'Looking…' : 'Match'}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      {list ? (
        <div className="tg-pairs" role="table" aria-label="Pairings">
          <div className="tg-pair head" role="row">
            <span>Your Song</span>
            <span>Spotify Song</span>
          </div>
          {songs.map((s) => {
            const at = picks[s.key] ?? -1;
            const sc = scores[s.key] ?? 0;
            const same = at >= 0 && list.tracks[at].id === s.has;
            return (
              <div key={s.key} className={`tg-pair${at < 0 || same ? ' quiet' : ''}${at >= 0 && sc < 100 ? ' doubt' : ''}`} role="row">
                <span className="ellipsis" title={s.title}>
                  {s.n ? <span className="muted">{s.n}. </span> : null}
                  {s.title}
                  <span className="muted small"> {fmtLength(s.length)}</span>
                </span>
                <select
                  className="field select"
                  value={at}
                  aria-label={`Spotify song for ${s.title}`}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setPicks((p) => {
                      const next = { ...p };
                      // A Spotify song goes to one of yours: whoever had it lets it go.
                      for (const k of Object.keys(next)) if (next[k] === v && k !== s.key) next[k] = -1;
                      next[s.key] = v;
                      return next;
                    });
                    setScores((x) => ({ ...x, [s.key]: 100 }));
                  }}>
                  <option value={-1}>No Match</option>
                  {list.tracks.map((t, i) => (
                    <option key={t.id} value={i} disabled={taken.has(i) && taken.get(i) !== s.key}>
                      {t.n}. {t.title} ({fmtLength(t.length)})
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="dialog-actions">
        <button type="button" className="secondary" onClick={closeDialog}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={!changes.size}
          onClick={() => {
            closeDialog();
            onApply(changes, link.trim());
          }}>
          {changes.size ? `Use ${changes.size} ${changes.size === 1 ? 'Link' : 'Links'}` : 'Use Links'}
        </button>
      </div>
    </div>
  );
}

// ---- Auto-Fill from iTunes and MusicBrainz ----

export type FillField = 'date' | 'tracknumber' | 'discnumber' | 'album' | 'albumartist' | 'releasetype' | 'genre' | 'cover';

export const FILL_FIELDS: { key: FillField; label: string }[] = [
  { key: 'date', label: 'Year' },
  { key: 'tracknumber', label: 'Track' },
  { key: 'discnumber', label: 'Disc' },
  { key: 'album', label: 'Album' },
  { key: 'albumartist', label: 'Album Artist' },
  { key: 'releasetype', label: 'Release Type' },
  { key: 'genre', label: 'Genres' },
  { key: 'cover', label: 'Cover' },
];

export interface FillSong {
  key: string;
  artist: string;
  title: string;
  album: string;
  length: number;
  /** What it has now, per field (genres joined with ", "); cover: its size in px, 0 for none. */
  now: Partial<Record<FillField, string>>;
  coverPx?: number;
}

/** What to change per song: the fields, and a cover's address. */
export type FillChanges = Map<string, { set: Partial<Record<Exclude<FillField, 'cover'>, string | string[]>>; cover?: string }>;

const PREFS = 'rakki.tagging.autofill';

function loadPrefs(): { fields: FillField[]; emptyOnly: boolean; fullDate: boolean } {
  const start = { fields: ['date', 'tracknumber', 'genre', 'cover'] as FillField[], emptyOnly: true, fullDate: false };
  try {
    return { ...start, ...(JSON.parse(kv.getItem(PREFS) ?? '{}') as object) };
  } catch {
    return start;
  }
}

export function autoFillDialog(songs: FillSong[], onApply: (changes: FillChanges) => void, where: 'queue' | 'library') {
  showDialog(<AutoFill songs={songs} onApply={onApply} where={where} />);
}

function valueFor(m: Lookup, genre: string[] | undefined, f: FillField, fullDate: boolean): string {
  switch (f) {
    case 'date':
      return fullDate ? m.date : (m.date ?? '').slice(0, 4);
    case 'genre':
      return (genre ?? []).join(', ');
    case 'cover':
      return m.cover ?? '';
    default:
      return (m[f] as string) ?? '';
  }
}

function AutoFill({ songs, onApply, where }: { songs: FillSong[]; onApply(c: FillChanges): void; where: 'queue' | 'library' }) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const save = (p: typeof prefs) => {
    setPrefs(p);
    kv.setItem(PREFS, JSON.stringify(p));
  };

  const look = () => {
    setBusy(true);
    setError('');
    const fields = prefs.fields.filter((f) => f !== 'cover');
    runJob<LookupResult>(
      autofillLookup(
        songs.map((s) => ({ k: s.key, artist: s.artist, title: s.title, album: s.album, length: s.length })),
        fields,
      ),
      `Looking up ${songs.length === 1 ? songs[0].title : `${songs.length} songs`}`,
    )
      .then((job) => {
        const r = job.result ?? { good: 0, results: {} };
        setResult(r);
        setTicked(Object.fromEntries(songs.map((s) => [s.key, (r.results[s.key]?.m?.score ?? 0) >= 75])));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'The look-up failed.'))
      .finally(() => setBusy(false));
  };

  // Look them up as soon as the dialog opens; Look Up Again after changing the fields.
  const looked = useRef(false);
  useEffect(() => {
    if (looked.current) return;
    looked.current = true;
    look();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Per song, the fields that would change: [field, now, new]. */
  const plan = useMemo(() => {
    const out = new Map<string, [FillField, string, string][]>();
    if (!result) return out;
    for (const s of songs) {
      const hit = result.results[s.key];
      const m = hit?.m;
      if (!m) continue;
      const rows: [FillField, string, string][] = [];
      for (const f of prefs.fields) {
        const next = valueFor(m, hit.genre, f, prefs.fullDate);
        if (!next) continue;
        const now = s.now[f] ?? '';
        if (f === 'cover') {
          if (prefs.emptyOnly ? (s.coverPx ?? 0) > 0 : (s.coverPx ?? 0) >= 600) continue;
          rows.push([f, s.coverPx ? `${s.coverPx} px` : 'None', 'New cover']);
          continue;
        }
        if (prefs.emptyOnly && now.trim()) continue;
        if (now.trim().toLowerCase() === next.trim().toLowerCase()) continue;
        if (f === 'genre' && !prefs.emptyOnly) {
          // Genres are added, never taken away.
          const have = new Set(now.split(/\s*,\s*/).filter(Boolean).map((x) => x.toLowerCase()));
          const add = next.split(/\s*,\s*/).filter((g) => g && !have.has(g.toLowerCase()));
          if (!add.length) continue;
          rows.push([f, now, [...now.split(/\s*,\s*/).filter(Boolean), ...add].join(', ')]);
          continue;
        }
        rows.push([f, now, next]);
      }
      if (rows.length) out.set(s.key, rows);
    }
    return out;
  }, [result, songs, prefs]);

  const chosen = songs.filter((s) => ticked[s.key] && plan.has(s.key));
  const apply = () => {
    const changes: FillChanges = new Map();
    for (const s of chosen) {
      const m = result?.results[s.key]?.m;
      const set: Partial<Record<Exclude<FillField, 'cover'>, string | string[]>> = {};
      let cover: string | undefined;
      for (const [f, , next] of plan.get(s.key) ?? []) {
        if (f === 'cover') cover = m?.cover;
        else if (f === 'genre') set.genre = next.split(/\s*,\s*/).filter(Boolean);
        else set[f] = next;
      }
      changes.set(s.key, { set, cover });
    }
    closeDialog();
    onApply(changes);
  };

  const label = (f: FillField) => FILL_FIELDS.find((x) => x.key === f)?.label ?? f;
  return (
    <div className="tg-dialog tg-fill">
      <h2 className="dialog-title">Auto-Fill {songs.length === 1 ? `“${songs[0].title}”` : `${songs.length} Songs`}</h2>
      <p className="muted small">
        Looks each song up on iTunes, then MusicBrainz (genres from MusicBrainz, Discogs and Last.fm). Only exact matches are used: same title, one of the same artists.{' '}
        {where === 'queue' ? 'The values go into the cards; nothing is sent yet.' : 'The files are written as one edit you can undo.'}
      </p>
      <div className="tg-fill-opts">
        <div className="tg-fill-fields" role="group" aria-label="Fill In">
          {FILL_FIELDS.map((f) => (
            <label key={f.key} className="tg-check">
              <input
                type="checkbox"
                checked={prefs.fields.includes(f.key)}
                onChange={(e) => save({ ...prefs, fields: e.target.checked ? [...prefs.fields, f.key] : prefs.fields.filter((x) => x !== f.key) })}
              />
              {f.label}
            </label>
          ))}
        </div>
        <div className="tg-fill-fields">
          <label className="tg-check">
            <input type="checkbox" checked={prefs.emptyOnly} onChange={(e) => save({ ...prefs, emptyOnly: e.target.checked })} />
            Only Fill Empty Fields
          </label>
          <label className="tg-check">
            <input type="checkbox" checked={prefs.fullDate} onChange={(e) => save({ ...prefs, fullDate: e.target.checked })} />
            Full Date (2026-09-18)
          </label>
          <button type="button" className="secondary small" disabled={busy || !prefs.fields.length} onClick={look}>
            {busy ? 'Looking Up…' : result ? 'Look Up Again' : 'Look Up'}
          </button>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {result ? (
        <div className="tg-fill-list">
          {songs.map((s) => {
            const hit = result.results[s.key];
            const m = hit?.m;
            const rows = plan.get(s.key);
            return (
              <div key={s.key} className={`tg-fill-song${!m ? ' miss' : !rows ? ' quiet' : ''}`}>
                <label className="tg-fill-head">
                  <input type="checkbox" disabled={!rows} checked={!!rows && !!ticked[s.key]} onChange={(e) => setTicked((t) => ({ ...t, [s.key]: e.target.checked }))} />
                  <span className="ellipsis">
                    <b>{s.title}</b> <span className="muted">· {s.artist}</span>
                  </span>
                  {m ? (
                    <span className={`tg-score${m.score < 75 ? ' low' : ''}`} title="How sure the match is">
                      {m.score}
                    </span>
                  ) : null}
                </label>
                {!m ? (
                  <p className="muted small">Not found.</p>
                ) : (
                  <>
                    <p className="muted small tg-fill-found">
                      {m.source}: {m.title} · {m.artist} · {m.album} {m.date ? `(${m.date.slice(0, 4)})` : ''}
                      {m.link ? (
                        <button type="button" className="tg-linkbtn" onClick={() => openLink(m.link)} title="Open the page it came from">
                          <ExternalLink size={13} />
                        </button>
                      ) : null}
                    </p>
                    {rows ? (
                      <div className="tg-fill-rows">
                        {rows.map(([f, now, next]) => (
                          <span key={f} className="tg-fill-row">
                            <span className="muted">{label(f)}</span>
                            {now ? <s className="muted">{now}</s> : null}
                            <span className="tg-new">{next}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="muted small">Nothing to change.</p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : busy ? (
        <div className="tg-fill-list">
          {songs.slice(0, 4).map((s) => (
            <div key={s.key} className="tg-fill-song skel-line" />
          ))}
        </div>
      ) : null}
      <div className="dialog-actions">
        <button type="button" className="secondary" onClick={closeDialog}>
          Cancel
        </button>
        <button className="primary" disabled={!chosen.length} onClick={apply}>
          {chosen.length ? `Fill In ${chosen.length} ${chosen.length === 1 ? 'Song' : 'Songs'}` : 'Fill In'}
        </button>
      </div>
    </div>
  );
}

