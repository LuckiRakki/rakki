import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ionicons } from '@/ui/Icon';
import { signOut } from '@/auth/actions';
import { accountKey, useAuth } from '@/auth/store';
import { useDownloads } from '@/downloads/store';
import { songCount } from '@/lib/format';
import { appVersion } from '@/lib/updates';
import { useSettings } from '@/settings/store';
import { LastfmSettings } from '@/ui/LastfmSettings';
import { T } from '@/ui/T';
import { useTheme } from '@/ui/theme';
import { UserAvatar } from '@/ui/UserAvatar';
import { NavRow, type NavRowProps } from '@/settings/screen/NavRow';
import { AccountPage } from '@/settings/screen/AccountPage';
import { PlaybackPage } from '@/settings/screen/PlaybackPage';
import { DownloadsPage } from '@/settings/screen/DownloadsPage';
import { AboutPage } from '@/settings/screen/AboutPage';
import { PerfLogSettings } from '@/settings/screen/PerfLogSettings';
import { useSettingsStyles } from '@/settings/screen/styles';
import { closeKeyboardOnScroll, useSwipeClosesKeyboard } from '@/ui/keyboard';

type Page = 'index' | 'account' | 'playback' | 'downloads' | 'connections' | 'about';

const GLASS_LABEL = { frost: 'Frost', clear: 'Clear', tint: 'Tint' } as const;

const LYRICS_LABEL: Record<string, string> = { spicy: 'Word by Word', regular: 'Line by Line' };

/**
 * Rakki 2.0's Settings: a search well, your profile, then groups (Look, Lyrics, Playback, Downloads /
 * History and Stats, Devices, Connections / About, Sign Out). Each group opens its own page here.
 */
