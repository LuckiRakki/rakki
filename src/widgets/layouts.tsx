// Home Screen and Lock Screen widgets. Each layout is turned into a string at build time (the
// 'widget' directive) and runs inside the widget, not the app: it can only use its props, its
// environment and the SwiftUI components/modifiers imported here. Nothing else from this file
// or the app (no constants, helpers or hooks) exists where it runs.
//
// Rakki 2.0: Title Case labels, heavy titles, secondary text at 80% and 70%. Lock Screen
// widgets are drawn in white by iOS, so they have no colour of their own. Buttons in a widget
// are links (rakki://widget/<action>, src/widgets/actions.ts); the ones that work without
// opening Rakki are the Control Center and Lock Screen controls (plugins/withRakkiIntents.js).
import {
  AccessoryWidgetBackground,
  Gauge,
  HStack,
  Image,
  Label,
  Link,
  ProgressView,
  Spacer,
  Text,
  VStack,
  ZStack,
} from '@expo/ui/swift-ui';
import {
  aspectRatio,
  background,
  clipShape,
  clipped,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  gaugeStyle,
  lineLimit,
  opacity,
  padding,
  progressViewStyle,
  resizable,
  tint,
  widgetAccentedRenderingMode,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import type { WidgetEnvironment } from 'expo-widgets';

export interface NowPlayingProps {
  /** Missing until something has been played. */
  title?: string;
  artist?: string;
  album?: string;
  /** The album art: a file URL in the shared widgets folder. */
  art?: string;
  /** Background colour, from the art (builds before 1.1.1 only knew this one). */
  color?: string;
  /** Background gradient from the art (2 or 3 colours, after the Glass setting). */
  colors?: string[];
  playing?: boolean;
  /** While playing: when the song started and when it will end (ms), for a live progress bar. */
  start?: number;
  end?: number;
  /** How far into the song (0 to 1): while paused, and on each step of the Lock Screen ring. */
  progress?: number;
}

export interface WidgetAlbum {
  id: string;
  name: string;
  artist: string;
  art?: string;
}

export interface JumpBackInProps {
  albums?: WidgetAlbum[];
  color?: string;
  colors?: string[];
}

/** Open Player: the cover, and a music note. */
export interface OpenPlayerProps {
  art?: string;
  colors?: string[];
}

/** The song after the one playing. */
export interface UpNextProps {
  title?: string;
  artist?: string;
}

/** The first Daily Mix the Rakki plugin made (lib/mixes.ts). */
export interface DailyMixProps {
  number?: number;
  name?: string;
  artists?: string;
}

/** Whether the song playing is liked. */
export interface LikeProps {
  title?: string;
  liked?: boolean;
}

/** The sleep timer: minutes left of how many, or the end of the song. */
export interface SleepTimerProps {
  left?: number;
  total?: number;
  endOfSong?: boolean;
}

export type ShuffleAllProps = Record<string, never>;

/** The song playing (or played last). Small/medium on the Home Screen, all three on the Lock Screen. */
export function NowPlayingLayout(props: NowPlayingProps, env: WidgetEnvironment) {
  'widget';
  const family = env.widgetFamily;
  const url = 'rakki://player';
  const hasSong = !!props.title;
  const timed = !!props.playing && !!props.start && !!props.end && props.end > props.start;
  const clear = containerBackground('#00000000', 'widget');
  const backdrop = containerBackground(
    {
      type: 'linearGradient',
      colors: props.colors ?? [props.color ?? '#2a2a2a', '#121212'],
      startPoint: { x: 0.2, y: 0 },
      endPoint: { x: 0.8, y: 1 },
    },
    'widget',
  );

  // Tinted and Clear Home Screens draw images as a flat tint unless told otherwise, which hid
  // the art; widgetAccentedRenderingMode('fullColor') keeps it a picture.
  const art = (size: number, radius: number) =>
    props.art ? (
      <Image
        uiImage={props.art}
        modifiers={[
          resizable(),
          aspectRatio({ contentMode: 'fill' }),
          frame({ width: size, height: size }),
          clipShape('roundedRectangle', radius),
          widgetAccentedRenderingMode('fullColor'),
        ]}
      />
    ) : (
      <ZStack
        modifiers={[frame({ width: size, height: size }), background('#2e2e33'), clipShape('roundedRectangle', radius)]}>
        <Image systemName="music.note" size={size * 0.4} color="#9a9aa2" />
      </ZStack>
    );

  if (family === 'accessoryInline') {
    return (
      <Label
        title={hasSong ? `${props.title} · ${props.artist}` : 'Rakki'}
        systemImage={props.playing ? 'waveform' : 'music.note'}
        modifiers={[widgetURL(url)]}
      />
    );
  }

  // Play and Pause: the ring fills as the song plays (a step every few seconds, set by the app).
  if (family === 'accessoryCircular') {
    return (
      <ZStack modifiers={[widgetURL(hasSong ? 'rakki://widget/playpause' : url), clear]}>
        <AccessoryWidgetBackground />
        {hasSong ? <Gauge value={props.progress ?? 0} modifiers={[gaugeStyle('circularCapacity')]} /> : null}
        <Image systemName={!hasSong ? 'music.note' : props.playing ? 'pause.fill' : 'play.fill'} size={22} />
      </ZStack>
    );
  }

  if (family === 'accessoryRectangular') {
    if (!hasSong) {
      return (
        <HStack modifiers={[widgetURL(url), clear]}>
          <VStack alignment="leading" spacing={1}>
            <HStack spacing={5}>
              <Image systemName="music.note" size={13} />
              <Text modifiers={[font({ size: 14, weight: 'heavy' })]}>Rakki</Text>
            </HStack>
            <Text modifiers={[font({ size: 12, weight: 'medium' }), opacity(0.9), lineLimit(1)]}>Nothing played yet.</Text>
            <Text modifiers={[font({ size: 12, weight: 'medium' }), opacity(0.9), lineLimit(1)]}>Tap to pick some music</Text>
          </VStack>
          <Spacer />
        </HStack>
      );
    }
    if (!props.playing) {
      return (
        <HStack spacing={6} modifiers={[widgetURL('rakki://widget/playpause'), clear]}>
          <VStack alignment="leading" spacing={1}>
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), opacity(0.9)]}>Paused</Text>
            <Text modifiers={[font({ size: 14, weight: 'heavy' }), lineLimit(1)]}>{props.title ?? ''}</Text>
            <Text modifiers={[font({ size: 12, weight: 'medium' }), opacity(0.9), lineLimit(1)]}>{props.artist ?? ''}</Text>
          </VStack>
          <Spacer />
          <ZStack modifiers={[frame({ width: 34, height: 34 }), background('#FFFFFF'), clipShape('circle')]}>
            <Image systemName="play.fill" size={15} color="#1E2438" />
          </ZStack>
        </HStack>
      );
    }
    return (
      <HStack modifiers={[widgetURL(url), clear]}>
        <VStack alignment="leading" spacing={1}>
          <HStack spacing={4}>
            <Image systemName="waveform" size={12} />
            <Text modifiers={[font({ size: 14, weight: 'heavy' }), lineLimit(1)]}>{props.title ?? ''}</Text>
          </HStack>
          <Text modifiers={[font({ size: 12, weight: 'medium' }), opacity(0.9), lineLimit(1)]}>{props.artist ?? ''}</Text>
          {timed ? (
            <HStack spacing={5}>
              <Text
                timerInterval={{ lower: new Date(props.start ?? 0), upper: new Date(props.end ?? 0) }}
                countsDown={false}
                modifiers={[font({ size: 10, weight: 'semibold' }), opacity(0.9), frame({ width: 28, alignment: 'leading' })]}
              />
              <ProgressView
                timerInterval={{ lower: new Date(props.start ?? 0), upper: new Date(props.end ?? 0) }}
                countsDown={false}
                modifiers={[progressViewStyle('linear')]}
              />
              <Text
                timerInterval={{ lower: new Date(props.start ?? 0), upper: new Date(props.end ?? 0) }}
                countsDown
                modifiers={[font({ size: 10, weight: 'semibold' }), opacity(0.9), frame({ width: 28, alignment: 'trailing' })]}
              />
            </HStack>
          ) : null}
        </VStack>
        <Spacer />
      </HStack>
    );
  }

  if (!hasSong) {
    return (
      <HStack modifiers={[widgetURL(url), backdrop]}>
        <VStack alignment="leading" spacing={3}>
          <Image systemName="music.note" size={22} color="#ffffff" modifiers={[opacity(0.8)]} />
          <Spacer />
          <Text modifiers={[font({ size: 16, weight: 'heavy' }), foregroundStyle('#ffffff')]}>Rakki</Text>
          <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle('#ffffff'), opacity(0.8), lineLimit(2)]}>
            Play something and it shows up here
          </Text>
        </VStack>
        <Spacer />
      </HStack>
    );
  }

  if (family === 'systemMedium') {
    const progress = timed ? (
      <ProgressView
        timerInterval={{ lower: new Date(props.start ?? 0), upper: new Date(props.end ?? 0) }}
        countsDown={false}
        modifiers={[progressViewStyle('linear'), tint('#ffffff'), foregroundStyle('#ffffff')]}
      />
    ) : (
      <ProgressView value={props.progress ?? 0} modifiers={[progressViewStyle('linear'), tint('#ffffff')]} />
    );
    return (
      <HStack spacing={14} modifiers={[widgetURL(url), backdrop]}>
        {art(126, 12)}
        <VStack alignment="leading" spacing={2}>
          <HStack spacing={5}>
            <Image systemName={props.playing ? 'waveform' : 'clock.arrow.circlepath'} size={11} color="#ffffff" modifiers={[opacity(0.8)]} />
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle('#ffffff'), opacity(0.8)]}>
              {props.playing ? 'Now Playing' : 'Last Played'}
            </Text>
            <Spacer />
          </HStack>
          <Spacer />
          <Text modifiers={[font({ size: 17, weight: 'heavy' }), foregroundStyle('#ffffff'), lineLimit(2)]}>{props.title ?? ''}</Text>
          <Text modifiers={[font({ size: 14, weight: 'medium' }), foregroundStyle('#ffffff'), opacity(0.8), lineLimit(1)]}>
            {props.artist ?? ''}
          </Text>
          <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle('#ffffff'), opacity(0.7), lineLimit(1)]}>
            {props.album ?? ''}
          </Text>
          <Spacer />
          {progress}
        </VStack>
      </HStack>
    );
  }

  // systemSmall
  return (
    <VStack alignment="leading" spacing={2} modifiers={[widgetURL(url), backdrop]}>
      <HStack alignment="top">
        {art(64, 8)}
        <Spacer />
        <Image systemName={props.playing ? 'waveform' : 'clock.arrow.circlepath'} size={13} color="#ffffff" modifiers={[opacity(0.8)]} />
      </HStack>
      <Spacer />
      {props.playing ? null : (
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle('#ffffff'), opacity(0.8)]}>Last Played</Text>
      )}
      <Text modifiers={[font({ size: 15, weight: 'heavy' }), foregroundStyle('#ffffff'), lineLimit(2)]}>{props.title ?? ''}</Text>
      <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle('#ffffff'), opacity(0.8), lineLimit(1)]}>
        {props.artist ?? ''}
      </Text>
    </VStack>
  );
}

