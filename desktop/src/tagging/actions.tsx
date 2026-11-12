// The library's batch actions, each with a before → after preview of exactly what changes; only
// files that would really change are written (as one edit you can undo from History).
// Auto-Number, Find and Replace, Change Case, Clean Up Text, Split feat. Out of Titles.
import { useMemo, useState } from 'react';

import type { Row, TagField, TagSet } from '~/tagging/api';
import { featMissing, useLibraryArtists } from '~/tagging/data';
import { closeDialog, showDialog } from '~/ui/overlays';

export type Changes = Map<string, TagSet>;

const TEXT_FIELDS: { key: TagField; label: string; list?: boolean }[] = [
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artists', list: true },
  { key: 'albumartist', label: 'Album Artist', list: true },
  { key: 'album', label: 'Album' },
  { key: 'genre', label: 'Genres', list: true },
  { key: 'composer', label: 'Composer' },
];

const valueOf = (r: Row, f: TagField): string | string[] => r[f as keyof Row] as string | string[];
const show = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join('; ') : (v ?? ''));
const same = (a: string | string[], b: string | string[]) => show(a) === show(b);

/** One preview dialog for every action: options on top, the changes below, Apply. */
function ActionDialog({ title, detail, rows, options, compute, onApply }: { title: string; detail: string; rows: Row[]; options: React.ReactNode; compute(): Changes; onApply(c: Changes, desc: string): void }) {
  const changes = compute();
  const list = rows.filter((r) => changes.has(r.p));
  return (
    <div className="tg-dialog tg-action">
      <h2 className="dialog-title">{title}</h2>
      <p className="muted small">{detail}</p>
      <div className="tg-action-opts">{options}</div>
      <div className="tg-preview" role="table" aria-label="What changes">
        {list.slice(0, 300).map((r) => {
          const set = changes.get(r.p) ?? {};
          return (
            <div key={r.p} className="tg-preview-row" role="row">
              <span className="ellipsis muted small" title={r.p}>
                {r.title || r.p.split('/').pop()}
              </span>
              <span className="tg-preview-changes">
                {Object.entries(set).map(([f, v]) => (
                  <span key={f} className="tg-fill-row">
                    <span className="muted">{TEXT_FIELDS.find((x) => x.key === f)?.label ?? (f === 'tracknumber' ? 'Track' : f === 'discnumber' ? 'Disc' : f)}</span>
                    <s className="muted">{show(valueOf(r, f as TagField)) || '(empty)'}</s>
                    <span className="tg-new">{show(v) || '(removed)'}</span>
                  </span>
                ))}
              </span>
            </div>
          );
        })}
        {!list.length ? <p className="muted">Nothing would change.</p> : null}
        {list.length > 300 ? <p className="muted small">…and {list.length - 300} more.</p> : null}
      </div>
      <div className="dialog-actions">
        <button type="button" className="secondary" onClick={closeDialog}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={!list.length}
          onClick={() => {
            closeDialog();
            onApply(changes, `${title} · ${list.length} ${list.length === 1 ? 'file' : 'files'}`);
          }}>
          Change {list.length} {list.length === 1 ? 'File' : 'Files'}
        </button>
      </div>
    </div>
  );
}

type Apply = (c: Changes, desc: string) => void;

// ---- Auto-Number ----

export function autoNumber(rows: Row[], onApply: Apply) {
  showDialog(<AutoNumber rows={rows} onApply={onApply} />);
}

