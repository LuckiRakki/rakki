// Rakki Dev only: what the auto-pull (../../autopull.ts) did. Live updates and restarts pass as a
// toast; a change that needs Rakki Dev closed and reopened stays up until it is.
import { useEffect, useState } from 'react';

import { Refresh, X } from '~/ui/icons';
import { toast } from '~/ui/overlays';

/** As autopull.ts sends it. */
interface Notice {
  kind: 'updated' | 'restarting' | 'reopen' | 'warning';
  text: string;
}

export function DevNotice() {
  const [reopen, setReopen] = useState<string | null>(null);
  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const on = (n: Notice) => (n.kind === 'reopen' ? setReopen(n.text) : toast(n.text));
    hot.on('rakki:dev', on);
    return () => hot.off('rakki:dev', on);
  }, []);
  if (!reopen) return null;
  return (
    <div className="dev-notice" role="status">
      <Refresh size={16} />
      <span>{reopen}</span>
      <button className="navbtn" aria-label="Hide" title="Hide" onClick={() => setReopen(null)}>
        <X size={15} />
      </button>
    </div>
  );
}
