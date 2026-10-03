// Home Screen and Lock Screen widgets. Each layout is turned into a string at build time (the
// 'widget' directive) and runs inside the widget, not the app: it can only use its props, its
// environment and the SwiftUI components/modifiers imported here. Nothing else from this file
// or the app (no constants, helpers or hooks) exists where it runs.
import {
  AccessoryWidgetBackground,
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
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  opacity,
  progressViewStyle,
  resizable,
  tint,
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
  /** Background gradient from the art: its brightest colour, then its darkest. */
  colors?: string[];
  playing?: boolean;
  /** While playing: when the song started and when it will end (ms), for a live progress bar. */
  start?: number;
  end?: number;
  /** While paused: how far into the song (0 to 1). */
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

/** The song playing (or played last). Small/medium on the Home Screen, all three on the Lock Screen. */
export function NowPlayingLayout(props: NowPlayingProps, env: WidgetEnvironment) {
  'widget';
  const family = env.widgetFamily;
  const url = 'rakki://player';
  const hasSong = !!props.title;
  const status = props.playing ? 'Now playing' : 'Last played';
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

  const art = (size: number, radius: number) =>
    props.art ? (
      <Image
        uiImage={props.art}
        modifiers={[
          resizable(),
          aspectRatio({ contentMode: 'fill' }),
          frame({ width: size, height: size }),
          clipShape('roundedRectangle', radius),
        ]}
      />
    ) : (
      <ZStack
        modifiers={[frame({ width: size, height: size }), background('#2e2e2e'), clipShape('roundedRectangle', radius)]}>
        <Image systemName="music.note" size={size * 0.4} color="#8a8a8a" />
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

  if (family === 'accessoryCircular') {
    return (
      <ZStack modifiers={[widgetURL(url), clear]}>
        <AccessoryWidgetBackground />
        <Image systemName={props.playing ? 'waveform' : 'music.note'} size={24} />
      </ZStack>
    );
  }

  if (family === 'accessoryRectangular') {
    return (
      <HStack modifiers={[widgetURL(url), clear]}>
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), opacity(0.75), lineLimit(1)]}>
            {hasSong ? status : 'Rakki'}
          </Text>
          <Text modifiers={[font({ size: 15, weight: 'bold' }), lineLimit(1)]}>
            {hasSong ? (props.title ?? '') : 'Nothing played yet'}
          </Text>
          {hasSong ? <Text modifiers={[font({ size: 13 }), lineLimit(1)]}>{props.artist ?? ''}</Text> : null}
        </VStack>
        <Spacer />
      </HStack>
    );
  }

  if (!hasSong) {
    return (
      <HStack modifiers={[widgetURL(url), backdrop]}>
        <VStack alignment="leading" spacing={2}>
          <Image systemName="music.note" size={26} color="#ffffff" />
          <Spacer />
          <Text modifiers={[font({ size: 17, weight: 'bold' }), foregroundStyle('#ffffff')]}>Rakki</Text>
          <Text modifiers={[font({ size: 13 }), foregroundStyle('#ffffff'), opacity(0.7), lineLimit(2)]}>
            Play something and it shows up here
          </Text>
        </VStack>
        <Spacer />
      </HStack>
    );
  }

  if (family === 'systemMedium') {
    const progress =
      props.playing && props.start && props.end && props.end > props.start ? (
        <ProgressView
          timerInterval={{ lower: new Date(props.start), upper: new Date(props.end) }}
          countsDown={false}
          modifiers={[progressViewStyle('linear'), tint('#ffffff'), foregroundStyle('#ffffff')]}
        />
      ) : (
        <ProgressView value={props.progress ?? 0} modifiers={[progressViewStyle('linear'), tint('#ffffff')]} />
      );
    return (
      <HStack spacing={14} modifiers={[widgetURL(url), backdrop]}>
        {art(126, 10)}
        <VStack alignment="leading" spacing={2}>
          <HStack spacing={5}>
            <Image systemName={props.playing ? 'waveform' : 'clock.arrow.circlepath'} size={11} color="#ffffff" />
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle('#ffffff'), opacity(0.75)]}>
              {status}
            </Text>
            <Spacer />
          </HStack>
          <Spacer />
          <Text modifiers={[font({ size: 17, weight: 'bold' }), foregroundStyle('#ffffff'), lineLimit(2)]}>
            {props.title ?? ''}
          </Text>
          <Text modifiers={[font({ size: 14 }), foregroundStyle('#ffffff'), opacity(0.8), lineLimit(1)]}>
            {props.artist ?? ''}
          </Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle('#ffffff'), opacity(0.55), lineLimit(1)]}>
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
        {art(68, 8)}
        <Spacer />
        <Image systemName={props.playing ? 'waveform' : 'clock.arrow.circlepath'} size={13} color="#ffffff" />
      </HStack>
      <Spacer />
      <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle('#ffffff'), lineLimit(2)]}>
        {props.title ?? ''}
      </Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle('#ffffff'), opacity(0.75), lineLimit(1)]}>
        {props.artist ?? ''}
      </Text>
    </VStack>
  );
}

/** Albums played recently, like Home's "Jump back in": 4 on the medium widget, 6 on the large. */
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
            ]}
          />
        ) : (
          <ZStack modifiers={[frame({ width: size, height: size }), background('#2e2e2e'), clipShape('roundedRectangle', 6)]}>
            <Image systemName="music.note" size={size * 0.35} color="#8a8a8a" />
          </ZStack>
        )}
        <Text
          modifiers={[font({ size: large ? 12 : 11, weight: 'semibold' }), foregroundStyle('#ffffff'), lineLimit(1), frame({ width: size, alignment: 'leading' })]}>
          {album.name}
        </Text>
        {large ? (
          <Text
            modifiers={[font({ size: 11 }), foregroundStyle('#ffffff'), opacity(0.65), lineLimit(1), frame({ width: size, alignment: 'leading' })]}>
            {album.artist}
          </Text>
        ) : null}
      </VStack>
    </Link>
  );

  const header = (
    <HStack spacing={6}>
      <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle('#ffffff')]}>Jump back in</Text>
      <Spacer />
      <Image systemName="music.note" size={13} color="#ffffff" />
    </HStack>
  );

  if (albums.length === 0) {
    return (
      <VStack alignment="leading" spacing={6} modifiers={[widgetURL('rakki://'), backdrop]}>
        {header}
        <Spacer />
        <Text modifiers={[font({ size: 13 }), foregroundStyle('#ffffff'), opacity(0.7)]}>
          Albums you play show up here
        </Text>
        <Spacer />
      </VStack>
    );
  }

  if (large) {
    const size = 94;
    return (
      <VStack alignment="leading" spacing={12} modifiers={[widgetURL('rakki://'), backdrop]}>
        {header}
        <HStack spacing={12} alignment="top">
          {albums.slice(0, 3).map((a) => tile(a, size))}
          <Spacer />
        </HStack>
        <HStack spacing={12} alignment="top">
          {albums.slice(3, 6).map((a) => tile(a, size))}
          <Spacer />
        </HStack>
        <Spacer />
      </VStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={8} modifiers={[widgetURL('rakki://'), backdrop]}>
      {header}
      <HStack spacing={10} alignment="top">
        {albums.map((a) => tile(a, 66))}
        <Spacer />
      </HStack>
    </VStack>
  );
}
