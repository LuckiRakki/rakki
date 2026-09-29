import AVFoundation
import MediaPlayer
import QuartzCore
import UIKit

struct RakkiTrack {
  let key: String
  let id: String
  let url: URL
  let title: String
  let artist: String
  let album: String
  let artworkUrl: URL?
  let duration: Double
  let gain: Float

  init?(_ r: TrackRecord) {
    guard let url = URL(string: r.url) else { return nil }
    key = r.key
    id = r.id
    self.url = url
    title = r.title
    artist = r.artist
    album = r.album
    artworkUrl = r.artworkUrl.flatMap { URL(string: $0) }
    duration = r.duration
    gain = Float(max(0, min(1, r.gain)))
  }
}

/// Gapless queue player, modelled on just_audio's iOS engine (what Finamp uses):
/// an AVQueuePlayer fed a small "treadmill" of the current item plus the next `lookahead`
/// items, so the next song is already buffered when the current one ends. Jumping anywhere
/// else rebuilds the treadmill. Lock screen / Control Center commands are handled here
/// natively so they work while JS is suspended; JS is told about everything through events.
///
/// Everything runs on the main thread except `progress()`, which reads a locked snapshot.
final class RakkiPlayer: NSObject {
  var emit: ((String, [String: Any?]) -> Void)?

  private let player = AVQueuePlayer()
  private let lookahead = 2
  private var tracks: [RakkiTrack] = []
  private var index = 0
  private var repeatMode = "off" // off | all | one
  private var userVolume: Float = 1
  /// What the user asked for (play vs pause), independent of buffering.
  private var intendsToPlay = false
  private var wasPlayingBeforeInterruption = false
  private var isRebuilding = false
  /// Set just before a jump so the track-change event carries where the old track stopped.
  private var positionBeforeJump: Double?
  private var lastEndedKey: String?
  private var pendingSeek: Double?

  private var itemKeys: [ObjectIdentifier: String] = [:]
  private var itemObservations: [ObjectIdentifier: NSKeyValueObservation] = [:]
  private var playerObservations: [NSKeyValueObservation] = []
  private var timeObserver: Any?
  private var remoteTargets: [(MPRemoteCommand, Any)] = []

  private var artworkCache: [URL: MPMediaItemArtwork] = [:]
  private var artworkLoading: Set<URL> = []

  // Snapshot for the synchronous `progress()` call from the JS thread.
  private let lock = NSLock()
  private var snapPosition: Double = 0
  private var snapDuration: Double = 0
  private var snapBuffered: Double = 0
  private var snapPlaying = false
  private var snapAt: CFTimeInterval = 0

