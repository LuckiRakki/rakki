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

type PlaylistsListener = (playlistIds: string[] | null) => void;
const playlistListeners = new Set<PlaylistsListener>();

/** Rakki changed these playlists' songs (the playlist cache fetches them again). */
export function emitPlaylistsChanged(playlistIds: string[] | null) {
  for (const fn of playlistListeners) fn(playlistIds);
}

export function onPlaylistsChanged(fn: PlaylistsListener): () => void {
  playlistListeners.add(fn);
  return () => playlistListeners.delete(fn);
}
