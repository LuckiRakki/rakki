// What a page shows when it has nothing to show yet: loading (only after a moment, and saying
// what), empty (why, and the one thing that fills it), failed (what happened, Try again), and
// the bar along the top while the server can't be reached. What was already on screen stays.
import { useEffect, useState, type ReactNode } from 'react';

import { probe, useServerReachable } from '@/lib/online';
import { useAuth } from '~/auth/session';
import { queryClient } from '~/queries';
import { Alert, Offline, Refresh, type Icon } from '~/ui/icons';

/** "Loading your albums", after 300 ms (a quick answer never flashes a spinner). */
export function Loading({ what }: { what: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShown(true), 300);
    return () => clearTimeout(id);
  }, []);
  if (!shown) return null;
  return (
    <div className="state loading" role="status">
      <div className="spin" />
      <span>Loading {what}</span>
    </div>
  );
}

/** Nothing here: why, and the one action that fills it. */
export function Empty({ icon: I, title, detail, action }: { icon: Icon; title: string; detail?: string; action?: { label: string; run(): void } }) {
  return (
    <div className="state empty">
      <I size={40} />
      <h2>{title}</h2>
      {detail ? <p>{detail}</p> : null}
      {action ? (
        <button className="secondary small" onClick={action.run}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

/** A page that couldn't load: what happened and Try again. */
export function LoadError({ what, error, retry }: { what: string; error: unknown; retry(): void }) {
  const reachable = useServerReachable((s) => s.reachable);
  const why = !reachable ? 'The server isn’t answering.' : error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div className="state failed" role="alert">
      <Alert size={40} />
      <h2>Couldn’t load {what}</h2>
      <p>{why}</p>
      <button className="secondary small" onClick={retry}>
        <Refresh size={16} />
        Try Again
      </button>
    </div>
  );
}

/**
 * The query's state as a page section: loading, failed, or empty (when `isEmpty`), else null so
 * the page draws its content. A refresh keeps the old content on screen.
 */
export function QueryState({
  q,
  what,
  empty,
}: {
  q: { isLoading: boolean; isError: boolean; error: unknown; data?: unknown; refetch(): unknown };
  what: string;
  empty?: ReactNode;
}) {
  if (q.data !== undefined) {
    const list = Array.isArray(q.data) ? q.data : null;
    return list && !list.length && empty ? <>{empty}</> : null;
  }
  if (q.isError) return <LoadError what={what} error={q.error} retry={() => void q.refetch()} />;
  if (q.isLoading) return <Loading what={what} />;
  return null;
}

/** Along the top of the page while the server can't be reached; Rakki keeps asking. */
export function ServerBar() {
  const reachable = useServerReachable((s) => s.reachable);
  const name = useAuth((s) => s.session?.serverName);
  if (reachable) return null;
  return (
    <div className="server-bar" role="status">
      <Offline size={18} />
      <span>
        Can’t reach {name ?? 'your server'}. What’s already loaded stays here, and Rakki keeps trying.
      </span>
      <button className="text-btn" onClick={() => void probe()}>
        Try Again
      </button>
    </div>
  );
}

/** When the server answers again, whatever failed loads again. */
export function refetchFailed() {
  void queryClient.refetchQueries({ type: 'active', predicate: (q) => q.state.status === 'error' });
}

export type { Icon };
