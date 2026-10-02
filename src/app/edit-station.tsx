import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { refreshPlayingStation } from '@/player/store';
import { deleteStationImage, pickStationImage, stationImagesSupported, stationImageUri } from '@/radio/stationImage';
import { stationWebsite, useStations, type Station } from '@/radio/stations';
import { showToast } from '@/ui/overlays';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/** A website as typed ("walt.fm") as a full address, or null if it isn't one. */
function normalizeWebsite(input: string): string | null {
  const raw = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const url = new URL(raw);
    return url.hostname.includes('.') || url.hostname === 'localhost' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Edit a station: its name, your picture for it and its website. The stream stays as added. */
export default function EditStationScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const station = useStations((s) => s.stations.find((x) => x.id === id));
  const [name, setName] = useState(station?.name ?? '');
  const [website, setWebsite] = useState(station?.website ?? '');
  // The picture: unchanged, a new one picked (its file name), or removed (null).
  const [image, setImage] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const saved = useRef(false);
  // The picture picked here and not saved yet: thrown away if you cancel or pick another.
  const picked = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (!saved.current) deleteStationImage(picked.current ?? undefined);
    },
    [],
  );

  if (!station) return null;
  const shown = image === undefined ? station.image : (image ?? undefined);
  const uri = stationImageUri(shown);

  const choose = (file: string | null) => {
    deleteStationImage(picked.current ?? undefined);
    picked.current = file;
    setImage(file);
  };

  const pick = async () => {
    try {
      const file = await pickStationImage(station.id);
      if (file) choose(file);
    } catch {
      showToast('Couldn’t use that picture');
    }
  };

  const save = () => {
    const site = website.trim() ? normalizeWebsite(website.trim()) : '';
    if (site === null) {
      setError('That website doesn’t look like an address.');
      return;
    }
    const patch: Partial<Station> = {
      name: name.trim() || station.name,
      website: site || undefined,
    };
    if (image !== undefined) {
      patch.image = image ?? undefined;
      deleteStationImage(station.image);
    }
    useStations.getState().update(station.id, patch);
    refreshPlayingStation({ ...station, ...patch });
    saved.current = true;
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top + t.space.sm }}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Cancel">
          <T style={{ fontFamily: t.fonts.medium, fontSize: t.size(15) }}>Cancel</T>
        </Pressable>
        <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>Edit station</T>
        <Pressable hitSlop={12} onPress={save} accessibilityLabel="Save">
          <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(15), color: t.colors.accent }}>Save</T>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: t.space.lg, paddingBottom: insets.bottom + t.space.xl }}>
        <View style={{ alignItems: 'center' }}>
          <Pressable onPress={stationImagesSupported ? () => void pick() : undefined} accessibilityLabel="Change picture">
            {uri ? (
              <Image source={{ uri }} style={styles.art} contentFit="cover" transition={150} />
            ) : (
              <View style={[styles.art, { backgroundColor: t.colors.surface2, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="radio" size={64} color={t.colors.accent} />
              </View>
            )}
          </Pressable>
          {stationImagesSupported ? (
            <View style={{ flexDirection: 'row', gap: t.space.lg, marginTop: t.space.md }}>
              <Pressable hitSlop={8} onPress={() => void pick()}>
                <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(14), color: t.colors.accent }}>
                  {uri ? 'Change picture' : 'Choose picture'}
                </T>
              </Pressable>
              {uri ? (
                <Pressable hitSlop={8} onPress={() => choose(null)}>
                  <T style={{ fontFamily: t.fonts.semibold, fontSize: t.size(14), color: t.colors.textSecondary }}>Remove</T>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {station.apiBase ? (
            <T variant="caption" style={{ marginTop: t.space.sm, textAlign: 'center', color: t.colors.textMuted }}>
              While a song is on air, its cover shows instead.
            </T>
          ) : null}
        </View>

        <T variant="label" style={styles.label}>
          Name
        </T>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={station.name}
          placeholderTextColor={t.colors.textMuted}
          returnKeyType="done"
          keyboardAppearance="dark"
          selectionColor={t.colors.accent}
          style={styles.input}
        />

        <T variant="label" style={styles.label}>
          Website
        </T>
        <TextInput
          value={website}
          onChangeText={(v) => {
            setWebsite(v);
            setError(null);
          }}
          onSubmitEditing={save}
          placeholder={stationWebsite({ ...station, website: undefined }) ?? 'https://radio.example.com'}
          placeholderTextColor={t.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          keyboardAppearance="dark"
          selectionColor={t.colors.accent}
          style={styles.input}
        />
        {error ? (
          <T variant="caption" color={t.colors.danger} style={{ marginTop: t.space.sm }}>
            {error}
          </T>
        ) : (
          <T variant="caption" style={{ marginTop: t.space.sm, color: t.colors.textMuted }}>
            Long-press the station and pick Open website to go there.
          </T>
        )}

        <T variant="label" style={styles.label}>
          Stream
        </T>
        <T variant="caption" selectable numberOfLines={2}>
          {station.streamUrl}
        </T>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingHorizontal: t.space.lg,
  },
  art: { width: 160, height: 160, borderRadius: t.radius.art },
  label: { marginTop: t.space.xl, marginBottom: t.space.sm, color: t.colors.textSecondary },
  input: {
    height: 48,
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface2,
    color: t.colors.text,
    fontFamily: t.fonts.medium,
    fontSize: t.size(15),
  },
}));