/** Albums played recently, like Home's "Jump Back In": 4 on the medium widget, 6 on the large. */
export function JumpBackInLayout(props: JumpBackInProps, env: WidgetEnvironment) {
  'widget';
  const large = env.widgetFamily === 'systemLarge';
  const albums = (props.albums ?? []).slice(0, large ? 6 : 4);
  const backdrop = containerBackground(
    {
      type: 'linearGradient',
      colors: props.colors ?? [props.color ?? '#2a2a2a', '#121212'],
      startPoint: { x: 0.2, y: 0 },
      endPoint: { x: 0.8, y: 1 },
    },
    'widget',
  );

  const tile = (album: WidgetAlbum, size: number) => (
    <Link key={album.id} destination={`rakki://album/${album.id}`}>
      <VStack alignment="leading" spacing={4}>
        {album.art ? (
          <Image
            uiImage={album.art}
            modifiers={[
              resizable(),
              aspectRatio({ contentMode: 'fill' }),
              frame({ width: size, height: size }),
              clipShape('roundedRectangle', 6),
              widgetAccentedRenderingMode('fullColor'),
            ]}
          />
        ) : (
          <ZStack modifiers={[frame({ width: size, height: size }), background('#2e2e33'), clipShape('roundedRectangle', 6)]}>
            <Image systemName="music.note" size={size * 0.35} color="#9a9aa2" />
          </ZStack>
        )}
        <Text
          modifiers={[
            font({ size: large ? 12 : 11, weight: 'bold' }),
            foregroundStyle('#ffffff'),
            lineLimit(1),
            frame({ width: size, alignment: 'leading' }),
          ]}>
          {album.name}
        </Text>
        {large ? (
          <Text
            modifiers={[
              font({ size: 11, weight: 'medium' }),
              foregroundStyle('#ffffff'),
              opacity(0.7),
              lineLimit(1),
              frame({ width: size, alignment: 'leading' }),
            ]}>
            {album.artist}
          </Text>
        ) : null}
      </VStack>
    </Link>
  );

  const header = (
    <HStack spacing={6}>
      <Text modifiers={[font({ size: 14, weight: 'heavy' }), foregroundStyle('#ffffff')]}>Jump Back In</Text>
      <Spacer />
      <Image systemName="music.note" size={13} color="#ffffff" modifiers={[opacity(0.8)]} />
    </HStack>
  );

  if (albums.length === 0) {
    return (
      <VStack alignment="leading" spacing={6} modifiers={[widgetURL('rakki://'), backdrop]}>
        {header}
        <Spacer />
        <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle('#ffffff'), opacity(0.8)]}>
          Albums you play show up here
        </Text>
        <Spacer />
      </VStack>
    );
  }

  if (large) {
    const size = 92;
    return (
      <VStack alignment="leading" spacing={12} modifiers={[widgetURL('rakki://'), backdrop]}>
        {header}
        <HStack spacing={10} alignment="top">
          {albums.slice(0, 3).map((a) => tile(a, size))}
          <Spacer />
        </HStack>
        <HStack spacing={10} alignment="top">
          {albums.slice(3, 6).map((a) => tile(a, size))}
          <Spacer />
        </HStack>
        <Spacer />
      </VStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={10} modifiers={[widgetURL('rakki://'), backdrop]}>
      {header}
      <HStack spacing={10} alignment="top">
        {albums.map((a) => tile(a, 64))}
        <Spacer />
      </HStack>
    </VStack>
  );
}