function AutoNumber({ rows, onApply }: { rows: Row[]; onApply: Apply }) {
  const [order, setOrder] = useState<'table' | 'track' | 'file' | 'title'>('table');
  const [format, setFormat] = useState<'n' | 'n/t' | '0n' | '0n/t'>('n/t');
  const [start, setStart] = useState(1);
  const [perAlbum, setPerAlbum] = useState(true);
  const [discs, setDiscs] = useState(false);
  const compute = () => {
    const sorted = [...rows];
    const num = (t: string) => parseInt(t, 10) || 0;
    if (order === 'track') sorted.sort((a, b) => num(a.discnumber) - num(b.discnumber) || num(a.tracknumber) - num(b.tracknumber));
    if (order === 'file') sorted.sort((a, b) => a.p.localeCompare(b.p, undefined, { numeric: true }));
    if (order === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title));
    const groups = new Map<string, Row[]>();
    for (const r of sorted) {
      const k = perAlbum ? `${r.album}\u0000${r.albumartist.join()}\u0000${discs ? '' : num(r.discnumber) || 1}` : '';
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const out: Changes = new Map();
    for (const g of groups.values()) {
      const total = g.length + start - 1;
      const pad = String(total).length;
      g.forEach((r, i) => {
        const n = i + start;
        const s = format.startsWith('0') ? String(n).padStart(Math.max(2, pad), '0') : String(n);
        const t = format.startsWith('0') ? String(total).padStart(Math.max(2, pad), '0') : String(total);
        const value = format.endsWith('/t') ? `${s}/${t}` : s;
        const set: TagSet = {};
        if (value !== r.tracknumber) set.tracknumber = value;
        if (discs && r.discnumber !== '1/1') set.discnumber = '1/1';
        if (Object.keys(set).length) out.set(r.p, set);
      });
    }
    return out;
  };
  return (
    <ActionDialog
      title="Auto-Number"
      detail="Numbers the songs in order. Sort the table first to number them in that order."
      rows={rows}
      compute={compute}
      onApply={onApply}
      options={
        <>
          <label className="tg-check">
            Order
            <select className="field select sm" value={order} onChange={(e) => setOrder(e.target.value as typeof order)}>
              <option value="table">As in the Table</option>
              <option value="track">By Track Number</option>
              <option value="file">By File Name</option>
              <option value="title">By Title</option>
            </select>
          </label>
          <label className="tg-check">
            Style
            <select className="field select sm" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
              <option value="n">3</option>
              <option value="n/t">3/12</option>
              <option value="0n">03</option>
              <option value="0n/t">03/12</option>
            </select>
          </label>
          <label className="tg-check">
            Start at
            <input className="field sm tg-num" type="number" min={0} value={start} onChange={(e) => setStart(Math.max(0, parseInt(e.target.value, 10) || 0))} />
          </label>
          <label className="tg-check">
            <input type="checkbox" checked={perAlbum} onChange={(e) => setPerAlbum(e.target.checked)} />
            Start Again for Each Album and Disc
          </label>
          <label className="tg-check">
            <input type="checkbox" checked={discs} onChange={(e) => setDiscs(e.target.checked)} />
            Set Discs to 1/1
          </label>
        </>
      }
    />
  );
}

// ---- Find and Replace ----

export function findReplace(rows: Row[], onApply: Apply) {
  showDialog(<FindReplace rows={rows} onApply={onApply} />);
}

