// Covers in Tagging. A cover box takes a picture every desktop way: drop an image file (or one
// dragged out of a web page) on it, paste one (Ctrl+V while it's focused), or click it for a menu:
// search iTunes and Deezer, use a picture that came in the download's folder, or pick a file.
// Its size shows underneath, amber under 600 px.
import { useEffect, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react';

import { artSearch, folderImages, folderImageUrl, type ArtResult } from '~/tagging/api';
import { Check, ImagePlus, Search, Trash2 } from '~/ui/icons';
import { closeDialog, openMenu, showDialog, toast, type MenuItem } from '~/ui/overlays';

export type PickedArt = { url: string } | { file: Blob } | { folder: string };

/** A picked picture, for showing before it's saved. */
export const pickedPreview = (art: PickedArt, tid?: string): string =>
  'url' in art ? art.url : 'file' in art ? URL.createObjectURL(art.file) : tid ? folderImageUrl(tid, art.folder) : '';

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

const tooBig = (f: Blob) => f.size > 15 * 1024 * 1024 && (toast('That picture is too big: pick one under 15 MB'), true);

/** A picture from a drop or a paste: a file, or a web address of one. */
function pictureFrom(data: DataTransfer): PickedArt | null {
  const file = [...data.files].find((f) => f.type.startsWith('image/'));
  if (file) return tooBig(file) ? null : { file };
  const url = (data.getData('text/uri-list') || data.getData('text/plain') || '').split('\n')[0].trim();
  if (/^https?:\/\//i.test(url)) return { url };
  const html = data.getData('text/html');
  const src = /<img[^>]+src="(https?:[^"]+)"/i.exec(html)?.[1];
  return src ? { url: src } : null;
}

export interface CoverBoxProps {
  /** The cover now (an address), or null for none. */
  src: string | null;
  /** Width, height and bytes of the cover now, when known. */
  info?: { w: number; h: number; bytes?: number } | null;
  onPick(art: PickedArt): void;
  onRemove?(): void;
  /** What to search online for ("artist album"). */
  search: string;
  /** A queue song whose download folder may have pictures. */
  folderTid?: string;
  size?: number;
  label?: string;
  children?: ReactNode;
  round?: boolean;
}

export function CoverBox({ src, info, onPick, onRemove, search, folderTid, size = 148, label = 'Cover', children }: CoverBoxProps) {
  const [over, setOver] = useState(false);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  const menu = (e: React.MouseEvent) => {
    const items: MenuItem[] = [
      { label: 'Search Online', icon: Search, run: () => searchArt(search, onPick) },
      ...(folderTid ? [{ label: 'From the Download Folder', icon: ImagePlus, run: () => folderArt(folderTid, onPick) }] : []),
      {
        label: 'Choose a File',
        icon: ImagePlus,
        run: () =>
          void pickFile().then((f) => {
            if (f && !tooBig(f)) onPick({ file: f });
          }),
      },
      ...(onRemove && src ? [{ label: 'Remove Cover', icon: Trash2, divider: true, run: onRemove }] : []),
    ];
    openMenu(e, items, label);
  };

  const small = info && info.w > 0 && Math.min(info.w, info.h) < 600;
  return (
    <div className="tg-cover-wrap" style={{ width: size }}>
      <button
        type="button"
        className={`tg-cover${over ? ' over' : ''}`}
        style={{ width: size, height: size }}
        aria-label={`${label}: drop or paste a picture, or click for more`}
        title="Drop or paste a picture here, or click for more"
        onClick={menu}
        onContextMenu={menu}
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setOver(false);
          const art = pictureFrom(e.dataTransfer);
          if (art) onPick(art);
          else toast('That isn’t a picture');
        }}
        onPaste={(e: ClipboardEvent) => {
          const art = pictureFrom(e.clipboardData);
          if (art) {
            e.preventDefault();
            onPick(art);
          }
        }}>
        {src && !broken ? <img src={src} alt="" draggable={false} onError={() => setBroken(true)} /> : <ImagePlus size={Math.round(size / 5)} />}
        <span className="tg-cover-hint">
          <ImagePlus size={20} />
        </span>
        {children}
      </button>
      {info && info.w > 0 ? (
        <span className={`tg-cover-size${small ? ' low' : ''}`} title={small ? 'Smaller than 600 px: look for a bigger one' : undefined}>
          {info.w}×{info.h}
          {info.bytes ? ` · ${Math.round(info.bytes / 1024)} KB` : ''}
        </span>
      ) : null}
    </div>
  );
}