/** Open Player: the cover fills it with a music note on glass; on the Lock Screen, just the note. */
export function OpenPlayerLayout(props: OpenPlayerProps, env: WidgetEnvironment) {
  'widget';
  const url = 'rakki://player';
  if (env.widgetFamily === 'accessoryCircular') {
    return (
      <ZStack modifiers={[widgetURL(url), containerBackground('#00000000', 'widget')]}>
        <AccessoryWidgetBackground />
        <Image systemName="music.note" size={28} />
      </ZStack>
    );
  }
  const backdrop = containerBackground(
    {
      type: 'linearGradient',
      colors: props.colors ?? ['#2a2a2a', '#121212'],
      startPoint: { x: 0.2, y: 0 },
      endPoint: { x: 0.8, y: 1 },
    },
    'widget',
  );
  const note = (
    <ZStack modifiers={[frame({ width: 40, height: 40 }), background({ type: 'material', material: 'ultraThin' }), clipShape('circle')]}>
      <Image systemName="music.note" size={18} color="#ffffff" />
    </ZStack>
  );
  if (!props.art) {
    return (
      <ZStack modifiers={[widgetURL(url), backdrop]}>
        <Image systemName="music.note" size={44} color="#ffffff" modifiers={[opacity(0.8)]} />
      </ZStack>
    );
  }
  return (
    <ZStack alignment="bottomTrailing" modifiers={[widgetURL(url), backdrop]}>
      <Image
        uiImage={props.art}
        modifiers={[
          resizable(),
          aspectRatio({ contentMode: 'fill' }),
          frame({ maxWidth: 1000, maxHeight: 1000 }),
          clipped(),
          widgetAccentedRenderingMode('fullColor'),
        ]}
      />
      <HStack modifiers={[padding({ all: 10 })]}>{note}</HStack>
    </ZStack>
  );
}

