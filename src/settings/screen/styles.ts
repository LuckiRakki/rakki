// Styles shared by the Settings screen and its pages.
import { StyleSheet } from 'react-native';

import { makeStyles } from '@/ui/theme';

export const useSettingsStyles = makeStyles((t) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingLeft: t.space.md,
    paddingRight: t.space.lg,
  },
  title: { flex: 1, fontFamily: t.fonts.black, fontSize: t.size(26), letterSpacing: -0.4, marginLeft: 4 },
  sectionTitle: { marginTop: t.space.xl, marginBottom: 10, marginHorizontal: 4, fontFamily: t.fonts.bold, fontSize: t.size(13), color: t.colors.textSecondary },
  card: { backgroundColor: t.colors.row, borderRadius: 16, padding: 14 },
  searchWell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  searchInput: { flex: 1, height: 40, fontFamily: t.fonts.medium, fontSize: t.size(15), color: t.colors.text },
  profile: { flexDirection: 'row', alignItems: 'center', marginTop: t.space.lg, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.colors.row },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 52, paddingHorizontal: 14, backgroundColor: t.colors.row },
  tile: { width: 30, height: 30, borderRadius: 8, backgroundColor: t.colors.surface3, alignItems: 'center', justifyContent: 'center' },
  rowLine: { position: 'absolute', left: 58, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)' },
  outlineButton: {
    marginTop: t.space.lg,
    height: 42,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: t.space.sm },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: t.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: t.space.sm },
  initial: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
