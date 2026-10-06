import Foundation
import MetricKit
import UIKit

/// What the phone's hardware is doing, for Rakki's performance log (src/perf): CPU time used
/// by the app, its memory, the phone's temperature state, battery and screen brightness. Read
/// on demand (about once a minute), so it costs nothing in between.
enum RakkiDeviceStats {
  /// Main thread (UIDevice, UIScreen).
  static func snapshot() -> [String: Any] {
    var out: [String: Any] = [:]

    // CPU seconds this process has used (user + system, all threads) since launch: the change
    // between two samples over the time between them is the CPU load (1.0 = one core flat out).
    var usage = rusage()
    if getrusage(RUSAGE_SELF, &usage) == 0 {
      let user = Double(usage.ru_utime.tv_sec) + Double(usage.ru_utime.tv_usec) / 1_000_000
      let system = Double(usage.ru_stime.tv_sec) + Double(usage.ru_stime.tv_usec) / 1_000_000
      out["cpuSeconds"] = user + system
    }

    // Memory as iOS counts it against the app (what gets an app killed when it's too high).
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
    let result = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
      }
    }
    if result == KERN_SUCCESS {
      out["memoryMB"] = Double(info.phys_footprint) / 1_048_576
    }

    let process = ProcessInfo.processInfo
    // 0 nominal, 1 fair, 2 serious (iOS starts slowing things down), 3 critical.
    out["thermal"] = process.thermalState.rawValue
    out["lowPower"] = process.isLowPowerModeEnabled

    let device = UIDevice.current
    if !device.isBatteryMonitoringEnabled {
      device.isBatteryMonitoringEnabled = true
    }
    // 0–1 in 5% steps; -1 when unknown.
    out["battery"] = Double(device.batteryLevel)
    // 0 unknown, 1 on battery, 2 charging, 3 full.
    out["batteryState"] = device.batteryState.rawValue
    out["brightness"] = Double(UIScreen.main.brightness)
    return out
  }
}

/// iOS's own daily reports about the app (MetricKit): CPU and GPU time, screen time, network,
/// time playing audio in the background, why it was closed in the background (like being
/// killed for using too much CPU), plus hang and crash diagnostics. iOS delivers them about
/// once a day; they're kept as JSON files until the performance log collects them.
final class RakkiMetrics: NSObject, MXMetricManagerSubscriber {
  static let shared = RakkiMetrics()

  private let queue = DispatchQueue(label: "rakki.metrics")
  private var started = false

  private var folder: URL? {
    guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
      return nil
    }
    let url = base.appendingPathComponent("rakki-metrics", isDirectory: true)
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  func start() {
    queue.sync {
      guard !started else { return }
      started = true
      MXMetricManager.shared.add(self)
    }
  }

  func didReceive(_ payloads: [MXMetricPayload]) {
    for payload in payloads {
      save(payload.jsonRepresentation(), name: "metrics-\(Int(payload.timeStampEnd.timeIntervalSince1970))")
    }
  }

  func didReceive(_ payloads: [MXDiagnosticPayload]) {
    for payload in payloads {
      save(payload.jsonRepresentation(), name: "diagnostics-\(Int(payload.timeStampEnd.timeIntervalSince1970))")
    }
  }

  private func save(_ data: Data, name: String) {
    queue.async {
      // Diagnostics with long call stacks can be big; the log has no use for more than this.
      guard let folder = self.folder, data.count < 600_000 else { return }
      try? data.write(to: folder.appendingPathComponent("\(name).json"), options: .atomic)
    }
  }

  /// Every report kept so far, as JSON text; they're deleted once handed over.
  func take() -> [String] {
    queue.sync {
      guard let folder = self.folder,
        let files = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
      else {
        return []
      }
      var out: [String] = []
      for file in files.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) where file.pathExtension == "json" {
        if let data = try? Data(contentsOf: file), let text = String(data: data, encoding: .utf8) {
          out.append(text)
        }
        try? FileManager.default.removeItem(at: file)
      }
      return out
    }
  }
}
