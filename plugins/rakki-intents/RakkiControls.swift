// Rakki 2.0: Control Center and Lock Screen controls (iOS 18). Added to the widget extension by
// plugins/withRakkiIntents.js, after RakkiIntents.swift, and listed in the extension's widget
// bundle as RakkiControls().body.
import SwiftUI
import WidgetKit

@available(iOS 18.0, *)
struct RakkiShuffleAllControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.luckirakki.rakki.control.shuffle") {
      ControlWidgetButton(action: RakkiShuffleAllIntent()) {
        Label("Shuffle All", systemImage: "shuffle")
      }
    }
    .displayName("Shuffle All")
    .description("Shuffles your whole library.")
  }
}

@available(iOS 18.0, *)
struct RakkiDailyMixControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.luckirakki.rakki.control.mix") {
      ControlWidgetButton(action: RakkiDailyMixIntent()) {
        Label("Daily Mix", systemImage: "radio")
      }
    }
    .displayName("Daily Mix")
    .description("Plays your first Daily Mix.")
  }
}

@available(iOS 18.0, *)
struct RakkiPlayPauseControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.luckirakki.rakki.control.playpause") {
      ControlWidgetButton(action: RakkiPlayPauseIntent()) {
        Label("Play and Pause", systemImage: "playpause.fill")
      }
    }
    .displayName("Play and Pause")
    .description("Plays or pauses Rakki.")
  }
}

@available(iOS 18.0, *)
struct RakkiNextControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.luckirakki.rakki.control.next") {
      ControlWidgetButton(action: RakkiNextIntent()) {
        Label("Next Song", systemImage: "forward.fill")
      }
    }
    .displayName("Next Song")
    .description("Skips to the next song.")
  }
}

@available(iOS 18.0, *)
struct RakkiLikeControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.luckirakki.rakki.control.like") {
      ControlWidgetButton(action: RakkiLikeIntent()) {
        Label("Like", systemImage: "heart")
      }
    }
    .displayName("Like")
    .description("Likes the song playing.")
  }
}

@available(iOS 18.0, *)
struct RakkiSleepControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.luckirakki.rakki.control.sleep") {
      ControlWidgetButton(action: RakkiSleepIntent()) {
        Label("Sleep Timer", systemImage: "moon.fill")
      }
    }
    .displayName("Sleep Timer")
    .description("Starts the sleep timer, or adds 15 minutes.")
  }
}

@available(iOS 18.0, *)
struct RakkiOpenPlayerControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.luckirakki.rakki.control.player") {
      ControlWidgetButton(action: RakkiOpenPlayerIntent()) {
        Label("Open Player", systemImage: "music.note")
      }
    }
    .displayName("Open Player")
    .description("Opens Rakki on the player.")
  }
}

@available(iOS 18.0, *)
struct RakkiControls: WidgetBundle {
  var body: some Widget {
    RakkiShuffleAllControl()
    RakkiDailyMixControl()
    RakkiPlayPauseControl()
    RakkiNextControl()
    RakkiLikeControl()
    RakkiSleepControl()
    RakkiOpenPlayerControl()
  }
}