/** Up Next: the song after this one. Tapping skips to it. */
export function UpNextLayout(props: UpNextProps, env: WidgetEnvironment) {
  'widget';
  const has = !!props.title;
  const url = has ? 'rakki://widget/next' : 'rakki://player';
  if (env.widgetFamily === 'accessoryInline') {
    return <Label title={has ? `Up Next: ${props.title}` : 'Up Next: nothing yet'} systemImage="forward.fill" modifiers={[widgetURL(url)]} />;
  }
  return (
    <HStack spacing={6} modifiers={[widgetURL(url), containerBackground('#00000000', 'widget')]}>
      <VStack alignment="leading" spacing={1}>
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), opacity(0.9)]}>Up Next</Text>
        <Text modifiers={[font({ size: 14, weight: 'heavy' }), lineLimit(1)]}>{has ? (props.title ?? '') : 'Nothing Queued'}</Text>
        <Text modifiers={[font({ size: 12, weight: 'medium' }), opacity(0.9), lineLimit(1)]}>
          {has ? (props.artist ?? '') : 'Play something in Rakki'}
        </Text>
      </VStack>
      <Spacer />
      {has ? (
        <ZStack modifiers={[frame({ width: 34, height: 34 }), background('#FFFFFF38'), clipShape('circle')]}>
          <Image systemName="forward.fill" size={15} />
        </ZStack>
      ) : null}
    </HStack>
  );
}

