import { Pressable, View } from 'react-native';

import type { BaseItem } from '@/api/jellyfin';
import { useItem } from '@/api/queries';
import { useLyrics } from '@/lyrics/fetch';
import { openArtist } from '@/ui/nav';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/**
 * Spotify's credits card under the full player: who performs the song (tap to open the artist)
 * and who wrote it. Writers come from the file's composer tags and, when they're missing, from
 * the songwriters in the song's TTML lyrics. Renders nothing when there's no one to list.
 */
export function CreditsCard({ track }: { track: BaseItem }) {
  const t = useTheme();
  const styles = useStyles();
  const full = useItem(track.Id).data;
  const lyrics = useLyrics(track.Id).data;

  const artists = (track.ArtistItems ?? []).filter((a) => a.Id);
  const performers = new Set(artists.map((a) => a.Name.toLowerCase()));
  const writers: { name: string; role: string }[] = [];
  const seen = new Set<string>();
  const addWriter = (name: string, role: string) => {
    const k = name.trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    writers.push({ name: name.trim(), role });
  };
  for (const p of full?.People ?? []) {
    if (p.Type === 'Composer' || p.Type === 'Lyricist' || p.Type === 'Writer') addWriter(p.Name, p.Type === 'Lyricist' ? 'Lyricist' : 'Composer');
  }
  for (const name of lyrics?.ttml?.songwriters ?? []) addWriter(name, 'Writer');

  if (!artists.length && !writers.length) return null;

  return (
    <View style={styles.card}>
      <T style={styles.title}>Credits</T>
      {artists.map((a, i) => (
        <Pressable key={a.Id} onPress={() => openArtist(a.Id)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
          <T variant="bodyStrong" numberOfLines={1}>
            {a.Name}
          </T>
          <T variant="caption">{i === 0 ? 'Main artist' : 'Featured artist'}</T>
        </Pressable>
      ))}
      {writers.slice(0, 8).map((w) => (
        <View key={w.name} style={styles.row}>
          <T variant="bodyStrong" numberOfLines={1}>
            {w.name}
          </T>
          <T variant="caption">{performers.has(w.name.toLowerCase()) ? `Artist, ${w.role.toLowerCase()}` : w.role}</T>
        </View>
      ))}
      {writers.length === 0 ? (
        <T variant="caption" style={{ marginTop: t.space.sm, fontSize: t.size(12) }}>
          No writers listed for this song.
        </T>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    marginTop: t.space.lg,
    padding: t.space.lg,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface2,
  },
  title: { fontFamily: t.fonts.bold, fontSize: t.size(16), color: t.colors.text, marginBottom: t.space.xs },
  row: { paddingVertical: t.space.sm },
}));
