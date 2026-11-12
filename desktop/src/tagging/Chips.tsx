// A box of chips: genres or artists, one chip each (MRQ writes each as its own value, so Jellyfin
// links the song to every artist and genre). Type and press Enter, comma or semicolon; paste a
// whole list (a RateYourMusic block splits into chips); Backspace in an empty box takes the last
// one off; double-click a chip to change it; drag chips to reorder (the first genre is the one
// most players show). Suggestions come from the library, and genres are checked against it: a
// dashed chip is new to the library, a red one is probably another spelling (click to fix).
import { useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';

import { splitValues } from '~/tagging/api';
import { checkGenre, librarySpelling, useGenrePool, useLibraryArtists } from '~/tagging/data';
import { Copy, X } from '~/ui/icons';
import { toast } from '~/ui/overlays';

export interface ChipsProps {
  values: string[];
  onChange(values: string[]): void;
  kind: 'genre' | 'artist';
  placeholder?: string;
  /** Shown as dashed "on some songs" chips with a count, in a selection of several. */
  partial?: { value: string; count: number }[];
  total?: number;
  /** Add a partial chip's value to every song. */
  onFill?(value: string): void;
  /** Take a value off every song (mixed selections). */
  onRemoveAll?(value: string): void;
  autoFocus?: boolean;
  label?: string;
  compact?: boolean;
}

export function Chips({ values, onChange, kind, placeholder, partial, total, onFill, onRemoveAll, autoFocus, label, compact }: ChipsProps) {
  const pool = useGenrePool().data?.genres;
  const artists = useLibraryArtists().data;
  const words = kind === 'genre' ? pool : artists;
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [hi, setHi] = useState(0);
  const [focused, setFocused] = useState(false);
  const drag = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const tidy = (v: string) => (kind === 'artist' ? librarySpelling(v, artists) : (pool?.find((p) => p.toLowerCase() === v.toLowerCase()) ?? v));

  const add = (raw: string) => {
    const parts = splitValues(raw, kind === 'genre').map(tidy);
    if (!parts.length) return;
    const have = new Set(values.map((v) => v.toLowerCase()));
    const next = [...values, ...parts.filter((p) => !have.has(p.toLowerCase()) && (have.add(p.toLowerCase()), true))];
    if (next.length !== values.length) onChange(next);
    setText('');
    setHi(0);
  };

  const suggestions = useMemo(() => {
    const t = text.trim().toLowerCase();
    if (!t || !words?.length) return [];
    const have = new Set(values.map((v) => v.toLowerCase()));
    const starts: string[] = [];
    const inside: string[] = [];
    for (const w of words) {
      const l = w.toLowerCase();
      if (have.has(l)) continue;
      if (l.startsWith(t)) starts.push(w);
      else if (l.includes(t)) inside.push(w);
      if (starts.length >= 8) break;
    }
    return [...starts, ...inside].slice(0, 8);
  }, [text, words, values]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setHi((h) => (h + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length);
      return;
    }
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || (e.key === 'Tab' && text.trim())) {
      if (!text.trim()) return;
      e.preventDefault();
      add(suggestions.length && e.key !== ',' && e.key !== ';' ? suggestions[Math.min(hi, suggestions.length - 1)] : text);
    } else if (e.key === 'Backspace' && !text && values.length) {
      onChange(values.slice(0, -1));
    } else if (e.key === 'Escape' && text) {
      e.stopPropagation();
      setText('');
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (/[,;\n\\|]/.test(pasted)) {
      e.preventDefault();
      add(pasted);
    }
  };

  const commitEdit = (i: number) => {
    const parts = splitValues(editText, kind === 'genre').map(tidy);
    const next = [...values];
    next.splice(i, 1, ...parts);
    setEditing(null);
    onChange(next.filter((v, j) => next.findIndex((w) => w.toLowerCase() === v.toLowerCase()) === j));
  };

  const dropOn = (e: DragEvent, i: number) => {
    e.preventDefault();
    const from = drag.current;
    drag.current = null;
    if (from === null || from === i) return;
    const next = [...values];
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    onChange(next);
  };

  const copy = () => {
    void navigator.clipboard?.writeText(values.join('\\\\')).then(() => toast(`Copied ${values.length === 1 ? values[0] : `${values.length} ${kind === 'genre' ? 'genres' : 'artists'}`}`));
  };

  return (
    <div
      className={`chips field${focused ? ' focused' : ''}${compact ? ' compact' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          input.current?.focus();
        }
      }}>
      {values.map((v, i) => {
        const check = kind === 'genre' ? checkGenre(v, pool) : { kind: 'ok' as const };
        if (editing === i) {
          return (
            <input
              key={`e${i}`}
              className="chip-edit"
              value={editText}
              autoFocus
              size={Math.max(4, editText.length)}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={() => commitEdit(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitEdit(i);
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  setEditing(null);
                }
              }}
            />
          );
        }
        const title =
          check.kind === 'new'
            ? 'Not in your library yet (fine if you mean it)'
            : check.kind === 'spelling'
              ? `Your library writes it “${check.use}”. Click to use that`
              : check.kind === 'malformed'
                ? 'Several genres in one: double-click to split it'
                : 'Double-click to change, drag to reorder';
        return (
          <span
            key={`${v}${i}`}
            className={`chip ${check.kind}`}
            title={title}
            draggable
            onDragStart={(e) => {
              drag.current = i;
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => drag.current !== null && e.preventDefault()}
            onDrop={(e) => dropOn(e, i)}
            onClick={() => {
              if (check.kind === 'spelling') onChange(values.map((x, j) => (j === i ? check.use : x)));
            }}
            onDoubleClick={() => {
              setEditing(i);
              setEditText(v);
            }}>
            {check.kind === 'spelling' ? (
              <>
                <s>{v}</s> {check.use}
              </>
            ) : (
              v
            )}
            <button
              type="button"
              className="chip-x"
              aria-label={`Remove ${v}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(values.filter((_, j) => j !== i));
              }}>
              <X size={12} />
            </button>
          </span>
        );
      })}
      {partial?.map((p) => (
        <span key={`p${p.value}`} className="chip partial" title={`On ${p.count} of ${total} songs`}>
          {p.value}
          <span className="chip-count">
            {p.count}/{total}
          </span>
          {onFill ? (
            <button type="button" className="chip-x" aria-label={`Add ${p.value} to every song`} title="Add to every song" onClick={() => onFill(p.value)}>
              +
            </button>
          ) : null}
          {onRemoveAll ? (
            <button type="button" className="chip-x" aria-label={`Take ${p.value} off every song`} title="Take off every song" onClick={() => onRemoveAll(p.value)}>
              <X size={12} />
            </button>
          ) : null}
        </span>
      ))}
      <span className="chip-input-wrap">
        <input
          ref={input}
          className="chip-input"
          value={text}
          aria-label={label ?? (kind === 'genre' ? 'Genres' : 'Artists')}
          placeholder={values.length || partial?.length ? '' : (placeholder ?? (kind === 'genre' ? 'Add genres' : 'Add artists'))}
          spellCheck={false}
          autoFocus={autoFocus}
          onChange={(e) => {
            setText(e.target.value);
            setHi(0);
          }}
          onKeyDown={onKey}
          onPaste={onPaste}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (text.trim()) add(text);
          }}
        />
        {focused && suggestions.length ? (
          <span className="chip-suggest" role="listbox">
            {suggestions.map((s, i) => (
              <button
                type="button"
                key={s}
                role="option"
                aria-selected={i === hi}
                className={i === hi ? 'on' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s);
                }}>
                {s}
              </button>
            ))}
          </span>
        ) : null}
      </span>
      {values.length > 1 ? (
        <button type="button" className="chips-copy" title={`Copy these ${kind === 'genre' ? 'genres' : 'artists'}`} aria-label="Copy" onClick={copy}>
          <Copy size={14} />
        </button>
      ) : null}
    </div>
  );
}

