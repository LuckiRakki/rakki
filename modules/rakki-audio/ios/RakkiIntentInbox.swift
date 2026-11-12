import ExpoModulesCore
import Foundation

/// The app's side of the Control Center and Lock Screen controls (Rakki 2.0). Their App Intents
/// (plugins/withRakkiIntents.js) write the action into the app group's settings, the folder the
/// widgets share with the app, and ring a Darwin notification, which reaches the app whichever
/// process the intent ran in. JS then takes the actions (takeIntents) and runs them
/// (src/widgets/actions.ts). Taking them empties the list, which tells the intent it was heard.
enum RakkiIntentInbox {
  static let key = "rakki.intents"
  static let bell = "com.luckirakki.rakki.intent"

  private static weak var module: RakkiAudioModule?
  private static var listening = false
  private static let lock = NSLock()

  /// The settings shared with the widget extension (the group expo-widgets set up).
  static var shared: UserDefaults? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String,
          !group.isEmpty else { return nil }
    return UserDefaults(suiteName: group)
  }

  static func listen(_ owner: RakkiAudioModule) {
    lock.lock()
    defer { lock.unlock() }
    module = owner
    if listening { return }
    listening = true
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(RakkiIntentBell.shared).toOpaque(),
      { _, _, _, _, _ in
        DispatchQueue.main.async {
          RakkiIntentInbox.ring()
        }
      },
      bell as CFString,
      nil,
      .deliverImmediately
    )
  }

  private static func ring() {
    lock.lock()
    let owner = module
    lock.unlock()
    owner?.sendEvent("onIntent", [:])
  }

  static func take() -> [String] {
    guard let defaults = shared else { return [] }
    let list = defaults.stringArray(forKey: key) ?? []
    if !list.isEmpty {
      defaults.removeObject(forKey: key)
    }
    return list
  }
}

/// Only an address to register the Darwin observer under.
final class RakkiIntentBell {
  static let shared = RakkiIntentBell()
}
