// expo-image's Image, minus the picture while Rakki is in the background: a mounted image
// keeps its decoded bitmap even after the memory cache is cleared (lib/memory.ts), and
// suspended Rakki was holding 150-200 MB, enough for iOS to close it 10 times in a day
// (performance log, 10-20). The space stays; the picture comes back from the disk cache.
import { Image, type ImageProps } from 'expo-image';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useInBackground } from '@/lib/appActive';

export function AwayImage(props: ImageProps) {
  const away = useInBackground();
  if (away) return <View style={props.style as StyleProp<ViewStyle>} />;
  return <Image {...props} />;
}
