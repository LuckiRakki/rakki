// Settings → Account: who is signed in, and Sign Out.
import { useAuth } from '~/auth/session';
import { LogOut } from '~/ui/icons';
import { Avatar } from '~/ui/Avatar';
import { Card } from '~/settings/rows';

export function Account() {
  const session = useAuth((s) => s.session);
  return (
    <Card>
      <div className="account">
        <Avatar size={56} big />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="setting-label">{session?.userName}</div>
          <div className="setting-detail">
            {session?.serverName} · {session?.serverUrl}
          </div>
        </div>
        <button className="secondary small" onClick={() => useAuth.getState().signOut()}>
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </Card>
  );
}
