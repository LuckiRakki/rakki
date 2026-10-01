import { View } from 'react-native';

/**
 * A circular progress ring from plain Views (no SVG): two clipped halves, each holding a
 * half-ring that rotates into view. `progress` is 0–1.
 */
export function ProgressRing({
  progress,
  size,
  stroke,
  color,
  track,
}: {
  progress: number;
  size: number;
  stroke: number;
  color: string;
  track: string;
}) {
  const p = Math.max(0, Math.min(1, progress));
  const ring = { width: size, height: size, borderRadius: size / 2, borderWidth: stroke };
  // A half-ring (top + right borders), turned so it covers 12 → 6 o'clock at 45°.
  const halfRing = (deg: number) => ({
    ...ring,
    position: 'absolute' as const,
    top: 0,
    borderTopColor: color,
    borderRightColor: color,
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    transform: [{ rotate: `${deg}deg` }],
  });
  return (
    <View style={{ width: size, height: size }}>
      <View style={[ring, { borderColor: track }]} />
      {/* Right half: 0–50% */}
      <View style={{ position: 'absolute', top: 0, left: size / 2, width: size / 2, height: size, overflow: 'hidden' }}>
        <View style={[halfRing(45 + 360 * Math.min(p, 0.5) - 180), { left: -size / 2 }]} />
      </View>
      {/* Left half: 50–100% */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: size / 2, height: size, overflow: 'hidden' }}>
        <View style={[halfRing(45 + 360 * Math.max(p, 0.5) - 180), { left: 0 }]} />
      </View>
    </View>
  );
}
