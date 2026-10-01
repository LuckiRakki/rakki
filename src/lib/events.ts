// Small app-wide signals between modules that can't import each other (would be circular).

type Listener = () => void;
const likedListeners = new Set<Listener>();

/** Someone liked or unliked a song (downloaded Liked Songs follow along). */
export function emitLikedChanged() {
  for (const fn of likedListeners) fn();
}

export function onLikedChanged(fn: Listener): () => void {
  likedListeners.add(fn);
  return () => likedListeners.delete(fn);
}
