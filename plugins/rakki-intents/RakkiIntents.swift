// Rakki 2.0: the App Intents behind the Control Center and Lock Screen controls (and Shortcuts).
// Copied by plugins/withRakkiIntents.js into both the app and the widget extension: the system
// runs an AudioPlaybackIntent in the app's process when the app has it too, so a tap plays,
// skips or likes without opening Rakki. Each intent only hands its action to the app
// (modules/rakki-audio/ios/RakkiIntentInbox.swift); the app does it (src/widgets/actions.ts).
import AppIntents
import Foundation

enum RakkiIntentOutbox {
  static let key = "rakki.intents"
  static let bell = "com.luckirakki.rakki.intent"

  /// The settings the app and the widgets share (the app group expo-widgets set up).
  static var shared: UserDefaults? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String,
          !group.isEmpty else { return nil }
    return UserDefaults(suiteName: group)
  }

  /// Queue the action, ring the app, and wait a moment for it to be picked up: the app may be
  /// starting up in the background to do it.
  static func send(_ action: String) async {
    guard let defaults = shared else { return }
    var list = defaults.stringArray(forKey: key) ?? []
    list.append("\(action)|\(Int(Date().timeIntervalSince1970 * 1000))")
    defaults.set(list, forKey: key)
    defaults.synchronize()
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(bell as CFString),
      nil,
      nil,
      true
    )
    for _ in 0..<60 {
      if (defaults.stringArray(forKey: key) ?? []).isEmpty { return }
      try? await Task.sleep(nanoseconds: 100_000_000)
    }
  }
}

@available(iOS 17.0, *)
struct RakkiPlayPauseIntent: AudioPlaybackIntent {
  static let title: LocalizedStringResource = "Play or Pause"
  static let description = IntentDescription("Plays or pauses Rakki.")

  init() {}

  func perform() async throws -> some IntentResult {
    await RakkiIntentOutbox.send("playpause")
    return .result()
  }
}

@available(iOS 17.0, *)
struct RakkiNextIntent: AudioPlaybackIntent {
  static let title: LocalizedStringResource = "Next Song"
  static let description = IntentDescription("Skips to the next song in Rakki.")

  init() {}

  func perform() async throws -> some IntentResult {
    await RakkiIntentOutbox.send("next")
    return .result()
  }
}

@available(iOS 17.0, *)
struct RakkiShuffleAllIntent: AudioPlaybackIntent {
  static let title: LocalizedStringResource = "Shuffle All"
  static let description = IntentDescription("Shuffles your whole library in Rakki.")

  init() {}

  func perform() async throws -> some IntentResult {
    await RakkiIntentOutbox.send("shuffle")
    return .result()
  }
}

@available(iOS 17.0, *)
struct RakkiDailyMixIntent: AudioPlaybackIntent {
  static let title: LocalizedStringResource = "Play Daily Mix"
  static let description = IntentDescription("Plays your first Daily Mix in Rakki.")

  init() {}

  func perform() async throws -> some IntentResult {
    await RakkiIntentOutbox.send("mix")
    return .result()
  }
}

@available(iOS 17.0, *)
struct RakkiLikeIntent: AudioPlaybackIntent {
  static let title: LocalizedStringResource = "Like the Song Playing"
  static let description = IntentDescription("Likes the song Rakki is playing, or unlikes it.")

  init() {}

  func perform() async throws -> some IntentResult {
    await RakkiIntentOutbox.send("like")
    return .result()
  }
}

@available(iOS 17.0, *)
struct RakkiSleepIntent: AudioPlaybackIntent {
  static let title: LocalizedStringResource = "Add 15 Minutes to the Sleep Timer"
  static let description = IntentDescription("Starts Rakki's sleep timer, or adds 15 minutes to it.")

  init() {}

  func perform() async throws -> some IntentResult {
    await RakkiIntentOutbox.send("sleep")
    return .result()
  }
}

@available(iOS 17.0, *)
struct RakkiOpenPlayerIntent: AppIntent {
  static let title: LocalizedStringResource = "Open the Player"
  static let description = IntentDescription("Opens Rakki on the player.")
  static let openAppWhenRun: Bool = true

  init() {}

  func perform() async throws -> some IntentResult {
    await RakkiIntentOutbox.send("player")
    return .result()
  }
}
