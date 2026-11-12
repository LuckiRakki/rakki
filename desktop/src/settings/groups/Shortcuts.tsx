// Settings → Shortcuts: every action's keys, recorded by pressing them (settings/shortcuts.ts).
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { comboFromEvent, comboKeys, conflictOf, DEFAULT_BINDINGS, isReserved, SHORTCUT_ACTIONS, useShortcuts, type ShortcutId } from '~/settings/shortcuts';
import { toast } from '~/ui/overlays';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Undo, X, type Icon } from '~/ui/icons';
import { Card } from '~/settings/rows';

const sameKeys = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((k, i) => k === b[i]);

const actionLabel = (id: ShortcutId) => SHORTCUT_ACTIONS.find((a) => a.id === id)?.label ?? id;

/** The arrow keys, drawn as arrows (settings/shortcuts.ts names them with arrow characters). */
const ARROW_KEYS: Record<string, { icon: Icon; name: string }> = {
  '←': { icon: ArrowLeft, name: 'Left Arrow' },
  '→': { icon: ArrowRight, name: 'Right Arrow' },
  '↑': { icon: ArrowUp, name: 'Up Arrow' },
  '↓': { icon: ArrowDown, name: 'Down Arrow' },
};

/** A shortcut in words, for toasts and screen readers: "Ctrl+Left Arrow". */
const comboWords = (combo: string) => comboKeys(combo).map((k) => ARROW_KEYS[k]?.name ?? k).join('+');

/** A shortcut as keycaps. */
function Keys({ combo }: { combo: string }) {
  return (
    <span className="keys-caps">
      {comboKeys(combo).map((k, i) => {
        const Arrow = ARROW_KEYS[k]?.icon;
        return (
          <kbd key={i} aria-label={ARROW_KEYS[k]?.name}>
            {Arrow ? <Arrow size={14} /> : k}
          </kbd>
        );
      })}
    </span>
  );
}

/**
 * Waits for the new keys: the shortcut you press is taken as soon as it has a key besides
 * Ctrl, Alt and Shift (shown as you hold them). Esc or clicking away cancels.
 */
function KeyRecorder({ onKeys, onCancel, label }: { onKeys(combo: string): void; onCancel(): void; label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [held, setHeld] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  // Shortcuts rest while keys are being recorded, so pressing Space here doesn't play.
  useEffect(() => {
    ref.current?.focus();
    useShortcuts.getState().setRecording(true);
    return () => useShortcuts.getState().setRecording(false);
  }, []);
  const mods = (e: ReactKeyboardEvent) => [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter((m): m is string => !!m);
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Tab') return onCancel();
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) return onCancel();
    const combo = comboFromEvent(e.nativeEvent);
    if (!combo) return setHeld(mods(e));
    if (isReserved(combo)) {
      setHeld([]);
      return setNote('Esc, Tab and Enter keep their usual jobs. Try another.');
    }
    onKeys(combo);
  };
  return (
    <span className="key-recorder-wrap">
      <button
        ref={ref}
        className="key-chip recording"
        aria-label={`Press the New Shortcut for ${label}`}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => setHeld(mods(e))}
        onBlur={onCancel}>
        {held.length ? (
          <span className="keys-caps">
            {held.map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
            <span className="key-wait">…</span>
          </span>
        ) : (
          'Press the Keys'
        )}
      </button>
      {note ? <span className="key-note">{note}</span> : null}
    </span>
  );
}

function ShortcutRow({ id, label }: { id: ShortcutId; label: string }) {
  const combos = useShortcuts((s) => s.bindings[id] ?? []);
  /** Which shortcut is being replaced (its place), 'new' for an added one, null when not recording. */
  const [recording, setRecording] = useState<number | 'new' | null>(null);
  const changed = !sameKeys(combos, DEFAULT_BINDINGS[id]);

  const take = (combo: string) => {
    const s = useShortcuts.getState();
    const mine = s.bindings[id] ?? [];
    const next = recording === 'new' || recording === null ? [...mine, combo] : mine.map((c, i) => (i === recording ? combo : c));
    setRecording(null);
    // Used by another action: it moves here (the other loses it), and a toast says so.
    const other = conflictOf(combo, id);
    if (other) {
      s.setBinding(other, (s.bindings[other] ?? []).filter((c) => c !== combo));
      toast(`${comboWords(combo)} moved here from ${actionLabel(other)}`);
    }
    s.setBinding(id, [...new Set(next)]);
  };
  const remove = (i: number) => useShortcuts.getState().setBinding(id, combos.filter((_, j) => j !== i));

  return (
    <div className="setting shortcut-row">
      <div className="setting-text">
        <div className="setting-label">{label}</div>
      </div>
      <div className="shortcut-keys">
        {combos.map((c, i) =>
          recording === i ? (
            <KeyRecorder key={c} label={label} onKeys={take} onCancel={() => setRecording(null)} />
          ) : (
            <span key={c} className="key-chip-wrap">
              <button className="key-chip" aria-label={`${label}: ${comboWords(c)}. Change`} title="Change" onClick={() => setRecording(i)}>
                <Keys combo={c} />
              </button>
              <button className="key-remove" aria-label={`Remove ${comboWords(c)} from ${label}`} title="Remove" onClick={() => remove(i)}>
                <X size={12} />
              </button>
            </span>
          ),
        )}
        {recording === 'new' ? (
          <KeyRecorder label={label} onKeys={take} onCancel={() => setRecording(null)} />
        ) : combos.length ? (
          combos.length < 3 ? (
            <button className="key-add" aria-label={`Add a Shortcut for ${label}`} title="Add Another" onClick={() => setRecording('new')}>
              <Plus size={15} />
            </button>
          ) : null
        ) : (
          <button className="key-chip empty" aria-label={`Add a Shortcut for ${label}`} onClick={() => setRecording('new')}>
            Add Shortcut
          </button>
        )}
        <button
          className={`key-reset${changed ? '' : ' hidden'}`}
          aria-label={`Back to the Default for ${label}`}
          title="Back to the Default"
          tabIndex={changed ? 0 : -1}
          aria-hidden={!changed}
          onClick={() => useShortcuts.getState().resetBinding(id)}>
          <Undo size={15} />
        </button>
      </div>
    </div>
  );
}

export function Shortcuts() {
  const bindings = useShortcuts((s) => s.bindings);
  const groups = [...new Set(SHORTCUT_ACTIONS.map((a) => a.group))];
  const changed = SHORTCUT_ACTIONS.some((a) => !sameKeys(bindings[a.id], DEFAULT_BINDINGS[a.id]));
  return (
    <>
      <p className="settings-lead">
        Click a shortcut and press the keys you want instead; Esc cancels. Keys you give one action leave the one that had them. While you type in a
        box, most shortcuts wait so the keys can type.
      </p>
      {groups.map((g) => (
        <Card key={g} title={g}>
          {SHORTCUT_ACTIONS.filter((a) => a.group === g).map((a) => (
            <ShortcutRow key={a.id} id={a.id} label={a.label} />
          ))}
        </Card>
      ))}
      <div className="settings-foot">
        <button className="secondary small" disabled={!changed} onClick={() => useShortcuts.getState().resetAll()}>
          Back to the Default Shortcuts
        </button>
      </div>
    </>
  );
}