  override init() {
    super.init()
    player.actionAtItemEnd = .advance
    player.automaticallyWaitsToMinimizeStalling = true
    configureSession()
    observePlayer()
    setupRemoteCommands()
    let center = NotificationCenter.default
    center.addObserver(self, selector: #selector(onInterruption(_:)), name: AVAudioSession.interruptionNotification, object: nil)
    center.addObserver(self, selector: #selector(onRouteChange(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
    center.addObserver(self, selector: #selector(onItemEnded(_:)), name: AVPlayerItem.didPlayToEndTimeNotification, object: nil)
    center.addObserver(self, selector: #selector(onItemFailed(_:)), name: AVPlayerItem.failedToPlayToEndTimeNotification, object: nil)
  }

  func teardown() {
    NotificationCenter.default.removeObserver(self)
    if let timeObserver = timeObserver {
      player.removeTimeObserver(timeObserver)
    }
    timeObserver = nil
    playerObservations.forEach { $0.invalidate() }
    playerObservations = []
    for (command, target) in remoteTargets {
      command.removeTarget(target)
    }
    remoteTargets = []
    player.pause()
    removeAllItems()
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
  }

  // MARK: - Public API (main thread)

  func setQueue(_ newTracks: [RakkiTrack], startIndex: Int, startPosition: Double, autoplay: Bool) {
    if player.currentItem != nil {
      positionBeforeJump = snapshotPosition()
    }
    tracks = newTracks
    guard !tracks.isEmpty else {
      stop()
      return
    }
    let target = max(0, min(startIndex, tracks.count - 1))
    jump(to: target, position: startPosition)
    if autoplay {
      play()
    } else {
      emitState()
    }
  }

  /// Replace the queue without interrupting the current song (reorder, add, remove, shuffle).
  /// The current entry is found by its key; upcoming buffered items are rebuilt if needed.
  func updateQueue(_ newTracks: [RakkiTrack]) {
    let currentKey = currentItemKey()
    tracks = newTracks
    guard !tracks.isEmpty else {
      stop()
      return
    }
    if let key = currentKey, let i = tracks.firstIndex(where: { $0.key == key }) {
      index = i
      fillTreadmill()
      updateNowPlaying()
      emitState()
    } else {
      // The playing entry was removed: continue with whatever now sits at its position.
      positionBeforeJump = snapshotPosition()
      jump(to: min(index, tracks.count - 1), position: 0)
      if intendsToPlay { player.play() }
      emitState()
    }
  }

  func play() {
    guard !tracks.isEmpty else { return }
    if player.currentItem == nil {
      jump(to: min(index, tracks.count - 1), position: 0)
    }
    activateSession()
    intendsToPlay = true
    player.play()
    emitState()
    updateNowPlaying()
  }

  func pause() {
    intendsToPlay = false
    player.pause()
    emitState()
    updateNowPlaying()
  }

  func togglePlayPause() {
    if intendsToPlay { pause() } else { play() }
  }

  func stop() {
    intendsToPlay = false
    player.pause()
    removeAllItems()
    tracks = []
    index = 0
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    writeSnapshot(position: 0, duration: 0, buffered: 0, playing: false)
    emitState()
  }

  /// Manual "next": always moves on, even in repeat-one (like Finamp).
  func skipToNext() {
    guard !tracks.isEmpty else { return }
    let next: Int?
    if index + 1 < tracks.count {
      next = index + 1
    } else if repeatMode != "off" {
      next = 0
    } else {
      next = nil
    }
    guard let target = next else {
      // End of the queue: park on the last song, paused, like Spotify.
      pause()
      seek(to: 0)
      return
    }
    positionBeforeJump = snapshotPosition()
    let items = player.items()
    if items.count > 1, let nextKey = itemKeys[ObjectIdentifier(items[1])], nextKey == tracks[target].key, repeatMode != "one" {
      // Already buffered: advance instantly.
      player.advanceToNextItem()
    } else {
      jump(to: target, position: 0)
    }
    if intendsToPlay { player.play() }
  }

  /// Restart the song if we're more than 3 s in, otherwise go to the previous one.
  func skipToPrevious() {
    guard !tracks.isEmpty else { return }
    if snapshotPosition() > 3 || (index == 0 && repeatMode == "off") {
      seek(to: 0)
      return
    }
    let target = index > 0 ? index - 1 : tracks.count - 1
    positionBeforeJump = snapshotPosition()
    jump(to: target, position: 0)
    if intendsToPlay { player.play() }
  }

  func skipTo(_ target: Int) {
    guard target >= 0, target < tracks.count else { return }
    positionBeforeJump = snapshotPosition()
    jump(to: target, position: 0)
    if intendsToPlay { player.play() }
  }

  func seek(to seconds: Double) {
    guard let item = player.currentItem else { return }
    let time = CMTime(seconds: max(0, seconds), preferredTimescale: 1000)
    if item.status == .readyToPlay {
      player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
        DispatchQueue.main.async {
          self?.refreshSnapshot()
          self?.updateNowPlaying()
          self?.emitState()
        }
      }
    } else {
      pendingSeek = seconds
    }
    writeSnapshot(position: seconds, duration: snapDurationValue(), buffered: 0, playing: player.rate != 0)
  }

  func setRepeatMode(_ mode: String) {
    repeatMode = ["off", "all", "one"].contains(mode) ? mode : "off"
    fillTreadmill()
    emitState()
  }

  func setUserVolume(_ volume: Double) {
    userVolume = Float(max(0, min(1, volume)))
    applyVolume()
  }

  func progress() -> [String: Any] {
    lock.lock()
    defer { lock.unlock() }
    var position = snapPosition
    if snapPlaying {
      position += CACurrentMediaTime() - snapAt
    }
    if snapDuration > 0 {
      position = min(position, snapDuration)
    }
    return ["position": position, "duration": snapDuration, "buffered": snapBuffered, "playing": snapPlaying]
  }

  // MARK: - Treadmill

  private func jump(to target: Int, position: Double) {
    let previousKey = currentItemKey()
    isRebuilding = true
    removeAllItems()
    index = target
    let item = makeItem(tracks[target])
    player.insert(item, after: nil)
    if position > 0 {
      pendingSeek = position
    }
    isRebuilding = false
    fillTreadmill()
    applyVolume()
    didChangeTrack(reason: "skip", previousKey: previousKey)
  }

  /// Automatic next index when a song ends naturally.
  private func autoNextIndex(after i: Int) -> Int? {
    if repeatMode == "one" { return i }
    if i + 1 < tracks.count { return i + 1 }
    if repeatMode == "all" && !tracks.isEmpty { return 0 }
    return nil
  }

  /// Make sure the items after the current one are exactly the next `lookahead` songs.
  private func fillTreadmill() {
    guard !tracks.isEmpty, player.currentItem != nil else { return }
    var expected: [Int] = []
    var i = index
    for _ in 0..<lookahead {
      guard let n = autoNextIndex(after: i) else { break }
      expected.append(n)
      i = n
    }
    let upcoming = Array(player.items().dropFirst())
    let upcomingKeys = upcoming.map { itemKeys[ObjectIdentifier($0)] }
    let expectedKeys = expected.map { tracks[$0].key }
    let prefixMatches = upcomingKeys.count <= expectedKeys.count
      && zip(upcomingKeys, expectedKeys).allSatisfy { $0 == $1 }
    if prefixMatches {
      for n in expected.dropFirst(upcoming.count) {
        player.insert(makeItem(tracks[n]), after: nil)
      }
    } else {
      for item in upcoming {
        player.remove(item)
        forget(item)
      }
      for n in expected {
        player.insert(makeItem(tracks[n]), after: nil)
      }
    }
  }

  private func makeItem(_ track: RakkiTrack) -> AVPlayerItem {
    let item = AVPlayerItem(url: track.url)
    let id = ObjectIdentifier(item)
    itemKeys[id] = track.key
    itemObservations[id] = item.observe(\.status, options: [.new]) { [weak self] item, _ in
      onMain {
        self?.itemStatusChanged(item)
      }
    }
    return item
  }

  private func forget(_ item: AVPlayerItem) {
    let id = ObjectIdentifier(item)
    itemObservations[id]?.invalidate()
    itemObservations[id] = nil
    itemKeys[id] = nil
  }

  private func removeAllItems() {
    let old = player.items()
    player.removeAllItems()
    old.forEach { forget($0) }
  }

  private func currentItemKey() -> String? {
    guard let item = player.currentItem else { return nil }
    return itemKeys[ObjectIdentifier(item)]
  }

  // MARK: - Observation

  private func observePlayer() {
    playerObservations.append(player.observe(\.currentItem, options: [.new]) { [weak self] _, _ in
      onMain {
        self?.currentItemChanged()
      }
    })
    playerObservations.append(player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
      onMain {
        self?.refreshSnapshot()
        self?.emitState()
        self?.updateNowPlaying()
      }
    })
    timeObserver = player.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 0.25, preferredTimescale: 1000),
      queue: .main
    ) { [weak self] _ in
      self?.refreshSnapshot()
    }
  }

