import Accelerate
import AVFoundation
import MediaToolbox
import QuartzCore

/// Live frequency levels for the visualizer. Every song gets an audio tap
/// (MTAudioProcessingTap) that sees its decoded audio; the tap runs an FFT over the newest
/// 2048 samples and keeps 32 band levels (low to high, 0–1), which JS reads once per frame.
///
/// Songs AVFoundation can't tap (HLS, i.e. the ones the server transcodes) and AirPlay (the
/// audio plays on the receiver) have no levels: `read` returns nil and the visualizer falls
/// back to its simulated beat.
///
/// Threads: `feed` runs on the audio render thread and never allocates; the main thread
/// registers taps and says which one is current; `read` runs on the JS thread. The state they
/// share is behind an unfair lock held for a few dozen float copies.
final class RakkiLevels {
  private static let fftLog2: vDSP_Length = 11
  private static let fftSize = 2048
  private static let half = fftSize / 2
  static let bandCount = 32

  // Audio thread only.
  private let fftSetup: FFTSetup
  private let window = UnsafeMutablePointer<Float>.allocate(capacity: RakkiLevels.fftSize)
  private let ring = UnsafeMutablePointer<Float>.allocate(capacity: RakkiLevels.fftSize)
  private var ringPos = 0
  private let frame = UnsafeMutablePointer<Float>.allocate(capacity: RakkiLevels.fftSize)
  private let real = UnsafeMutablePointer<Float>.allocate(capacity: RakkiLevels.half)
  private let imag = UnsafeMutablePointer<Float>.allocate(capacity: RakkiLevels.half)
  private let power = UnsafeMutablePointer<Float>.allocate(capacity: RakkiLevels.half)
  private let bandLo = UnsafeMutablePointer<Int>.allocate(capacity: RakkiLevels.bandCount)
  private let bandHi = UnsafeMutablePointer<Int>.allocate(capacity: RakkiLevels.bandCount)
  private let bandTilt = UnsafeMutablePointer<Float>.allocate(capacity: RakkiLevels.bandCount)
  private let fresh = UnsafeMutablePointer<Float>.allocate(capacity: RakkiLevels.bandCount)
  private var bandRate: Double = 0

  // Shared, behind `lock`.
  private let lock = UnsafeMutablePointer<os_unfair_lock>.allocate(capacity: 1)
  private let target = UnsafeMutablePointer<Float>.allocate(capacity: RakkiLevels.bandCount)
  private var updatedAt: CFTimeInterval = 0
  private var sourceToken = -1
  private var currentToken = -1
  private var currentSince: CFTimeInterval = 0
  /// Per tap: true once attached, false if the song can't be tapped. Missing = still loading.
  private var tapped: [Int: Bool] = [:]
  private var lastToken = 0

  // JS thread (`read`), also behind `lock`.
  private let shown = UnsafeMutablePointer<Float>.allocate(capacity: RakkiLevels.bandCount)
  private var readAt: CFTimeInterval = 0
  private var peak: Float = 0

  init() {
    fftSetup = vDSP_create_fftsetup(RakkiLevels.fftLog2, FFTRadix(kFFTRadix2))!
    vDSP_hann_window(window, vDSP_Length(RakkiLevels.fftSize), Int32(vDSP_HANN_DENORM))
    ring.initialize(repeating: 0, count: RakkiLevels.fftSize)
    frame.initialize(repeating: 0, count: RakkiLevels.fftSize)
    real.initialize(repeating: 0, count: RakkiLevels.half)
    imag.initialize(repeating: 0, count: RakkiLevels.half)
    power.initialize(repeating: 0, count: RakkiLevels.half)
    bandLo.initialize(repeating: 1, count: RakkiLevels.bandCount)
    bandHi.initialize(repeating: 2, count: RakkiLevels.bandCount)
    bandTilt.initialize(repeating: 0, count: RakkiLevels.bandCount)
    fresh.initialize(repeating: 0, count: RakkiLevels.bandCount)
    target.initialize(repeating: 0, count: RakkiLevels.bandCount)
    shown.initialize(repeating: 0, count: RakkiLevels.bandCount)
    lock.initialize(to: os_unfair_lock())
  }