function FindReplace({ rows, onApply }: { rows: Row[]; onApply: Apply }) {
  const [field, setField] = useState<TagField | 'all'>('all');
  const [find, setFind] = useState('');
  const [put, setPut] = useState('');
  const [caseSens, setCase] = useState(false);
  const [words, setWords] = useState(false);
  const [regex, setRegex] = useState(false);
  const pattern = useMemo(() => {
    if (!find) return null;
    try {
      const src = regex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(words ? `\\b${src}\\b` : src, caseSens ? 'g' : 'gi');
    } catch {
      return null;
    }
  }, [find, caseSens, words, regex]);
  const compute = () => {
    const out: Changes = new Map();
    if (!pattern) return out;
    const fields = field === 'all' ? TEXT_FIELDS : TEXT_FIELDS.filter((f) => f.key === field);
    for (const r of rows) {
      const set: TagSet = {};
      for (const f of fields) {
        const v = valueOf(r, f.key);
        const next = Array.isArray(v) ? v.map((x) => x.replace(pattern, put).replace(/\s+/g, ' ').trim()).filter(Boolean) : v.replace(pattern, put);
        if (!same(v, next)) set[f.key] = next;
      }
      if (Object.keys(set).length) out.set(r.p, set);
    }
    return out;
  };
  return (
    <ActionDialog
      title="Find and Replace"
      detail="Lists (artists, genres) are changed value by value. With Regular Expression, $1 puts back what a group matched."
      rows={rows}
      compute={compute}
      onApply={onApply}
      options={
        <>
          <label className="tg-check">
            In
            <select className="field select sm" value={field} onChange={(e) => setField(e.target.value as TagField | 'all')}>
              <option value="all">Every Text Field</option>
              {TEXT_FIELDS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <input className={`field sm${find && !pattern ? ' invalid' : ''}`} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find" aria-label="Find" spellCheck={false} autoFocus />
          <input className="field sm" value={put} onChange={(e) => setPut(e.target.value)} placeholder="Replace With" aria-label="Replace with" spellCheck={false} />
          <label className="tg-check">
            <input type="checkbox" checked={caseSens} onChange={(e) => setCase(e.target.checked)} />
            Match Case
          </label>
          <label className="tg-check">
            <input type="checkbox" checked={words} onChange={(e) => setWords(e.target.checked)} />
            Whole Words
          </label>
          <label className="tg-check">
            <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} />
            Regular Expression
          </label>
        </>
      }
    />
  );
}

// ---- Change Case ----

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'the', 'to', 'up', 'vs', 'via', 'with', 'feat', 'ft']);
const KEEP = /^(DJ|MC|OST|EP|LP|UK|USA?|II|III|IV|VI|VII|VIII|IX|XI|TV|NYC|LA|R&B|A\$AP|iPhone|iPod|McCartney|MacDonald|feat\.)$/;