  private func currentItemChanged() {
    if isRebuilding { return }
    guard let key = currentItemKey() else {
      // Nothing left to play: the queue ran out with repeat off.
      if !tracks.isEmpty && player.items().isEmpty {
        let last = tracks.count - 1
        let finishedKey = lastEndedKey
        let finishedDuration: Double? = finishedKey.flatMap { k in tracks.first(where: { $0.key == k })?.duration }
        intendsToPlay = false
        player.pause()
        isRebuilding = true
        index = last
        player.insert(makeItem(tracks[last]), after: nil)
        isRebuilding = false
        applyVolume()
        emit?("onTrackChange", [
          "index": index,
          "key": tracks[index].key,
          "id": tracks[index].id,
          "previousKey": finishedKey,
          "previousPosition": finishedDuration,
          "reason": "queueEnded",
        ])
        lastEndedKey = nil
        emitState(ended: true)
        updateNowPlaying()
      }
      return
    }
    guard let i = tracks.firstIndex(where: { $0.key == key }) else { return }
    let previousKey = tracks.indices.contains(index) ? tracks[index].key : nil
    let naturallyEnded = lastEndedKey != nil
    index = i
    if naturallyEnded || previousKey != key {
      fillTreadmill()
      applyVolume()
      didChangeTrack(reason: naturallyEnded ? "ended" : "skip", previousKey: previousKey)
    }
  }

