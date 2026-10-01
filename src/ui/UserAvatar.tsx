import { Image } from 'expo-image';
import { PixelRatio, View } from 'react-native';

import { useMe } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';

/** Your Jellyfin profile picture, or your initial on the accent colour if you haven't set one. */
export function UserAvatar({ size }: { size: number }) {
  const t = useTheme();
  const client = useAuth((s) => s.client);
  const userName = useAuth((s) => s.session?.userName ?? '');
  const me = useMe().data;
  const uri = me && client?.userImageUrl(me, Math.round(size * PixelRatio.get()));
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: t.colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" transition={150} cachePolicy="memory-disk" />
      ) : (
        <T style={{ fontFamily: t.fonts.bold, fontSize: size * 0.44, color: '#000' }}>
          {userName.charAt(0).toUpperCase() || '?'}
        </T>
      )}
    </View>
  );
}