  deinit {
    vDSP_destroy_fftsetup(fftSetup)
    for p in [window, ring, frame, real, imag, power, bandTilt, fresh, target, shown] { p.deallocate() }
    bandLo.deallocate()
    bandHi.deallocate()
    lock.deallocate()
  }

  private func locked<T>(_ body: () -> T) -> T {
    os_unfair_lock_lock(lock)
    defer { os_unfair_lock_unlock(lock) }
    return body()
  }

  // MARK: - Main thread

  /// A new id for an item's tap.
  func register() -> Int {
    locked {
      lastToken += 1
      return lastToken
    }
  }

  func forget(_ token: Int) {
    locked { tapped[token] = nil }
  }

  /// The item now playing (nil: nothing).
  func setCurrent(_ token: Int?) {
    locked {
      currentToken = token ?? -1
      currentSince = CACurrentMediaTime()
    }
  }

  /// Playback (re)started: the tap gets a moment to deliver before the visualizer gives up on it.
  func resumed() {
    locked { currentSince = CACurrentMediaTime() }
  }

  /// Tap `item` once its audio track is known (local files: at once; streams: after the first
  /// bytes). HLS has no tracks to tap.
  func attach(to item: AVPlayerItem, token: Int) {
    item.asset.loadTracks(withMediaType: .audio) { [weak self, weak item] tracks, _ in
      DispatchQueue.main.async {
        guard let self = self, let item = item else { return }
        if let track = tracks?.first, let mix = self.makeMix(track: track, token: token) {
          item.audioMix = mix
          self.locked { self.tapped[token] = true }
        } else {
          self.locked { self.tapped[token] = false }
        }
      }
    }
  }

  private func makeMix(track: AVAssetTrack, token: Int) -> AVAudioMix? {
    let context = TapContext(token: token, levels: self)
    let info = Unmanaged.passRetained(context).toOpaque()
    var callbacks = MTAudioProcessingTapCallbacks(
      version: kMTAudioProcessingTapCallbacksVersion_0,
      clientInfo: info,
      init: tapInit,
      finalize: tapFinalize,
      prepare: tapPrepare,
      unprepare: tapUnprepare,
      process: tapProcess
    )
    let params = AVMutableAudioMixInputParameters(track: track)
    // Swift 6.2 (Xcode 26) imports the created tap as a managed reference; earlier compilers
    // hand back an Unmanaged one.
    #if compiler(>=6.2)
      var tap: MTAudioProcessingTap?
      guard MTAudioProcessingTapCreate(kCFAllocatorDefault, &callbacks, kMTAudioProcessingTapCreationFlag_PreEffects, &tap) == noErr,
            let created = tap else {
        Unmanaged<TapContext>.fromOpaque(info).release()
        return nil
      }
      params.audioTapProcessor = created
    #else
      var tap: Unmanaged<MTAudioProcessingTap>?
      guard MTAudioProcessingTapCreate(kCFAllocatorDefault, &callbacks, kMTAudioProcessingTapCreationFlag_PreEffects, &tap) == noErr,
            let created = tap?.takeRetainedValue() else {
        Unmanaged<TapContext>.fromOpaque(info).release()
        return nil
      }
      params.audioTapProcessor = created
    #endif
    let mix = AVMutableAudioMix()
    mix.inputParameters = [params]
    return mix
  }

  // MARK: - Audio thread