  private func didChangeTrack(reason: String, previousKey explicitPrevious: String? = nil) {
    let previousKey = explicitPrevious ?? lastEndedKey
    var previousPosition: Double? = positionBeforeJump
    if reason == "ended", let endedKey = lastEndedKey,
       let ended = tracks.first(where: { $0.key == endedKey }) {
      previousPosition = ended.duration
    }
    positionBeforeJump = nil
    lastEndedKey = nil
    guard tracks.indices.contains(index) else { return }
    let track = tracks[index]
    writeSnapshot(position: pendingSeek ?? 0, duration: track.duration, buffered: 0, playing: player.rate != 0)
    emit?("onTrackChange", [
      "index": index,
      "key": track.key,
      "id": track.id,
      "previousKey": previousKey,
      "previousPosition": previousPosition,
      "reason": reason,
    ])
    updateNowPlaying()
    emitState()
  }

  private func itemStatusChanged(_ item: AVPlayerItem) {
    switch item.status {
    case .readyToPlay:
      if item == player.currentItem, let seconds = pendingSeek {
        pendingSeek = nil
        seek(to: seconds)
      }
      refreshSnapshot()
      updateNowPlaying()
    case .failed:
      let key = itemKeys[ObjectIdentifier(item)]
      emit?("onError", [
        "key": key,
        "index": key.flatMap { k in self.tracks.firstIndex(where: { $0.key == k }) },
        "message": item.error?.localizedDescription ?? "This song couldn't be played.",
      ])
    default:
      break
    }
  }

  @objc private func onItemEnded(_ note: Notification) {
    guard let item = note.object as? AVPlayerItem else { return }
    onMain {
      guard let key = self.itemKeys[ObjectIdentifier(item)] else { return }
      self.lastEndedKey = key
    }
  }

  @objc private func onItemFailed(_ note: Notification) {
    guard let item = note.object as? AVPlayerItem else { return }
    let error = note.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error
    DispatchQueue.main.async {
      let key = self.itemKeys[ObjectIdentifier(item)]
      self.emit?("onError", [
        "key": key,
        "index": key.flatMap { k in self.tracks.firstIndex(where: { $0.key == k }) },
        "message": error?.localizedDescription ?? "Playback stopped unexpectedly.",
      ])
    }
  }

  // MARK: - State + progress

  private func emitState(ended: Bool = false) {
    let buffering = player.timeControlStatus == .waitingToPlayAtSpecifiedRate
    let currentIndex: Int? = tracks.isEmpty ? nil : index
    let currentKey: String? = tracks.indices.contains(index) ? tracks[index].key : nil
    emit?("onState", [
      "playing": intendsToPlay,
      "buffering": intendsToPlay && buffering,
      "index": currentIndex,
      "key": currentKey,
      "repeatMode": repeatMode,
      "ended": ended,
    ])
  }

  private func refreshSnapshot() {
    guard let item = player.currentItem else { return }
    let position = CMTimeGetSeconds(player.currentTime())
    let itemDuration = CMTimeGetSeconds(item.duration)
    let fallback = tracks.indices.contains(index) ? tracks[index].duration : 0
    let duration = itemDuration.isFinite && itemDuration > 0 ? itemDuration : fallback
    var buffered = 0.0
    if let range = item.loadedTimeRanges.first?.timeRangeValue {
      buffered = CMTimeGetSeconds(CMTimeRangeGetEnd(range))
    }
    let playing = player.timeControlStatus == .playing
    writeSnapshot(position: position.isFinite ? position : 0, duration: duration, buffered: buffered, playing: playing)
  }

  private func writeSnapshot(position: Double, duration: Double, buffered: Double, playing: Bool) {
    lock.lock()
    snapPosition = position
    snapDuration = duration
    snapBuffered = buffered
    snapPlaying = playing
    snapAt = CACurrentMediaTime()
    lock.unlock()
  }

  private func snapshotPosition() -> Double {
    return (progress()["position"] as? Double) ?? 0
  }

  private func snapDurationValue() -> Double {
    lock.lock()
    defer { lock.unlock() }
    return snapDuration
  }

  private func applyVolume() {
    let gain = tracks.indices.contains(index) ? tracks[index].gain : 1
    player.volume = userVolume * gain
  }

