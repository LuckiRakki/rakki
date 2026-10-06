import AVKit
import ExpoModulesCore

/// One queue entry sent from JS. `key` is unique per queue entry (the same song can be queued
/// twice); `id` is the Jellyfin item id.
struct TrackRecord: Record {
  @Field var key: String = ""
  @Field var id: String = ""
  @Field var url: String = ""
  @Field var title: String = ""
  @Field var artist: String = ""
  @Field var album: String = ""
  @Field var artworkUrl: String? = nil
  /// Seconds, from Jellyfin's RunTimeTicks; used until the stream reports its own duration.
  @Field var duration: Double = 0
  /// Linear volume factor for normalization (1 = unchanged). iOS can only attenuate.
  @Field var gain: Double = 1
  /// A live stream (radio): the lock screen shows it as live, with stop and no skip or seek.
  @Field var live: Bool = false
}

public class RakkiAudioModule: Module {
  private var player: RakkiPlayer?
  private let playerLock = NSLock()

  /// Created lazily on the main thread (every AsyncFunction below runs on main).
  private func ensurePlayer() -> RakkiPlayer {
    if let existing = currentPlayer() {
      return existing
    }
    let created = RakkiPlayer()
    created.emit = { [weak self] name, body in
      self?.sendEvent(name, body)
    }
    playerLock.lock()
    player = created
    playerLock.unlock()
    return created
  }

  private func currentPlayer() -> RakkiPlayer? {
    playerLock.lock()
    defer { playerLock.unlock() }
    return player
  }

  public func definition() -> ModuleDefinition {
    Name("RakkiAudio")

    Events("onState", "onTrackChange", "onError")

    // iOS's daily reports (MetricKit) start collecting as soon as the app runs.
    OnCreate {
      RakkiMetrics.shared.start()
    }

    OnDestroy {
      let existing = self.currentPlayer()
      DispatchQueue.main.async {
        existing?.teardown()
      }
    }

    AsyncFunction("setQueue") { (tracks: [TrackRecord], startIndex: Int, startPosition: Double, autoplay: Bool) in
      let converted = tracks.compactMap { RakkiTrack($0) }
      self.ensurePlayer().setQueue(converted, startIndex: startIndex, startPosition: startPosition, autoplay: autoplay)
    }.runOnQueue(.main)

    AsyncFunction("updateQueue") { (tracks: [TrackRecord]) in
      let converted = tracks.compactMap { RakkiTrack($0) }
      self.ensurePlayer().updateQueue(converted)
    }.runOnQueue(.main)

    AsyncFunction("play") {
      self.ensurePlayer().play()
    }.runOnQueue(.main)

    AsyncFunction("pause") {
      self.ensurePlayer().pause()
    }.runOnQueue(.main)

    AsyncFunction("togglePlayPause") {
      self.ensurePlayer().togglePlayPause()
    }.runOnQueue(.main)

    AsyncFunction("skipToNext") {
      self.ensurePlayer().skipToNext()
    }.runOnQueue(.main)

    AsyncFunction("skipToPrevious") {
      self.ensurePlayer().skipToPrevious()
    }.runOnQueue(.main)

    AsyncFunction("skipTo") { (index: Int) in
      self.ensurePlayer().skipTo(index)
    }.runOnQueue(.main)

    AsyncFunction("seekTo") { (seconds: Double) in
      self.ensurePlayer().seek(to: seconds)
    }.runOnQueue(.main)

    AsyncFunction("setRepeatMode") { (mode: String) in
      self.ensurePlayer().setRepeatMode(mode)
    }.runOnQueue(.main)

    AsyncFunction("setVolume") { (volume: Double) in
      self.ensurePlayer().setUserVolume(volume)
    }.runOnQueue(.main)

    AsyncFunction("stop") {
      self.ensurePlayer().stop()
    }.runOnQueue(.main)

    /// Synchronous and cheap (reads a locked snapshot): safe to call every animation frame.
    Function("getProgress") { () -> [String: Any] in
      guard let existing = self.currentPlayer() else {
        return ["position": 0.0, "duration": 0.0, "buffered": 0.0, "playing": false]
      }
      return existing.progress()
    }

    /// Synchronous, for the visualizer every frame: `count` band levels (0–1, low to high) of
    /// what's playing, or null when it can't be tapped (HLS, AirPlay): then it simulates.
    Function("getLevels") { (count: Int) -> [Double]? in
      self.currentPlayer()?.levels(count: count)
    }

    /// The performance log's hardware readings: CPU seconds used, memory, thermal state,
    /// battery, Low Power Mode and screen brightness (src/perf).
    AsyncFunction("deviceStats") { () -> [String: Any] in
      RakkiDeviceStats.snapshot()
    }.runOnQueue(.main)

    /// iOS's daily MetricKit reports kept since the last call (JSON text each), then forgotten.
    Function("takeMetricReports") { () -> [String] in
      RakkiMetrics.shared.take()
    }

    /// Keeps a folder (and everything in it) out of iCloud and computer backups: downloads can
    /// always be fetched again, so they shouldn't fill up the user's iCloud storage.
    Function("excludeFromBackup") { (uri: String) -> Bool in
      var url = URL(string: uri).flatMap { $0.isFileURL ? $0 : nil } ?? URL(fileURLWithPath: uri)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      do {
        try url.setResourceValues(values)
        return true
      } catch {
        return false
      }
    }

    View(RakkiRoutePickerView.self) {
      Prop("tintColor") { (view: RakkiRoutePickerView, color: UIColor) in
        view.picker.tintColor = color
      }
      Prop("activeTintColor") { (view: RakkiRoutePickerView, color: UIColor) in
        view.picker.activeTintColor = color
      }
    }
  }
}

/// The system AirPlay / output picker button.
public final class RakkiRoutePickerView: ExpoView {
  let picker = AVRoutePickerView()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    picker.prioritizesVideoDevices = false
    picker.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    clipsToBounds = true
    addSubview(picker)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    picker.frame = bounds
  }
}