  fileprivate func feed(_ token: Int, _ list: UnsafeMutablePointer<AudioBufferList>, frames: Int, format: TapFormat) {
    let buffers = UnsafeMutableAudioBufferListPointer(list)
    guard frames > 0, buffers.count > 0, let first = buffers[0].mData?.assumingMemoryBound(to: Float.self) else { return }
    let mask = RakkiLevels.fftSize - 1
    if format.interleaved {
      let channels = max(1, format.channels)
      let n = min(frames, Int(buffers[0].mDataByteSize) / (4 * channels))
      let scale = 1 / Float(channels)
      for i in 0..<n {
        var sum: Float = 0
        for c in 0..<channels { sum += first[i * channels + c] }
        ring[ringPos] = sum * scale
        ringPos = (ringPos + 1) & mask
      }
    } else {
      let n = min(frames, Int(buffers[0].mDataByteSize) / 4)
      if buffers.count > 1, let second = buffers[1].mData?.assumingMemoryBound(to: Float.self),
         Int(buffers[1].mDataByteSize) / 4 >= n {
        for i in 0..<n {
          ring[ringPos] = (first[i] + second[i]) * 0.5
          ringPos = (ringPos + 1) & mask
        }
      } else {
        for i in 0..<n {
          ring[ringPos] = first[i]
          ringPos = (ringPos + 1) & mask
        }
      }
    }
    analyze(token, sampleRate: format.sampleRate)
  }

  private func analyze(_ token: Int, sampleRate: Double) {
    let size = RakkiLevels.fftSize
    let half = RakkiLevels.half
    // The newest `size` samples, oldest first, through the Hann window.
    let tail = size - ringPos
    vDSP_vmul(ring + ringPos, 1, window, 1, frame, 1, vDSP_Length(tail))
    if ringPos > 0 {
      vDSP_vmul(ring, 1, window + tail, 1, frame + tail, 1, vDSP_Length(ringPos))
    }
    var split = DSPSplitComplex(realp: real, imagp: imag)
    frame.withMemoryRebound(to: DSPComplex.self, capacity: half) { pairs in
      vDSP_ctoz(pairs, 2, &split, 1, vDSP_Length(half))
    }
    vDSP_fft_zrip(fftSetup, &split, 1, RakkiLevels.fftLog2, FFTDirection(FFT_FORWARD))
    imag[0] = 0 // zrip packs the Nyquist bin here; not used
    vDSP_zvmags(&split, 1, power, 1, vDSP_Length(half))

    if sampleRate != bandRate { layoutBands(sampleRate) }
    // |X| of a full-scale sine: n/2 (FFT) × 0.5 (Hann) × 2 (zrip's scaling).
    let fullScale = Float(size) * 0.5
    for b in 0..<RakkiLevels.bandCount {
      var sum: Float = 0
      for k in bandLo[b]..<bandHi[b] { sum += power[k] }
      let amplitude = sqrtf(sum / Float(bandHi[b] - bandLo[b])) / fullScale
      let db = 20 * log10f(amplitude + 1e-7) + bandTilt[b]
      fresh[b] = min(1, max(0, (db + 62) / 52)) // -62 dB → 0, -10 dB → 1
    }
    os_unfair_lock_lock(lock)
    target.update(from: fresh, count: RakkiLevels.bandCount)
    updatedAt = CACurrentMediaTime()
    sourceToken = token
    os_unfair_lock_unlock(lock)
  }

  /// 32 bands spaced evenly in pitch from 40 Hz to 16 kHz, each at least one FFT bin wide.
  /// Highs get a lift of 3 dB per octave above 1 kHz (music has less energy up there).
  private func layoutBands(_ rate: Double) {
    bandRate = rate
    let low = 40.0
    let high = min(16000, rate * 0.45)
    let binHz = rate / Double(RakkiLevels.fftSize)
    let count = RakkiLevels.bandCount
    for b in 0..<count {
      let f0 = low * pow(high / low, Double(b) / Double(count))
      let f1 = low * pow(high / low, Double(b + 1) / Double(count))
      let lo = min(RakkiLevels.half - 1, max(1, Int(f0 / binHz)))
      let hi = min(RakkiLevels.half, max(lo + 1, Int(f1 / binHz)))
      bandLo[b] = lo
      bandHi[b] = hi
      bandTilt[b] = Float(3 * log2((f0 * f1).squareRoot() / 1000))
    }
  }

