// The picture Rakki shares (2.2), like Spotify's share cards: a song, album, playlist or artist with
// its cover big on the album's colour, or your History and Stats as a summary. Story shaped (9:16),
// drawn with ordinary views so the share sheet can photograph it (share/SharePanel.tsx).
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import type { BaseItem, RakkiStats, RakkiTop } from '@/api/jellyfin';
import { useAuth } from '@/auth/store';
import { blurhashAverage } from '@/lib/blurhash';
import { mix, tileColor } from '@/lib/color';
import { artistLine } from '@/lib/items';
import { hm } from '@/stats/format';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

/** What's shared: something from the library, or your stats for a range ("7 Days"). */
export type ShareTarget = { kind: 'item'; item: BaseItem } | { kind: 'stats'; stats: RakkiStats; range: string };

/** The card's background: the album's colour, the cover blurred, or Rakki's ink. */
export type ShareLook = 'colour' | 'blur' | 'dark';

const KIND: Record<string, string> = { Audio: 'Song', MusicAlbum: 'Album', Playlist: 'Playlist', MusicArtist: 'Artist' };
const INK = '#0B0B0D';

/** The card at `width` × `height` (9:16). */
export function ShareCard({ target, look, width, height }: { target: ShareTarget; look: ShareLook; width: number; height: number }) {
  const t = useTheme();
  const client = useAuth((s) => s.client);
  const item = target.kind === 'item' ? target.item : null;
  const top = target.kind === 'stats' ? target.stats.TopAlbums[0] : undefined;
  // The colour: the item's own (from its blurhash), or for stats the accent.
  const colour = item ? tileColor(blurhashAverage(client?.blurhash(item)), item.Id) : t.colors.accent;
  const cover = item ? client?.imageUrl(item, 800) : top?.Id ? client?.primaryImageUrl(top.Id, 800) : undefined;
  const s = width / 300; // everything scales with the card
  // Stats on the Colour look sit on the accent itself, where the accent dot would vanish.
  const dot = look === 'colour' && target.kind === 'stats' ? INK : t.colors.accent;

  return (
    <View style={{ width, height, backgroundColor: INK, overflow: 'hidden' }}>
      <Background look={look} colour={colour} cover={cover} />
      {item ? <ItemFace item={item} cover={cover} s={s} width={width} dot={dot} /> : null}
      {target.kind === 'stats' ? <StatsFace stats={target.stats} range={target.range} s={s} dot={dot} /> : null}
    </View>
  );
}