  // MARK: - Audio session

  private func configureSession() {
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playback, mode: .default, policy: .longFormAudio, options: [])
  }

  private func activateSession() {
    try? AVAudioSession.sharedInstance().setActive(true)
  }

  @objc private func onInterruption(_ note: Notification) {
    guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
    let optionsRaw = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
    DispatchQueue.main.async {
      switch type {
      case .began:
        // A call, Siri or another app took the audio. iOS has already paused us.
        self.wasPlayingBeforeInterruption = self.intendsToPlay
        self.intendsToPlay = false
        self.emitState()
        self.updateNowPlaying()
      case .ended:
        let options = AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
        if options.contains(.shouldResume) && self.wasPlayingBeforeInterruption {
          self.play()
        }
        self.wasPlayingBeforeInterruption = false
      @unknown default:
        break
      }
    }
  }

  @objc private func onRouteChange(_ note: Notification) {
    guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
    if reason == .oldDeviceUnavailable {
      // Headphones unplugged / Bluetooth or car disconnected: pause, don't blast the speaker.
      DispatchQueue.main.async {
        self.pause()
      }
    }
  }

  // MARK: - Lock screen / Control Center

  private func setupRemoteCommands() {
    let center = MPRemoteCommandCenter.shared()
    func handle(_ command: MPRemoteCommand, _ action: @escaping (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus) {
      command.isEnabled = true
      let target = command.addTarget(handler: action)
      remoteTargets.append((command, target))
    }
    handle(center.playCommand) { [weak self] _ in
      self?.play()
      return .success
    }
    handle(center.pauseCommand) { [weak self] _ in
      self?.pause()
      return .success
    }
    handle(center.togglePlayPauseCommand) { [weak self] _ in
      self?.togglePlayPause()
      return .success
    }
    handle(center.nextTrackCommand) { [weak self] _ in
      self?.skipToNext()
      return .success
    }
    handle(center.previousTrackCommand) { [weak self] _ in
      self?.skipToPrevious()
      return .success
    }
    handle(center.changePlaybackPositionCommand) { [weak self] event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
      self?.seek(to: event.positionTime)
      return .success
    }
    center.skipForwardCommand.isEnabled = false
    center.skipBackwardCommand.isEnabled = false
  }

  private func updateNowPlaying() {
    guard tracks.indices.contains(index), player.currentItem != nil else {
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
      return
    }
    let track = tracks[index]
    let snapshot = progress()
    var info: [String: Any] = [
      MPMediaItemPropertyTitle: track.title,
      MPMediaItemPropertyArtist: track.artist,
      MPMediaItemPropertyAlbumTitle: track.album,
      MPMediaItemPropertyPlaybackDuration: (snapshot["duration"] as? Double) ?? track.duration,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: (snapshot["position"] as? Double) ?? 0,
      MPNowPlayingInfoPropertyPlaybackRate: player.timeControlStatus == .playing ? 1.0 : 0.0,
      MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0,
      MPNowPlayingInfoPropertyPlaybackQueueIndex: index,
      MPNowPlayingInfoPropertyPlaybackQueueCount: tracks.count,
      MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
    ]
    if let url = track.artworkUrl {
      if let artwork = artworkCache[url] {
        info[MPMediaItemPropertyArtwork] = artwork
      } else {
        loadArtwork(url)
      }
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  private func loadArtwork(_ url: URL) {
    guard !artworkLoading.contains(url) else { return }
    artworkLoading.insert(url)
    URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
      guard let data = data, let image = UIImage(data: data) else {
        DispatchQueue.main.async { self?.artworkLoading.remove(url) }
        return
      }
      let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
      DispatchQueue.main.async {
        guard let self = self else { return }
        self.artworkLoading.remove(url)
        if self.artworkCache.count > 40 { self.artworkCache.removeAll() }
        self.artworkCache[url] = artwork
        if self.tracks.indices.contains(self.index), self.tracks[self.index].artworkUrl == url {
          self.updateNowPlaying()
        }
      }
    }.resume()
  }
}

/// Run now if already on the main thread (keeps ordering with our own synchronous changes),
/// otherwise hop to main.
private func onMain(_ block: @escaping () -> Void) {
  if Thread.isMainThread {
    block()
  } else {
    DispatchQueue.main.async(execute: block)
  }
}