// ---- Search online (iTunes and Deezer, through MRQ) ----

export function searchArt(initial: string, onPick: (art: PickedArt) => void) {
  showDialog(<ArtSearch initial={initial} onPick={onPick} />);
}

function ArtSearch({ initial, onPick }: { initial: string; onPick(art: PickedArt): void }) {
  const [term, setTerm] = useState(initial);
  const [results, setResults] = useState<(ArtResult & { w?: number; h?: number })[] | null>(null);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const run = (t: string) => {
    setResults(null);
    setError('');
    setChosen(null);
    artSearch(t)
      .then((r) => setResults(r))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'MRQ didn’t answer'));
  };
  useEffect(() => run(initial), [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = results?.find((r) => r.full === chosen);
  return (
    <div className="tg-artsearch">
      <h2 className="dialog-title">Find a Cover</h2>
      <form
        className="row-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (term.trim()) run(term.trim());
        }}>
        <input className="field" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search" spellCheck={false} autoFocus />
        <button className="secondary">Search</button>
      </form>
      <div className="tg-art-grid" role="listbox" aria-label="Covers found">
        {error ? <p className="error">{error}</p> : null}
        {results === null && !error
          ? Array.from({ length: 8 }, (_, i) => <span key={i} className="tg-art-tile skel" />)
          : results?.map((r) => (
              <button
                key={r.full}
                role="option"
                aria-selected={chosen === r.full}
                className={`tg-art-tile${chosen === r.full ? ' on' : ''}`}
                title={r.label}
                onClick={() => setChosen(r.full)}
                onDoubleClick={() => {
                  closeDialog();
                  onPick({ url: r.full });
                }}>
                <img src={r.thumb} alt="" loading="lazy" draggable={false} onLoad={(e) => setResults((rs) => rs?.map((x) => (x.full === r.full ? { ...x, w: e.currentTarget.naturalWidth } : x)) ?? rs)} />
                <span className="tg-art-label">{r.label.replace(/ · (iTunes|Deezer)$/, '')}</span>
                <span className="tg-art-src">{/Deezer$/.test(r.label) ? 'Deezer' : 'iTunes'}</span>
                {chosen === r.full ? (
                  <span className="tg-art-check">
                    <Check size={16} />
                  </span>
                ) : null}
              </button>
            ))}
        {results?.length === 0 ? <p className="muted">Nothing found. Try fewer words.</p> : null}
      </div>
      <div className="dialog-actions">
        <button type="button" className="secondary" onClick={closeDialog}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={!pick}
          onClick={() => {
            if (!pick) return;
            closeDialog();
            onPick({ url: pick.full });
          }}>
          Use This Cover
        </button>
      </div>
    </div>
  );
}

// ---- Pictures that came in the download's folder ----

function folderArt(tid: string, onPick: (art: PickedArt) => void) {
  showDialog(<FolderArt tid={tid} onPick={onPick} />);
}

function FolderArt({ tid, onPick }: { tid: string; onPick(art: PickedArt): void }) {
  const [list, setList] = useState<{ name: string; size: number }[] | null>(null);
  useEffect(() => {
    folderImages(tid)
      .then((r) => setList(r.images))
      .catch(() => setList([]));
  }, [tid]);
  return (
    <div className="tg-artsearch">
      <h2 className="dialog-title">Pictures in the Download Folder</h2>
      <div className="tg-art-grid">
        {list === null
          ? Array.from({ length: 4 }, (_, i) => <span key={i} className="tg-art-tile skel" />)
          : list.map((img) => (
              <button
                key={img.name}
                className="tg-art-tile"
                title={img.name}
                onClick={() => {
                  closeDialog();
                  onPick({ folder: img.name });
                }}>
                <img src={folderImageUrl(tid, img.name)} alt="" loading="lazy" draggable={false} />
                <span className="tg-art-label">{img.name}</span>
                <span className="tg-art-src">{Math.round(img.size / 1024)} KB</span>
              </button>
            ))}
        {list?.length === 0 ? <p className="muted">No pictures came with this download.</p> : null}
      </div>
      <div className="dialog-actions">
        <button type="button" className="secondary" onClick={closeDialog}>
          Close
        </button>
      </div>
    </div>
  );
}
