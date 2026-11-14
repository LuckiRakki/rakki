// The share sheet (2.2): the card Rakki will share (share/ShareCard.tsx) with a choice of
// background, then iOS's share sheet with it as a picture (Messages, Instagram, Save Image…), like
// Spotify. Share as Text still sends the plain line. Lives in the overlay layer (ui/OverlayHost).
import { ImageFormat, makeImageFromView } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, useWindowDimensions, View } from 'react-native';

import { tick } from '@/lib/haptics';
import { artistLine } from '@/lib/items';
import { hm } from '@/stats/format';
import { ShareCard, type ShareLook, type ShareTarget } from '@/share/ShareCard';
import { Ionicons } from '@/ui/Icon';
import { showToast, useOverlays } from '@/ui/overlays';
import { Segmented } from '@/ui/Segmented';
import { CLOSE_MS, SheetPanel } from '@/ui/Sheet';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/** The plain line for Share as Text. */
function shareText(target: ShareTarget): string {
  if (target.kind === 'stats') {
    const { stats, range } = target;
    const top = stats.TopArtists[0]?.Name;
    return `My listening, ${range}: ${hm(stats.Minutes)}, ${stats.Plays} plays${top ? `, top artist ${top}` : ''}.`;
  }
  const by = target.item.Type === 'MusicArtist' ? '' : artistLine(target.item);
  return by ? `${target.item.Name} by ${by}` : target.item.Name;
}

/** iOS's share sheet can't open over the overlay layer: let the sheet slide away first. */
const afterClose = (fn: () => void) => setTimeout(fn, CLOSE_MS + 150);

export function SharePanel() {
  const t = useTheme();
  const styles = useStyles();
  const { height } = useWindowDimensions();
  const target = useOverlays((s) => s.share);
  const close = () => useOverlays.getState().closeShare();
  const [look, setLook] = useState<ShareLook>('colour');
  const [busy, setBusy] = useState(false);
  const card = useRef<View>(null);
  // Story shaped, as big as the sheet allows.
  const cardH = Math.round(Math.min(height * 0.56, 520));
  const cardW = Math.round((cardH * 9) / 16);

  async function sharePicture(what: ShareTarget) {
    if (Platform.OS === 'web') return shareLine(what);
    setBusy(true);
    let uri: string | null = null;
    try {
      // The card as it shows, at the screen's resolution.
      const image = await makeImageFromView(card);
      if (!image) throw new Error('no picture');
      const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
      image.dispose();
      const file = new File(Paths.cache, 'Rakki Share.png');
      if (file.exists) file.delete();
      file.create();
      file.write(bytes);
      uri = file.uri;
    } catch {
      showToast('Couldn’t make the picture');
    }
    setBusy(false);
    if (!uri) return;
    close();
    const url = uri;
    afterClose(() => void Share.share({ url }).catch(() => {}));
  }

  function shareLine(what: ShareTarget) {
    close();
    afterClose(() => void Share.share({ message: shareText(what) }).catch(() => {}));
  }

  return (
    <SheetPanel visible={!!target} onClose={close} maxHeightRatio={0.94}>
      {target ? (
        <View style={styles.body}>
          {/* The rounded preview; the picture itself (inside) has square corners. */}
          <View style={[styles.preview, { width: cardW, height: cardH }]}>
            <View ref={card} collapsable={false}>
              <ShareCard target={target} look={look} width={cardW} height={cardH} />
            </View>
          </View>
          <View style={{ alignSelf: 'stretch', marginTop: t.space.lg }}>
            <Segmented
              value={look}
              onChange={(v) => {
                tick();
                setLook(v);
              }}
              options={[
                { value: 'colour', label: 'Colour' },
                { value: 'blur', label: 'Blurred' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </View>
          <View style={styles.buttons}>
            <Pressable
              disabled={busy}
              onPress={() => void sharePicture(target)}
              style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}
              accessibilityLabel="Share Picture">
              {busy ? <ActivityIndicator color={t.colors.onAccent} /> : <Ionicons name="share-outline" size={20} color={t.colors.onAccent} />}
              <T style={[styles.primaryText, { color: t.colors.onAccent }]}>Share Picture</T>
            </Pressable>
            <Pressable onPress={() => shareLine(target)} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]} accessibilityLabel="Share as Text">
              <T variant="bodyStrong">Share as Text</T>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SheetPanel>
  );
}

const useStyles = makeStyles((t) => ({
  body: { alignItems: 'center', paddingHorizontal: t.space.lg, paddingTop: t.space.sm, paddingBottom: t.space.sm },
  preview: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#0B0B0D' },
  buttons: { flexDirection: 'row', gap: t.space.sm, alignSelf: 'stretch', marginTop: t.space.lg },
  primary: {
    flex: 1.4,
    height: 50,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.sm,
  },
  primaryText: { fontFamily: t.fonts.bold, fontSize: t.size(15) },
  secondary: {
    flex: 1,
    height: 50,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
