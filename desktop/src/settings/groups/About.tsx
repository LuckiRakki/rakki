// Settings → About: version, updates and the data folder.
import { revealItemInDir } from '@tauri-apps/plugin-opener';

import { dataFolder } from '~/lib/kv';
import { installUpdate, useUpdate } from '~/lib/updateCheck';
import { toast } from '~/ui/overlays';
import pkg from '../../../package.json';
import { Card, Row } from '~/settings/rows';

export function About() {
  const update = useUpdate((u) => u.version);
  return (
    <Card>
      <div className="setting">
        <div className="setting-text">
          <div className="setting-label">Rakki for desktop {pkg.version}</div>
          {update ? (
            <div className="setting-detail">
              Rakki {update} is out.{' '}
              <span className="linkish" role="button" tabIndex={0} onClick={() => void installUpdate()} onKeyDown={(e) => e.key === 'Enter' && void installUpdate()}>
                Update and restart
              </span>
            </div>
          ) : null}
          <div className="setting-detail">Jellyfin music, word by word. Music plays through mpv; closing the window keeps it playing in the tray.</div>
        </div>
      </div>
      <DataFolder />
    </Card>
  );
}

/** Where Rakki keeps its settings, lyric timings and drafts (lib/kv.ts). */
function DataFolder() {
  const folder = dataFolder();
  if (!folder) return null;
  const sep = folder.includes('\\') ? '\\' : '/';
  return (
    <Row label="Your Data" detail={`Settings, lyric timings and drafts, as files you can open: ${folder}.${sep === '\\' ? " Your sign-in stays in Windows' Credential Manager." : ''}`}>
      <button className="secondary small" onClick={() => void revealItemInDir(`${folder}${sep}settings.json`).catch(() => toast("Couldn't open the folder"))}>
        Show Folder
      </button>
    </Row>
  );
}