/** Daily Mix: starts the mix in one tap. */
export function DailyMixLayout(props: DailyMixProps) {
  'widget';
  const has = !!props.name;
  return (
    <HStack spacing={6} modifiers={[widgetURL(has ? `rakki://widget/mix/${props.number ?? 1}` : 'rakki://'), containerBackground('#00000000', 'widget')]}>
      <VStack alignment="leading" spacing={1}>
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), opacity(0.9)]}>Made for You</Text>
        <Text modifiers={[font({ size: 14, weight: 'heavy' }), lineLimit(1)]}>{has ? (props.name ?? '') : 'Daily Mixes'}</Text>
        <Text modifiers={[font({ size: 12, weight: 'medium' }), opacity(0.9), lineLimit(1)]}>
          {has ? (props.artists ?? '') : 'Made each night by the Rakki plugin'}
        </Text>
      </VStack>
      <Spacer />
      {has ? (
        <ZStack modifiers={[frame({ width: 34, height: 34 }), background('#FFFFFF'), clipShape('circle')]}>
          <Image systemName="play.fill" size={15} color="#1E2438" />
        </ZStack>
      ) : null}
    </HStack>
  );
}

/** Shuffle All: shuffles the whole library. */
export function ShuffleAllLayout() {
  'widget';
  return (
    <ZStack modifiers={[widgetURL('rakki://widget/shuffle'), containerBackground('#00000000', 'widget')]}>
      <AccessoryWidgetBackground />
      <VStack spacing={1}>
        <Image systemName="shuffle" size={22} />
        <Text modifiers={[font({ size: 10, weight: 'bold' })]}>All</Text>
      </VStack>
    </ZStack>
  );
}

/** Like: likes the song playing. Empty when it isn't liked. */
export function LikeLayout(props: LikeProps) {
  'widget';
  return (
    <ZStack modifiers={[widgetURL(props.title ? 'rakki://widget/like' : 'rakki://'), containerBackground('#00000000', 'widget')]}>
      <AccessoryWidgetBackground />
      <Image systemName={props.liked ? 'heart.fill' : 'heart'} size={26} modifiers={[opacity(props.title ? 1 : 0.6)]} />
    </ZStack>
  );
}

/** Sleep Timer: the time left as a ring. Tapping adds 15 minutes. */
export function SleepTimerLayout(props: SleepTimerProps) {
  'widget';
  const on = (props.left ?? 0) > 0;
  return (
    <ZStack modifiers={[widgetURL('rakki://widget/sleep'), containerBackground('#00000000', 'widget')]}>
      <AccessoryWidgetBackground />
      {on ? (
        <Gauge value={Math.min(1, (props.left ?? 0) / Math.max(1, props.total ?? 1))} modifiers={[gaugeStyle('circularCapacity')]} />
      ) : null}
      <VStack spacing={1}>
        <Image systemName="moon.fill" size={on || props.endOfSong ? 13 : 20} />
        {on ? (
          <Text modifiers={[font({ size: 13, weight: 'heavy' })]}>{`${props.left}m`}</Text>
        ) : (
          <Text modifiers={[font({ size: 10, weight: 'bold' })]}>{props.endOfSong ? 'Song' : 'Sleep'}</Text>
        )}
      </VStack>
    </ZStack>
  );
}
