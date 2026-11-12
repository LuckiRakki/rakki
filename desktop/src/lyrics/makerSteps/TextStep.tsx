// Sync Lyrics, step 1: the words (typed, pasted, or from a file).
import { useState } from 'react';

import type { Draft } from '~/lyrics/maker';
import { LYRICS_FILE_TYPES } from '~/lyrics/lyricsFile';
import { ArrowLeft, ArrowRight, ArrowUpFromLine } from '~/ui/icons';

export function TextStep(p: {
  text: string;
  onText(t: string): void;
  mode: Draft['mode'];
  onMode(m: Draft['mode']): void;
  canFix: boolean;
  fromApi: boolean;
  resume: Draft | null;
  onStart(): void;
  onResume(): void;
  onFix(): void;
  onUpload(file: File): void;
}) {
  const [over, setOver] = useState(false);
  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = LYRICS_FILE_TYPES;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) p.onUpload(file);
    };
    input.click();
  };
  const rows = p.text.split('\n').filter((r) => r.trim()).length;
  const words = p.text.split(/\s+/).filter(Boolean).length;
  return (
    <div className="mk-body mk-text-step">
      <textarea
        className={`mk-text${over ? ' drop' : ''}`}
        value={p.text}
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes('Files')) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          const file = e.dataTransfer.files[0];
          setOver(false);
          if (!file) return;
          e.preventDefault();
          p.onUpload(file);
        }}
        onChange={(e) => p.onText(e.target.value)}
        placeholder={'Paste or type the lyrics, one sung line per row.\n\nLeave an empty row where the singing stops for a while.\n\nOr drop a lyrics file here (.lrc, .ttml or .txt).'}
        spellCheck={false}
        aria-label="The Lyrics"
        autoFocus
      />
      <aside className="mk-side">
        <div className="mk-side-main">
          <h2>How Do You Want to Tap?</h2>
          <div className="mk-modes" role="radiogroup" aria-label="How to Tap">
            {(
              [
                { id: 'line', label: 'Line by Line', detail: 'A tap as each line starts. One listen does it.' },
                { id: 'word', label: 'Word by Word', detail: 'A tap on every word, so the words light up as they’re sung, like Spicy Lyrics. Takes a few listens.' },
              ] as const
            ).map((m) => (
              <button key={m.id} role="radio" aria-checked={p.mode === m.id} className={`mk-mode${p.mode === m.id ? ' on' : ''}`} onClick={() => p.onMode(m.id)}>
                <span className="mk-radio" />
                <span>
                  <b>{m.label}</b>
                  <span>{m.detail}</span>
                </span>
              </button>
            ))}
          </div>
          <ul className="mk-keys">
            <li>
              <kbd>Space</kbd> Tap
            </li>
            <li>
              <kbd>Backspace</kbd> Undo the last tap
            </li>
            <li>
              <kbd aria-label="Left Arrow">
                <ArrowLeft size={13} />
              </kbd>
              <kbd aria-label="Right Arrow">
                <ArrowRight size={13} />
              </kbd>{' '}
              Back or on 3 seconds
            </li>
            <li>
              <kbd>Enter</kbd> Pause or play
            </li>
          </ul>
          {p.fromApi ? <p className="mk-small">This song's lyrics come from the Spicy Lyrics API, which only lets Rakki show them, so paste your own here.</p> : null}
        </div>
        <div className="mk-side-foot">
          <span className="mk-small">{rows ? `${rows} ${rows === 1 ? 'line' : 'lines'}, ${words} ${words === 1 ? 'word' : 'words'}` : 'No lyrics yet'}</span>
          {p.resume ? (
            <button className="secondary" onClick={p.onResume}>
              Continue Where You Left Off
            </button>
          ) : null}
          {p.canFix ? (
            <button className="secondary" onClick={p.onFix}>
              Fix the Timing It Has
            </button>
          ) : null}
          <button className="secondary mk-upload" onClick={pick} title="An .lrc or .ttml file goes to your server as this song's lyrics. A .txt fills the box to tap along to.">
            <ArrowUpFromLine size={16} /> Upload a Lyrics File
          </button>
          <button className="primary" disabled={!rows} onClick={p.onStart}>
            Start Tapping
          </button>
        </div>
      </aside>
    </div>
  );
}
