// Sync Lyrics: make timed lyrics for a song by tapping along as it plays (Riff's idea, done the
// Rakki way). Three steps: the words (pasted, or the lyrics the song already has on your
// server), tapping (Space as each line, or each word, starts), and checking (every line with
// its time, nudged or tapped again). Saved by the Rakki plugin on your server, apart from the
// music files (lyrics/maker.ts), so every Rakki shows them; the work in progress is kept on
// this computer until then.
//
// Lyrics from the Spicy Lyrics API are never copied in: its terms only allow showing them.
import { useEffect, useRef, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { artColor } from '@/lib/blurhash';
import { useLyrics } from '@/lyrics/fetch';
import { playNow } from '~/audio/AudioEditor';
import { useAuth } from '~/auth/session';
import { useLayout } from '~/layout/layout';
import { clearTimings, draftFromLyrics, draftFromText, loadDraft, nextTarget, saveDraftLocal, uploadLyrics, untap, type Draft } from '~/lyrics/maker';
import { pickLyrics } from '~/lyrics/LyricsView';
import { LyricsFileError, readLyricsFile } from '~/lyrics/lyricsFile';
import { go, useNav } from '~/nav';
import { usePlayer } from '~/player/store';
import { queryClient, useItem } from '~/queries';
import { useActiveTheme } from '~/themes/themes';
import { useEditsAvailable } from '~/audio/edits';
import { Check, ChevronLeft, Stopwatch } from '~/ui/icons';
import { confirmAction, toast } from '~/ui/overlays';
import { Artwork, ticksToSeconds } from '~/ui/parts';
import { Empty, Loading } from '~/ui/states';
import { type Step, anyTapped, lastTap, textOf } from '~/lyrics/makerSteps/helpers';
import { TextStep } from '~/lyrics/makerSteps/TextStep';
import { TapStep } from '~/lyrics/makerSteps/TapStep';
import { CheckStep } from '~/lyrics/makerSteps/CheckStep';

/** Open the lyrics maker for a song in the main area. */
export function openLyricsMaker(item: BaseItem) {
  queryClient.setQueryData(['item', useAuth.getState().session?.userId, item.Id], item);
  const l = useLayout.getState();
  if (l.nowPlaying) l.setNowPlaying(false);
  go({ name: 'makeLyrics', id: item.Id });
}

export function LyricsMaker({ id }: { id: string }) {
  const q = useItem(id);
  const item = q.data;
  if (!item) return q.isError ? <Empty icon={Stopwatch} title="Couldn't Find the Song" detail="It may have been removed from your server." /> : <Loading what="the song" />;
  if (item.Type !== 'Audio' || item.Radio) return <Empty icon={Stopwatch} title="Only Songs Have Lyrics to Sync" />;
  return <Maker item={item} />;
}

function Maker({ item }: { item: BaseItem }) {
  const client = useAuth((s) => s.client);
  const available = useEditsAvailable();
  const current = usePlayer((s) => s.queue[s.index]?.Id === item.Id);
  const lyricsQ = useLyrics(item.Id);
  const existing = pickLyrics(lyricsQ.data);
  // Only lyrics that live on your server (its files, or made in Rakki) can be the starting
  // point, never the Spicy Lyrics API's.
  const own = existing && (!existing.source || existing.source === 'rakki') ? existing : null;
  const [draft, setDraftState] = useState<Draft | null>(() => loadDraft(item.Id));
  const [text, setText] = useState(() => (draft ? textOf(draft) : ''));
  const [mode, setMode] = useState<Draft['mode']>(draft?.mode ?? 'line');
  const [step, setStep] = useState<Step>(() => (draft && anyTapped(draft) ? 'check' : 'text'));
  const typed = useRef(!!draft);

  // The lyrics the song has fill the box, until you type.
  useEffect(() => {
    if (!typed.current && own) setText(own.lines.map((l) => l.text).join('\n'));
  }, [own]);

  const setDraft = (d: Draft) => {
    setDraftState(d);
    saveDraftLocal(d);
  };

  const start = (d: Draft) => {
    setDraft(d);
    setStep('tap');
    // From the top for a fresh start, else a little before where you got to.
    const from = anyTapped(d) ? Math.max(0, lastTap(d) / 1000 - 3) : 0;
    if (current) {
      const p = usePlayer.getState();
      p.seek(from);
      if (!p.playing) p.toggle();
    } else playNow(item, from);
  };

  // A lyrics file from this computer (lyrics/lyricsFile.ts): timed ones go to the server as the
  // song's lyrics straight away; words alone fill the box to tap along to.
  const upload = async (file: File) => {
    const name = item.Name;
    let read;
    try {
      read = await readLyricsFile(file, { itemId: item.Id, title: item.Name, artist: item.Artists?.join(', '), durationMs: ticksToSeconds(item.RunTimeTicks) * 1000 });
    } catch (e) {
      return toast(e instanceof LyricsFileError ? e.message : "Couldn't read that file.");
    }
    if (read.kind === 'text') {
      typed.current = true;
      setText(read.text);
      return toast('No times in that file: tap along to sync it');
    }
    if (!available) return toast('Uploading lyrics needs the Rakki plugin on your server.');
    if (own && !(await confirmAction(`Replace the Lyrics for ${name}?`, `${file.name} (${read.lines} ${read.lines === 1 ? 'line' : 'lines'}, ${read.words ? 'word by word' : 'line by line'}) becomes this song's lyrics on your server, in every Rakki.`, 'Replace'))) return;
    useNav.getState().back();
    const backTo = useNav.getState().route;
    try {
      await uploadLyrics(item.Id, read.ttml);
      toast(`Uploaded the lyrics for ${name}`);
      const p = usePlayer.getState();
      if (p.queue[p.index]?.Id === item.Id && useNav.getState().route === backTo) useLayout.getState().setLyricsView(true);
    } catch (e) {
      toast(`Couldn't upload the lyrics for ${name} (${e instanceof Error ? e.message : 'the server said no'}).`);
    }
  };

  const tint = client ? artColor(client.blurhash(item), '#202024') : '#202024';
  const ownBackground = useActiveTheme().meta.backdrop !== 'flow';
  const artists = item.Artists?.join(', ') || item.AlbumArtist;
  const steps: { id: Step; label: string }[] = [
    { id: 'text', label: 'Words' },
    { id: 'tap', label: 'Tap' },
    { id: 'check', label: 'Check' },
  ];

  return (
    <div className={`maker${ownBackground ? ' own-bg' : ''}`} style={{ ['--tint' as string]: tint }}>
      <header className="mk-top">
        <button className="iconbtn mk-back" aria-label="Back" title="Back" onClick={() => useNav.getState().back()}>
          <ChevronLeft size={22} />
        </button>
        <Artwork item={item} size={120} className="mk-art" />
        <div className="mk-title">
          <div className="kind">Sync Lyrics</div>
          <div className="mk-name">{item.Name}</div>
          <div className="mk-sub">{artists}</div>
        </div>
        <ol className="mk-steps" aria-label="Steps">
          {steps.map((s, i) => {
            const at = steps.findIndex((x) => x.id === step);
            return (
              <li key={s.id} className={i === at ? 'on' : i < at ? 'done' : ''} aria-current={i === at ? 'step' : undefined}>
                <span className="mk-step-n">{i < at ? <Check size={13} /> : i + 1}</span>
                {s.label}
              </li>
            );
          })}
        </ol>
      </header>
      {step === 'text' ? (
        <TextStep
          text={text}
          onText={(t) => {
            typed.current = true;
            setText(t);
          }}
          mode={mode}
          onMode={setMode}
          canFix={!!own?.isSynced}
          fromApi={!!existing && !own}
          resume={draft && anyTapped(draft) && textOf(draft) === text ? draft : null}
          onStart={() => start(draftFromText(item.Id, text, mode))}
          onUpload={(f) => void upload(f)}
          onResume={() => draft && setStep('check')}
          onFix={() => {
            if (!own) return;
            const d = draftFromLyrics(item.Id, own.lines);
            setDraft(d);
            setMode(d.mode);
            setStep('check');
          }}
        />
      ) : step === 'tap' && draft ? (
        <TapStep item={item} draft={draft} current={current} onDraft={setDraft} onDone={() => setStep('check')} />
      ) : draft ? (
        <CheckStep
          item={item}
          draft={draft}
          current={current}
          available={available}
          onDraft={setDraft}
          onTap={() => start(draft)}
          onRetapFrom={(i) => {
            if (i === 0) return start(clearTimings(draft));
            // Undo taps until this line is the next to tap, then tap on from a little before it.
            let d = draft;
            for (let guard = 0; guard < 5000; guard++) {
              const t = nextTarget(d);
              if (t && t.line <= i && !t.end) break;
              const back = untap(d);
              if (back === d) break;
              d = back;
            }
            start(d);
          }}
          onWords={() => {
            setText(textOf(draft));
            setStep('text');
          }}
        />
      ) : null}
    </div>
  );
}
