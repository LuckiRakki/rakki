// Shared by the player screen's parts: their styles, and a button press with a tap of haptics.
import { tick } from '@/lib/haptics';
import { makeStyles } from '@/ui/theme';

/** A button's press, with a light tap of haptics first. */
export function tap(fn: () => void) {
  return () => {
    tick();
    fn();
  };
}

/**
 * The top padding inside the player's sheet. iOS still reports the status bar's height there,
 * though the sheet starts below it, so adding it pushed the "Playing from" line down onto the
 * cover. On a notched phone the sheet's own top is enough; `gap` is the space under it.
 */
export function sheetTop(insetTop: number, gap: number) {
  return insetTop > 20 ? gap : insetTop + gap;
}

export const usePlayerStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', height: 44 },
  artShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 24 },
  },
  sheet: { marginHorizontal: 12 - t.space.xl, marginTop: 20, paddingTop: 18, paddingHorizontal: 12, paddingBottom: 6, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  title: { fontFamily: t.fonts.black, fontSize: t.size(26), letterSpacing: -0.3 },
  artist: { fontFamily: t.fonts.semibold, fontSize: t.size(17), color: t.colors.accentText, marginTop: 3 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side44: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    bottom: 2,
    alignSelf: 'center',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.colors.accent,
  },
  repeatOne: {
    position: 'absolute',
    top: 2,
    right: 0,
    fontFamily: t.fonts.black,
    fontSize: t.size(10),
    color: t.colors.accentText,
  },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, marginTop: t.space.lg },
  listeningOn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, marginTop: t.space.sm },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  side: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  deviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.accent },
  sleepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: t.colors.accentText,
  },
}));