  // MARK: - JS thread

  /// `count` levels (0–1, low to high), eased over time; nil when the song playing can't be
  /// tapped or no audio has come through for a second while playing (AirPlay).
  func read(count: Int, playing: Bool) -> [Double]? {
    let n = max(1, min(count, 64))
    os_unfair_lock_lock(lock)
    defer { os_unfair_lock_unlock(lock) }
    if currentToken < 0 { return [Double](repeating: 0, count: n) }
    if tapped[currentToken] == false { return nil }
    let now = CACurrentMediaTime()
    let hasData = sourceToken == currentToken
    let quietFor = now - max(hasData ? updatedAt : 0, currentSince)
    if playing && quietFor > 1 { return nil }

    let dt = Float(min(0.1, max(0, now - readAt)))
    readAt = now
    // Paused (no new audio): the bars sink.
    let age = hasData ? now - updatedAt : 10
    let fade = age > 0.2 ? Float(exp(-(age - 0.2) * 8)) : 1
    var top: Float = 0
    for b in 0..<RakkiLevels.bandCount {
      let goal = target[b] * fade
      let rate: Float = goal > shown[b] ? 30 : 9 // quick to rise, slower to fall
      shown[b] += (goal - shown[b]) * (1 - expf(-rate * dt))
      top = max(top, shown[b])
    }
    // Gentle auto-gain, so quiet songs still move (a quiet passage stays quieter).
    peak = max(top, peak * expf(-dt * 0.4))
    let gain = 1 / max(peak, 0.6)
    var out = [Double](repeating: 0, count: n)
    for i in 0..<n {
      let a = min(RakkiLevels.bandCount - 1, i * RakkiLevels.bandCount / n)
      let b = max(a + 1, (i + 1) * RakkiLevels.bandCount / n)
      var sum: Float = 0
      for k in a..<b { sum += shown[k] }
      out[i] = Double(min(1, sum / Float(b - a) * gain))
    }
    return out
  }
}

/// The audio format a tap was prepared with.
fileprivate struct TapFormat {
  var sampleRate: Double = 44100
  var channels = 2
  var interleaved = false
  var isFloat = false
}

/// Owned by its tap (retained on create, released in finalize).
fileprivate final class TapContext {
  let token: Int
  let levels: RakkiLevels
  var format = TapFormat()

  init(token: Int, levels: RakkiLevels) {
    self.token = token
    self.levels = levels
  }
}

private func context(of tap: MTAudioProcessingTap) -> TapContext {
  Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue()
}

private let tapInit: MTAudioProcessingTapInitCallback = { _, clientInfo, storageOut in
  storageOut.pointee = clientInfo
}

private let tapFinalize: MTAudioProcessingTapFinalizeCallback = { tap in
  Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).release()
}

private let tapPrepare: MTAudioProcessingTapPrepareCallback = { tap, _, format in
  let f = format.pointee
  context(of: tap).format = TapFormat(
    sampleRate: f.mSampleRate,
    channels: Int(f.mChannelsPerFrame),
    interleaved: f.mFormatFlags & kAudioFormatFlagIsNonInterleaved == 0,
    isFloat: f.mFormatFlags & kAudioFormatFlagIsFloat != 0 && f.mBitsPerChannel == 32
  )
}

private let tapUnprepare: MTAudioProcessingTapUnprepareCallback = { _ in }

private let tapProcess: MTAudioProcessingTapProcessCallback = { tap, frames, _, buffers, framesOut, flagsOut in
  guard MTAudioProcessingTapGetSourceAudio(tap, frames, buffers, flagsOut, nil, framesOut) == noErr else { return }
  let ctx = context(of: tap)
  guard ctx.format.isFloat else { return }
  ctx.levels.feed(ctx.token, buffers, frames: Int(framesOut.pointee), format: ctx.format)
}