/** One line of text with suggestions from the library's artists (Album Artist, File Under). */
export function ArtistField({ value, onChange, placeholder, label, className = '' }: { value: string; onChange(v: string): void; placeholder?: string; label: string; className?: string }) {
  const artists = useLibraryArtists().data;
  const [focused, setFocused] = useState(false);
  const [hi, setHi] = useState(0);
  const t = value.trim().toLowerCase();
  const list = useMemo(() => (t && artists ? artists.filter((a) => a.toLowerCase().includes(t) && a.toLowerCase() !== t).slice(0, 8) : []), [t, artists]);
  return (
    <span className={`chip-input-wrap block ${className}`}>
      <input
        className="field"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => {
          onChange(e.target.value);
          setHi(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          const snapped = librarySpelling(value, artists);
          if (snapped !== value) onChange(snapped);
        }}
        onKeyDown={(e) => {
          if (!list.length) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => (h + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length);
          } else if (e.key === 'Enter' && focused) {
            e.preventDefault();
            onChange(list[Math.min(hi, list.length - 1)]);
            setFocused(false);
          }
        }}
      />
      {focused && list.length ? (
        <span className="chip-suggest" role="listbox">
          {list.map((s, i) => (
            <button
              type="button"
              key={s}
              role="option"
              aria-selected={i === hi}
              className={i === hi ? 'on' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
                setFocused(false);
              }}>
              {s}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
