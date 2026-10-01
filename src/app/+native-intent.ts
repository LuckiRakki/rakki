// Links from outside the app, which so far means the widgets: rakki://player, rakki://album/<id>,
// or plain rakki:// to just open the app. While the app is running they go through the same
// helpers as taps inside it, so the player or lyrics close first instead of the page opening
// underneath them.
import { goTo, openPlayer, setPendingLink } from '@/ui/nav';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  const route = '/' + path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/+|\/+$/g, '');

  if (route === '/') return initial ? '/' : '';

  if (route === '/player') {
    // A cold start has no queue yet: open Home, then the player once the queue is restored.
    if (initial) {
      setPendingLink(route);
      return '/';
    }
    openPlayer();
    return '';
  }

  if (/^\/album\/[^/]+$/.test(route)) {
    if (initial) return route;
    goTo(route);
    return '';
  }

  return path;
}