function titleCase(s: string): string {
  const words = s.split(/(\s+)/);
  let first = true;
  return words
    .map((w, i) => {
      if (/^\s+$/.test(w)) return w;
      const isFirst = first;
      first = false;
      const isLast = words.slice(i + 1).every((x) => /^\s*$/.test(x));
      if (KEEP.test(w) || /[A-Z].*[A-Z]/.test(w.slice(1)) || /\d/.test(w)) return w;
      const bare = w.toLowerCase().replace(/[^a-z]/g, '');
      if (!isFirst && !isLast && SMALL.has(bare) && !/[([:]$/.test(words[i - 2] ?? '')) return w.toLowerCase();
      return w.replace(/^([^\p{L}]*)(\p{L})(.*)$/u, (_, a: string, b: string, c: string) => a + b.toUpperCase() + c.toLowerCase());
    })
    .join('');
}

const CASES: Record<string, { label: string; run(s: string): string }> = {
  title: { label: 'Title Case', run: titleCase },
  sentence: { label: 'Sentence case', run: (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() },
  lower: { label: 'lower case', run: (s) => s.toLowerCase() },
  upper: { label: 'UPPER CASE', run: (s) => s.toUpperCase() },
  first: { label: 'First letter only', run: (s) => s.charAt(0).toUpperCase() + s.slice(1) },
};

export function changeCase(rows: Row[], onApply: Apply) {
  showDialog(<ChangeCase rows={rows} onApply={onApply} />);
}

function ChangeCase({ rows, onApply }: { rows: Row[]; onApply: Apply }) {
  const [mode, setMode] = useState('title');
  const [fields, setFields] = useState<TagField[]>(['title']);
  const compute = () => {
    const out: Changes = new Map();
    const run = CASES[mode].run;
    for (const r of rows) {
      const set: TagSet = {};
      for (const f of fields) {
        const v = valueOf(r, f);
        const next = Array.isArray(v) ? v.map(run) : run(v);
        if (!same(v, next)) set[f] = next;
      }
      if (Object.keys(set).length) out.set(r.p, set);
    }
    return out;
  };
  return (
    <ActionDialog
      title="Change Case"
      detail="Title Case keeps small words lower-case and leaves names like DJ, OST and McCartney as they are."
      rows={rows}
      compute={compute}
      onApply={onApply}
      options={
        <>
          <select className="field select sm" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Case">
            {Object.entries(CASES).map(([k, c]) => (
              <option key={k} value={k}>
                {c.label}
              </option>
            ))}
          </select>
          {TEXT_FIELDS.map((f) => (
            <label key={f.key} className="tg-check">
              <input type="checkbox" checked={fields.includes(f.key)} onChange={(e) => setFields((x) => (e.target.checked ? [...x, f.key] : x.filter((k) => k !== f.key)))} />
              {f.label}
            </label>
          ))}
        </>
      }
    />
  );
}

// ---- Clean Up Text ----

export function cleanUp(rows: Row[], onApply: Apply) {
  showDialog(<CleanUp rows={rows} onApply={onApply} />);
}

function CleanUp({ rows, onApply }: { rows: Row[]; onApply: Apply }) {
  const [quotes, setQuotes] = useState(false);
  const [split, setSplit] = useState(true);
  const compute = () => {
    const tidy = (s: string) => {
      let t = s.replace(/[​-‏⁠﻿]/g, '').replace(/ /g, ' ');
      if (quotes) t = t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
      return t.replace(/\s+/g, ' ').trim();
    };
    const out: Changes = new Map();
    for (const r of rows) {
      const set: TagSet = {};
      for (const f of TEXT_FIELDS) {
        const v = valueOf(r, f.key);
        let next: string | string[] = Array.isArray(v) ? v.map(tidy) : tidy(v);
        if (Array.isArray(next) && split) next = next.flatMap((x) => x.split(/\s*;\s*/)).filter(Boolean);
        if (!same(v, next)) set[f.key] = next;
      }
      if (Object.keys(set).length) out.set(r.p, set);
    }
    return out;
  };
  return (
    <ActionDialog
      title="Clean Up Text"
      detail="Takes out hidden characters (zero-width spaces, byte-order marks), turns non-breaking spaces into spaces and trims extra ones. Hidden characters are what make Jellyfin show the same artist twice."
      rows={rows}
      compute={compute}
      onApply={onApply}
      options={
        <>
          <label className="tg-check">
            <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
            Split Artists and Genres Joined With ;
          </label>
          <label className="tg-check">
            <input type="checkbox" checked={quotes} onChange={(e) => setQuotes(e.target.checked)} />
            Straighten Curly Quotes
          </label>
        </>
      }
    />
  );
}

// ---- Split feat. out of titles ----

export function splitFeat(rows: Row[], onApply: Apply) {
  showDialog(<SplitFeat rows={rows} onApply={onApply} />);
}

function SplitFeat({ rows, onApply }: { rows: Row[]; onApply: Apply }) {
  const known = useLibraryArtists().data;
  const [keepTitle, setKeepTitle] = useState(false);
  const compute = () => {
    const out: Changes = new Map();
    for (const r of rows) {
      const f = featMissing(r.title, r.artist, known);
      if (!f) continue;
      out.set(r.p, { artist: [...r.artist, ...f.missing], ...(keepTitle ? null : { title: f.rest }) });
    }
    return out;
  };
  return (
    <ActionDialog
      title="Split feat. Out of Titles"
      detail="Titles that credit someone missing from Artists, like “Song (feat. A & B)”: the names go into Artists. Names your library knows keep their spelling and stay whole."
      rows={rows}
      compute={compute}
      onApply={onApply}
      options={
        <label className="tg-check">
          <input type="checkbox" checked={keepTitle} onChange={(e) => setKeepTitle(e.target.checked)} />
          Keep the feat. in the Title
        </label>
      }
    />
  );
}