function Background({ look, colour, cover }: { look: ShareLook; colour: string; cover?: string }) {
  if (look === 'blur' && cover) {
    return (
      <>
        <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={50} cachePolicy="memory-disk" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
      </>
    );
  }
  if (look === 'dark') {
    return <LinearGradient colors={[mix(colour, INK, 0.55), INK, INK]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />;
  }
  return <LinearGradient colors={[mix(colour, '#ffffff', 0.12), colour, mix(colour, INK, 0.55)]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />;
}

/** "Rakki." as on the sign-in screen, its dot in `dot`. */
function Wordmark({ s, dot }: { s: number; dot: string }) {
  const t = useTheme();
  return (
    <T style={{ fontFamily: t.fonts.black, fontSize: 17 * s, letterSpacing: -0.5 * s, color: '#fff' }}>
      Rakki<T style={{ fontFamily: t.fonts.black, fontSize: 17 * s, color: dot }}>.</T>
    </T>
  );
}

function ItemFace({ item, cover, s, width, dot }: { item: BaseItem; cover?: string; s: number; width: number; dot: string }) {
  const t = useTheme();
  const art = width * 0.74;
  const round = item.Type === 'MusicArtist';
  const by = item.Type === 'MusicArtist' ? null : artistLine(item);
  const kind = [KIND[item.Type], item.Type === 'MusicAlbum' ? item.ProductionYear : null].filter(Boolean).join(' · ');
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 * s }}>
      <View
        style={{
          width: art,
          height: art,
          borderRadius: round ? art / 2 : 10 * s,
          overflow: 'hidden',
          backgroundColor: 'rgba(255,255,255,0.08)',
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 16 * s,
          shadowOffset: { width: 0, height: 8 * s },
        }}>
        {cover ? <Image source={{ uri: cover }} style={{ width: art, height: art }} contentFit="cover" cachePolicy="memory-disk" /> : null}
      </View>
      <T numberOfLines={2} style={{ marginTop: 20 * s, fontFamily: t.fonts.black, fontSize: 24 * s, lineHeight: 28 * s, letterSpacing: -0.4 * s, color: '#fff', textAlign: 'center' }}>
        {item.Name}
      </T>
      {by ? (
        <T numberOfLines={1} style={{ marginTop: 4 * s, fontFamily: t.fonts.semibold, fontSize: 15 * s, color: 'rgba(255,255,255,0.82)', textAlign: 'center' }}>
          {by}
        </T>
      ) : null}
      {kind ? (
        <T style={{ marginTop: 6 * s, fontFamily: t.fonts.semibold, fontSize: 11 * s, letterSpacing: 1.2 * s, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>
          {kind}
        </T>
      ) : null}
      <View style={{ position: 'absolute', bottom: 18 * s }}>
        <Wordmark s={s} dot={dot} />
      </View>
    </View>
  );
}

function StatsFace({ stats, range, s, dot }: { stats: RakkiStats; range: string; s: number; dot: string }) {
  const t = useTheme();
  const client = useAuth((st) => st.client);
  const topArtist = stats.TopArtists[0];
  const photo = topArtist?.Id && client ? client.primaryImageUrl(topArtist.Id, 600) : undefined;
  const photoSize = 148 * s;
  const label = { fontFamily: t.fonts.bold, fontSize: 10.5 * s, letterSpacing: 1.1 * s, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' as const };
  return (
    <View style={{ flex: 1, padding: 22 * s }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark s={s} dot={dot} />
        <T style={label}>{range}</T>
      </View>
      <View style={{ alignItems: 'center', marginTop: 18 * s }}>
        <View style={{ width: photoSize, height: photoSize, borderRadius: photoSize / 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.1)' }}>
          {photo ? <Image source={{ uri: photo }} style={{ width: photoSize, height: photoSize }} contentFit="cover" cachePolicy="memory-disk" /> : null}
        </View>
        {topArtist ? (
          <>
            <T style={[label, { marginTop: 12 * s }]}>Top Artist</T>
            <T numberOfLines={1} style={{ fontFamily: t.fonts.black, fontSize: 22 * s, color: '#fff', marginTop: 2 * s }}>
              {topArtist.Name}
            </T>
          </>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 14 * s, marginTop: 18 * s }}>
        <TopColumn title="Top Artists" items={stats.TopArtists} s={s} />
        <TopColumn title="Top Songs" items={stats.TopSongs} s={s} />
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', gap: 14 * s }}>
        <View style={{ flex: 1 }}>
          <T style={label}>Listening Time</T>
          <T numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: t.fonts.black, fontSize: 24 * s, color: '#fff', marginTop: 2 * s }}>
            {hm(stats.Minutes)}
          </T>
        </View>
        <View style={{ flex: 1 }}>
          <T style={label}>Plays</T>
          <T numberOfLines={1} style={{ fontFamily: t.fonts.black, fontSize: 24 * s, color: '#fff', marginTop: 2 * s }}>
            {stats.Plays.toLocaleString()}
          </T>
        </View>
      </View>
    </View>
  );
}

function TopColumn({ title, items, s }: { title: string; items: RakkiTop[]; s: number }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <T style={{ fontFamily: t.fonts.bold, fontSize: 10.5 * s, letterSpacing: 1.1 * s, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', marginBottom: 6 * s }}>
        {title}
      </T>
      {items.slice(0, 5).map((x, i) => (
        <View key={`${x.Id ?? x.Name}-${i}`} style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 * s }}>
          <T style={{ width: 14 * s, fontFamily: t.fonts.bold, fontSize: 13 * s, color: 'rgba(255,255,255,0.6)' }}>{i + 1}</T>
          <T numberOfLines={1} style={{ flex: 1, fontFamily: t.fonts.bold, fontSize: 13.5 * s, color: '#fff' }}>
            {x.Name}
          </T>
        </View>
      ))}
    </View>
  );
}
