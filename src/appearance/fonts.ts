// The fonts you can pick in Customize. Each weight is imported on its own so only the five
// weights Rakki uses are bundled (a package's index would pull in every weight and italic).
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { DMSans_800ExtraBold } from '@expo-google-fonts/dm-sans/800ExtraBold';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';

export type FontKey = 'inter' | 'jakarta' | 'dmsans' | 'figtree';

export interface FontFaces {
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
  black: string;
}

export const FONTS: Record<FontKey, { label: string; note: string; faces: FontFaces }> = {
  inter: {
    label: 'Inter',
    note: 'Clean and neutral (default)',
    faces: {
      regular: 'Inter_400Regular',
      medium: 'Inter_500Medium',
      semibold: 'Inter_600SemiBold',
      bold: 'Inter_700Bold',
      black: 'Inter_800ExtraBold',
    },
  },
  figtree: {
    label: 'Figtree',
    note: 'Round and friendly, close to Spotify',
    faces: {
      regular: 'Figtree_400Regular',
      medium: 'Figtree_500Medium',
      semibold: 'Figtree_600SemiBold',
      bold: 'Figtree_700Bold',
      black: 'Figtree_800ExtraBold',
    },
  },
  jakarta: {
    label: 'Plus Jakarta Sans',
    note: 'Modern and a little wider',
    faces: {
      regular: 'PlusJakartaSans_400Regular',
      medium: 'PlusJakartaSans_500Medium',
      semibold: 'PlusJakartaSans_600SemiBold',
      bold: 'PlusJakartaSans_700Bold',
      black: 'PlusJakartaSans_800ExtraBold',
    },
  },
  dmsans: {
    label: 'DM Sans',
    note: 'Compact and geometric',
    faces: {
      regular: 'DMSans_400Regular',
      medium: 'DMSans_500Medium',
      semibold: 'DMSans_600SemiBold',
      bold: 'DMSans_700Bold',
      black: 'DMSans_800ExtraBold',
    },
  },
};

/** Every font file, for useFonts at launch (they're small and load from the app itself). */
export const FONT_FILES = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  DMSans_800ExtraBold,
};
