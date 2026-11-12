// Settings, one group at a time (the list on the left, with a search): account, look, lyrics,
// the visualizer, playback, keyboard shortcuts, connections (Last.fm, Discord, MRQ), History and
// Stats, and about. Each group is its own file in settings/groups and shows the everyday choices;
// the rest folds away under More Options (settings/rows.tsx). Playback, lyrics and Last.fm are the
// phone app's settings (shared store), so they behave the same.
import { useEffect, useState, type ReactNode } from 'react';

import { useNav } from '~/nav';
import { Globe, Info, Keyboard, MicVocal, Palette, Play, Search as SearchIcon, Stats as StatsIcon, User, Visualizer as VisualizerIcon, type Icon } from '~/ui/icons';
import { Account } from '~/settings/groups/Account';
import { Look } from '~/settings/groups/Look';
import { Lyrics } from '~/settings/groups/Lyrics';
import { VisualizerSettings } from '~/settings/groups/Visualizer';
import { Playback } from '~/settings/groups/Playback';
import { Shortcuts } from '~/settings/groups/Shortcuts';
import { DiscordCard, LastfmCard, MrqCard } from '~/settings/groups/Connections';
import { HistoryGroup } from '~/settings/groups/History';
import { About } from '~/settings/groups/About';

const GROUPS: { id: string; label: string; icon: Icon; keywords: string; view: () => ReactNode }[] = [
  { id: 'account', label: 'Account', icon: User, keywords: 'sign out server user', view: () => <Account /> },
  { id: 'look', label: 'Look', icon: Palette, keywords: 'glass frost clear tint pause theme colour color accent lucid size font typeface corners spacing motion background', view: () => <Look /> },
  { id: 'lyrics', label: 'Lyrics', icon: MicVocal, keywords: 'spicy size karaoke', view: () => <Lyrics /> },
  { id: 'visualizer', label: 'Visualizer', icon: VisualizerIcon, keywords: 'line bars feishin', view: () => <VisualizerSettings /> },
  { id: 'playback', label: 'Playback', icon: Play, keywords: 'quality streaming equalizer eq volume startup crossfade', view: () => <Playback /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard, keywords: 'keys keyboard hotkeys', view: () => <Shortcuts /> },
  {
    id: 'connections',
    label: 'Connections',
    icon: Globe,
    keywords: 'last.fm lastfm discord mrq spotify',
    view: () => (
      <>
        <LastfmCard />
        <DiscordCard />
        <MrqCard />
      </>
    ),
  },
  { id: 'history', label: 'History and Stats', icon: StatsIcon, keywords: 'plays listening top artists', view: () => <HistoryGroup /> },
  { id: 'about', label: 'About', icon: Info, keywords: 'version update data folder', view: () => <About /> },
];

export function Settings() {
  const route = useNav((s) => s.route);
  const asked = route.name === 'settings' ? route.section : undefined;
  const [group, setGroup] = useState(asked && GROUPS.some((g) => g.id === asked) ? asked : 'account');
  // Opened at a group from elsewhere (the full player's visualizer settings button).
  useEffect(() => {
    if (asked && GROUPS.some((g) => g.id === asked)) setGroup(asked);
  }, [asked, route]);
  const current = GROUPS.find((g) => g.id === group) ?? GROUPS[0];
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? GROUPS.filter((g) => `${g.label} ${g.keywords}`.toLowerCase().includes(q)) : GROUPS;
  return (
    <div className="page settings">
      <h1>Settings</h1>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings Groups">
          <label className="settings-search">
            <SearchIcon size={16} />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                const t = e.target.value.trim().toLowerCase();
                const first = t ? GROUPS.find((g) => `${g.label} ${g.keywords}`.toLowerCase().includes(t)) : undefined;
                if (first) setGroup(first.id);
              }}
              placeholder="Search Settings"
              aria-label="Search Settings"
            />
          </label>
          {shown.map((g) => (
            <button key={g.id} className={g.id === group ? 'on' : ''} aria-current={g.id === group ? 'page' : undefined} onClick={() => setGroup(g.id)}>
              <g.icon size={18} />
              {g.label}
            </button>
          ))}
          {q && shown.length === 0 ? <p className="muted small">No settings match.</p> : null}
        </nav>
        <div key={current.id} className="settings-body">
          {current.view()}
        </div>
      </div>
    </div>
  );
}
