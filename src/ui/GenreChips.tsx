import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { openGenre } from '@/ui/nav';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

const FIRST = 3;

/** A few genre pills (tap → genre page), then "+N more" to show the rest. */
export function GenreChips({ genres }: { genres: string[] }) {
  const t = useTheme();
  const [all, setAll] = useState(false);
  if (!genres.length) return null;
  const shown = all ? genres : genres.slice(0, FIRST);
  const hidden = genres.length - shown.length;
  const pill = {
    paddingHorizontal: t.space.md,
    height: 28,
    justifyContent: 'center' as const,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surface2,
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, marginTop: t.space.md }}>
      {shown.map((g) => (
        <Pressable key={g} onPress={() => openGenre(g)} style={({ pressed }) => [pill, pressed && { backgroundColor: t.colors.surface3 }]}>
          <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(12), color: t.colors.text }}>{g}</T>
        </Pressable>
      ))}
      {hidden > 0 ? (
        <Pressable onPress={() => setAll(true)} style={({ pressed }) => [pill, { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.colors.border }, pressed && { opacity: 0.7 }]}>
          <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(12), color: t.colors.textSecondary }}>+{hidden} more</T>
        </Pressable>
      ) : all && genres.length > FIRST ? (
        <Pressable onPress={() => setAll(false)} style={({ pressed }) => [pill, { backgroundColor: 'transparent' }, pressed && { opacity: 0.7 }]}>
          <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(12), color: t.colors.textSecondary }}>Show less</T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** An artist's genres: its own tags first, then its albums' genres, most common first. */
export function artistGenres(own: string[] | undefined, albums: { Genres?: string[] }[] | undefined): string[] {
  const counts = new Map<string, number>();
  for (const a of albums ?? []) for (const g of a.Genres ?? []) counts.set(g, (counts.get(g) ?? 0) + 1);
  const fromAlbums = [...counts].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  return [...new Set([...(own ?? []), ...fromAlbums])];
}