export default function SettingsScreen() {
  const swipeKb = useSwipeClosesKeyboard();
  const t = useTheme();
  const styles = useSettingsStyles();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<Page>('index');
  const [query, setQuery] = useState('');
  const session = useAuth((s) => s.session);
  const accounts = useAuth((s) => s.accounts);
  const others = session ? accounts.filter((a) => accountKey(a) !== accountKey(session)) : accounts;
  const hasDownloads = useDownloads((s) => Object.keys(s.collections).length > 0);
  const lyricsMode = useSettings((s) => s.lyricsMode);
  const lastfm = useSettings((s) => !!s.lastfmApiKey);
  const glass = t.appearance.glass;
  const downloadedSongs = useDownloads((s) => Object.values(s.tracks).filter((x) => x.state === 'done').length);

  const confirmSignOut = () =>
    Alert.alert(
      `Sign out of ${session?.userName ?? 'this account'}?`,
      [
        hasDownloads ? 'Music downloaded with this account will be removed from this iPhone.' : '',
        others.length ? `Rakki will switch to ${others[0].userName} on ${others[0].serverName}.` : '',
      ]
        .filter(Boolean)
        .join(' ') || undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            router.dismissAll();
            void signOut();
          },
        },
      ],
    );

  const lyricsStyle = () => router.push({ pathname: '/lyrics-style', params: { from: 'settings' } });
  const groups: NavRowProps[][] = [
    [
      { icon: 'color-palette-outline', label: 'Look', value: GLASS_LABEL[glass], onPress: () => router.push('/customize'), keywords: 'glass colour color font text corners motion theme kawarp pause home mini player' },
      { icon: 'mic-outline', label: 'Lyrics', value: LYRICS_LABEL[lyricsMode] ?? '', onPress: lyricsStyle, keywords: 'spicy karaoke style' },
      { icon: 'play-circle', label: 'Playback', onPress: () => setPage('playback'), keywords: 'quality streaming wifi cellular volume autoplay equalizer eq video' },
      { icon: 'cloud-download-outline', label: 'Downloads', value: downloadedSongs ? songCount(downloadedSongs) : '', onPress: () => setPage('downloads'), keywords: 'offline cellular quality' },
    ],
    [
      { icon: 'stats-chart-outline', label: 'History and Stats', value: 'On', onPress: () => router.push('/stats'), keywords: 'plays listening top artists' },
      { icon: 'laptop-outline', label: 'Devices', value: 'This iPhone', onPress: () => router.push('/devices'), keywords: 'connect handoff remote' },
      { icon: 'globe-outline', label: 'Connections', value: lastfm ? 'Last.fm' : '', onPress: () => setPage('connections'), keywords: 'lastfm last.fm performance log' },
    ],
    [
      { icon: 'information-circle-outline', label: 'About Rakki', value: appVersion(), onPress: () => setPage('about'), keywords: 'version update' },
      { icon: 'log-out-outline', label: 'Sign Out', onPress: confirmSignOut, danger: true, keywords: 'account' },
    ],
  ];
  const q = query.trim().toLowerCase();
  const shown = q ? groups.map((g) => g.filter((r) => `${r.label} ${r.keywords ?? ''}`.toLowerCase().includes(q))).filter((g) => g.length) : groups;

  const title = { index: 'Settings', account: 'Account', playback: 'Playback', downloads: 'Downloads', connections: 'Connections', about: 'About Rakki' }[page];
  return (
    <View {...swipeKb} style={{ flex: 1, backgroundColor: t.colors.page }}>
      <View style={styles.header}>
        {page === 'index' ? null : (
          <Pressable hitSlop={12} onPress={() => setPage('index')} accessibilityLabel="Back to Settings" style={{ marginRight: 4 }}>
            <Ionicons name="chevron-back" size={26} color={t.colors.text} />
          </Pressable>
        )}
        <T style={styles.title}>{title}</T>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={t.colors.text} />
        </Pressable>
      </View>
      <ScrollView {...closeKeyboardOnScroll} contentContainerStyle={{ padding: t.space.lg, paddingTop: t.space.xs, paddingBottom: insets.bottom + t.space.xxl }}>
        {page === 'index' ? (
          <>
            <View style={styles.searchWell}>
              <Ionicons name="search-outline" size={18} color={t.colors.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search Settings"
                placeholderTextColor={t.colors.textSecondary}
                style={styles.searchInput}
                returnKeyType="search"
                autoCorrect={false}
              />
            </View>
            {q ? null : (
              <Pressable onPress={() => setPage('account')} style={({ pressed }) => [styles.profile, pressed && { opacity: 0.7 }]} accessibilityLabel={`${session?.userName ?? 'Account'}. Switch Account`}>
                <UserAvatar size={52} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <T style={{ fontFamily: t.fonts.black, fontSize: t.size(17) }}>{session?.userName}</T>
                  <T numberOfLines={1} style={{ fontFamily: t.fonts.medium, fontSize: t.size(13), color: t.colors.textSecondary, marginTop: 2 }}>
                    {session?.serverName} · {others.length ? 'Switch Account' : 'Add Account'}
                  </T>
                </View>
                <Ionicons name="chevron-forward" size={16} color={t.colors.textMuted} />
              </Pressable>
            )}
            {shown.map((g, i) => (
              <View key={i} style={{ marginTop: 20 }}>
                {g.map((r, j) => (
                  <NavRow key={r.label} {...r} first={j === 0} last={j === g.length - 1} />
                ))}
              </View>
            ))}
            {q && shown.length === 0 ? (
              <T variant="caption" style={{ marginTop: t.space.xl, textAlign: 'center' }}>
                No settings match.
              </T>
            ) : null}
          </>
        ) : page === 'account' ? (
          <AccountPage others={others} />
        ) : page === 'playback' ? (
          <PlaybackPage />
        ) : page === 'downloads' ? (
          <DownloadsPage />
        ) : page === 'connections' ? (
          <>
            <LastfmSettings />
            <PerfLogSettings />
          </>
        ) : (
          <AboutPage />
        )}
      </ScrollView>
    </View>
  );
}
