// Settings → History and Stats.
import { go } from '~/nav';
import { Stats as StatsIcon } from '~/ui/icons';
import { Card } from '~/settings/rows';

export function HistoryGroup() {
  return (
    <Card>
      <div className="setting">
        <div className="setting-text">
          <div className="setting-label">History and Stats</div>
          <div className="setting-detail">
            Every song you play on any Rakki (and any other Jellyfin app) is kept by the Rakki plugin on your server, so your phone and this computer show the same history, listening time and top artists.
          </div>
        </div>
        <button className="secondary small" onClick={() => go({ name: 'stats' })}>
          <StatsIcon size={16} /> Open
        </button>
      </div>
    </Card>
  );
}
