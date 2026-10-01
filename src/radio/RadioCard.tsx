import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { useMe } from '@/api/queries';
import { useOnAir, useRecentlyAired } from '@/radio/live';
import { useStations } from '@/radio/stations';
import { requestSong } from '@/radio/subwave';
import { showToast } from '@/ui/overlays';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/** "4 min ago". */
function ago(iso?: string): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : '';
}

/**
 * Under the player while a SUB/WAVE station plays: the show and its DJ, a song request to the
 * DJ, and what played before. Plain streams have none of this, so it renders nothing.
 */
export function RadioCard({ stationId }: { stationId: string }) {
  const t = useTheme();
  const styles = useStyles();
  const station = useStations((s) => s.stations.find((x) => x.id === stationId));
  const info = useOnAir((s) => s.byStation[stationId]);
  const aired = useRecentlyAired(station);
  const me = useMe();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  if (!station?.apiBase) return null;
  const apiBase = station.apiBase;

  const send = async () => {
    const ask = text.trim();
    if (!ask || sending) return;
    setSending(true);
    try {
      const r = await requestSong(apiBase, ask, me.data?.Name);
      showToast(r.ok ? (r.message ?? 'Request sent to the DJ') : (r.message ?? 'The station didn’t take that request'));
      if (r.ok) setText('');
    } catch {
      showToast('Couldn’t reach the station');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.card}>
      {info?.show || info?.dj ? (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {info.djAvatarUrl ? <Image source={{ uri: info.djAvatarUrl }} style={styles.avatar} contentFit="cover" /> : null}
          <View style={{ flex: 1 }}>
            <T variant="label" color={t.colors.textSecondary} style={{ fontSize: t.size(10) }}>
              On air
            </T>
            <T variant="bodyStrong" numberOfLines={1}>
              {info.show ?? station.name}
            </T>
            {info.dj ? (
              <T variant="caption" numberOfLines={1}>
                with {info.dj}
              </T>
            ) : null}
          </View>
        </View>
      ) : null}

      <T variant="bodyStrong" style={{ marginTop: t.space.lg }}>
        Request a song
      </T>
      <View style={styles.requestRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => void send()}
          placeholder="A song, an artist, or a mood"
          placeholderTextColor={t.colors.textMuted}
          returnKeyType="send"
          keyboardAppearance="dark"
          selectionColor={t.colors.accent}
          style={styles.input}
        />
        <Pressable
          disabled={!text.trim() || sending}
          onPress={() => void send()}
          accessibilityLabel="Send request"
          style={[styles.send, !text.trim() && { opacity: 0.5 }]}>
          {sending ? <ActivityIndicator color="#000" /> : <Ionicons name="arrow-up" size={20} color="#000" />}
        </Pressable>
      </View>

      {aired.data?.length ? (
        <>
          <T variant="bodyStrong" style={{ marginTop: t.space.lg, marginBottom: t.space.xs }}>
            Recently on air
          </T>
          {aired.data.slice(0, 8).map((song, i) => (
            <View key={`${song.songId ?? song.title}-${i}`} style={styles.aired}>
              {song.coverUrl ? (
                <Image source={{ uri: song.coverUrl }} style={styles.cover} contentFit="cover" />
              ) : (
                <View style={[styles.cover, { backgroundColor: t.colors.surface3 }]} />
              )}
              <View style={{ flex: 1, marginHorizontal: t.space.md }}>
                <T variant="bodyStrong" numberOfLines={1} style={{ fontSize: t.size(14) }}>
                  {song.title}
                </T>
                <T variant="caption" numberOfLines={1}>
                  {song.artist}
                </T>
              </View>
              <T variant="caption" color={t.colors.textMuted} style={{ fontSize: t.size(11) }}>
                {ago(song.startedAt)}
              </T>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: t.radius.card, padding: t.space.lg, marginTop: t.space.lg },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: t.space.md },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, marginTop: t.space.sm },
  input: {
    flex: 1,
    height: 42,
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: t.colors.text,
    fontFamily: t.fonts.medium,
    fontSize: t.size(14),
  },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: t.colors.text, alignItems: 'center', justifyContent: 'center' },
  aired: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  cover: { width: 40, height: 40, borderRadius: t.radius.art },
}));
