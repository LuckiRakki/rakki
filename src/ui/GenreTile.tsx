import { Pressable, View } from 'react-native';

import type { GenreCount } from '@/api/jellyfin';
import { blurhashAverage } from '@/lib/blurhash';
import { tileColor } from '@/lib/color';
import { useAuth } from '@/auth/store';
import { Artwork } from '@/ui/Artwork';
import { openGenre } from '@/ui/nav';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

/** A genre's colour: its cover album's hue, or one picked from its name. */
export function useGenreColor(genre: GenreCount | undefined, name: string): string {
  const client = useAuth((s) => s.client);
  const hash = genre?.album && client?.blurhash(genre.album);
  return tileColor(blurhashAverage(hash), name);
}

/** Spotify's "Browse all" tile: colour, name, and the cover album tilted in the corner. */
export function GenreTile({
  genre,
  width,
  height,
  onPress,
}: {
  genre: GenreCount;
  width: number;
  height: number;
  onPress?: () => void;
}) {
  const t = useTheme();
  const color = useGenreColor(genre, genre.name);
  const art = Math.round(height * 0.62);
  return (
    <Pressable
      onPress={onPress ?? (() => openGenre(genre.name))}
      style={({ pressed }) => ({
        width,
        height,
        borderRadius: t.radius.card,
        backgroundColor: color,
        overflow: 'hidden',
        opacity: pressed ? 0.8 : 1,
      })}>
      <T
        numberOfLines={2}
        style={{
          margin: t.space.md,
          marginRight: art * 0.55,
          fontFamily: t.fonts.bold,
          fontSize: t.size(16),
          color: '#fff',
        }}>
        {genre.name}
      </T>
      {genre.album ? (
        <View
          style={{
            position: 'absolute',
            right: -art * 0.18,
            bottom: -art * 0.08,
            transform: [{ rotate: '25deg' }],
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
          }}>
          <Artwork item={genre.album} size={art} rounded={4} />
        </View>
      ) : null}
    </Pressable>
  );
}
