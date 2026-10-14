// Your Jellyfin profile picture, or your initial on the accent colour if you haven't set one
// (the phone's UserAvatar).
import { useState } from 'react';

import { useAuth } from '~/auth/session';
import { useMe } from '~/queries';

export function Avatar({ size, big }: { size: number; big?: boolean }) {
  const client = useAuth((s) => s.client);
  const name = useAuth((s) => s.session?.userName ?? '');
  const me = useMe().data;
  const [failed, setFailed] = useState(false);
  const src = me && client ? client.userImageUrl(me, size * 2) : undefined;
  return (
    <span className={`avatar-face${big ? ' big' : ''}`}>
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : null}
      <span>{name.slice(0, 1).toUpperCase()}</span>
    </span>
  );
}
