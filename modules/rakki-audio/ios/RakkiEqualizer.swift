import AVFoundation
import os

/// The equalizer in Settings → Playback: ten peaking filters (one octave wide, 31 Hz to 16 kHz)
/// run on each song's audio inside the same tap the visualizer uses (RakkiLevels), so it shapes
/// what's heard. Songs that can't be tapped (HLS, i.e. the ones the server converts) play as
/// they are.
///
/// JS sets the gains on the main thread (`set`); each tap copies them on the audio thread when
/// they change and keeps its own filter memory, so nothing is allocated while audio runs.
final class RakkiEqualizer {
  static let shared = RakkiEqualizer()
  static let bands: [Float] = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

  private let lock: UnsafeMutablePointer<os_unfair_lock> = {
    let l = UnsafeMutablePointer<os_unfair_lock>.allocate(capacity: 1)
    l.initialize(to: os_unfair_lock())
    return l
  }()
  private var enabled = false
  private var gains = [Float](repeating: 0, count: RakkiEqualizer.bands.count)
  private var version = 0

  /// Gains in dB (-12 to 12), one per band.
  func set(enabled: Bool, gains newGains: [Double]) {
    os_unfair_lock_lock(lock)
    self.enabled = enabled
    for i in gains.indices {
      gains[i] = i < newGains.count ? Float(max(-12, min(12, newGains[i]))) : 0
    }
    version += 1
    os_unfair_lock_unlock(lock)
  }

  /// Audio thread: copies the settings when they changed since `seen` and returns the new version; nil if not.
  fileprivate func read(since seen: Int, into gainsOut: UnsafeMutablePointer<Float>, enabled enabledOut: inout Bool) -> Int? {
    os_unfair_lock_lock(lock)
    defer { os_unfair_lock_unlock(lock) }
    if version == seen { return nil }
    for i in gains.indices { gainsOut[i] = gains[i] }
    enabledOut = enabled
    return version
  }
}

/// One tap's filters: coefficients for its sample rate, and memory per channel and band.
final class RakkiEqualizerState {
  private static let maxChannels = 8
  private static let count = RakkiEqualizer.bands.count

  private var seen = -1
  private var on = false
  private var rate: Double = 0
  private let gains = UnsafeMutablePointer<Float>.allocate(capacity: count)
  /// b0 b1 b2 a1 a2 per band (normalized by a0).
  private let coef = UnsafeMutablePointer<Float>.allocate(capacity: count * 5)
  private let active = UnsafeMutablePointer<Bool>.allocate(capacity: count)
  /// z1 z2 per channel per band (transposed direct form II).
  private let z = UnsafeMutablePointer<Float>.allocate(capacity: maxChannels * count * 2)
  private var preamp: Float = 1

  init() {
    gains.initialize(repeating: 0, count: Self.count)
    coef.initialize(repeating: 0, count: Self.count * 5)
    active.initialize(repeating: false, count: Self.count)
    z.initialize(repeating: 0, count: Self.maxChannels * Self.count * 2)
  }

  deinit {
    gains.deallocate()
    coef.deallocate()
    active.deallocate()
    z.deallocate()
  }

  /// Audio thread. Float samples, interleaved or one buffer per channel.
  func process(_ list: UnsafeMutablePointer<AudioBufferList>, frames: Int, sampleRate: Double, channels: Int, interleaved: Bool) {
    if let v = RakkiEqualizer.shared.read(since: seen, into: gains, enabled: &on) {
      seen = v
      rate = 0 // recompute below
      if !on { z.update(repeating: 0, count: Self.maxChannels * Self.count * 2) }
    }
    guard on, frames > 0, sampleRate > 0 else { return }
    if rate != sampleRate { design(sampleRate) }

    let buffers = UnsafeMutableAudioBufferListPointer(list)
    let chans = min(Self.maxChannels, max(1, channels))
    if interleaved {
      guard buffers.count > 0, let data = buffers[0].mData?.assumingMemoryBound(to: Float.self) else { return }
      let n = min(frames, Int(buffers[0].mDataByteSize) / (4 * chans))
      for c in 0..<chans { run(data + c, stride: chans, count: n, channel: c) }
    } else {
      for c in 0..<min(chans, buffers.count) {
        guard let data = buffers[c].mData?.assumingMemoryBound(to: Float.self) else { continue }
        run(data, stride: 1, count: min(frames, Int(buffers[c].mDataByteSize) / 4), channel: c)
      }
    }
  }

  private func run(_ samples: UnsafeMutablePointer<Float>, stride: Int, count n: Int, channel c: Int) {
    for b in 0..<Self.count where active[b] {
      let k = coef + b * 5
      let (b0, b1, b2, a1, a2) = (k[0], k[1], k[2], k[3], k[4])
      let s = z + (c * Self.count + b) * 2
      var z1 = s[0], z2 = s[1]
      var i = 0
      while i < n {
        let x = samples[i * stride]
        let y = b0 * x + z1
        z1 = b1 * x - a1 * y + z2
        z2 = b2 * x - a2 * y
        samples[i * stride] = y
        i += 1
      }
      // Denormals would slow the audio thread to a crawl in silence.
      s[0] = abs(z1) < 1e-15 ? 0 : z1
      s[1] = abs(z2) < 1e-15 ? 0 : z2
    }
    if preamp != 1 {
      for i in 0..<n { samples[i * stride] *= preamp }
    }
  }

  /// RBJ peaking filters, one octave wide; boosts are paid for with less overall level so loud
  /// songs don't clip.
  private func design(_ sampleRate: Double) {
    rate = sampleRate
    var top: Float = 0
    for b in 0..<Self.count {
      let f = Double(RakkiEqualizer.bands[b])
      let g = gains[b]
      active[b] = g != 0 && f < sampleRate * 0.45
      guard active[b] else { continue }
      top = max(top, g)
      let a = pow(10, Double(g) / 40)
      let w0 = 2 * Double.pi * f / sampleRate
      let alpha = sin(w0) / (2 * 1.414)
      let cosw = cos(w0)
      let a0 = 1 + alpha / a
      let k = coef + b * 5
      k[0] = Float((1 + alpha * a) / a0)
      k[1] = Float(-2 * cosw / a0)
      k[2] = Float((1 - alpha * a) / a0)
      k[3] = Float(-2 * cosw / a0)
      k[4] = Float((1 - alpha / a) / a0)
    }
    preamp = powf(10, -top / 20)
  }
}
