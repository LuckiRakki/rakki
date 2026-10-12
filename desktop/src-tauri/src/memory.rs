// While Rakki is out of sight (hidden in the tray, or minimized), the interface sleeps: the page
// stops its timers and redraws (window://hidden), and on Windows the webview is told it isn't
// visible (so nothing renders) and to keep its memory low (WebView2's low memory target, which
// trims caches and lets Windows page out what it can). Music isn't affected: mpv plays on its
// own, and the page still hears its events.
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, Manager};

static AWAY: AtomicBool = AtomicBool::new(false);

/// The window went out of sight (`true`) or came back. Repeats are ignored.
pub fn set_away(app: &AppHandle, away: bool) {
    if AWAY.swap(away, Ordering::SeqCst) == away {
        return;
    }
    let _ = app.emit(if away { "window://hidden" } else { "window://shown" }, ());
    if let Some(window) = app.get_webview_window("main") {
        webview_away(&window, away);
    }
}

#[cfg(windows)]
fn webview_away(window: &tauri::WebviewWindow, away: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
    };
    use windows_core::Interface;

    let _ = window.with_webview(move |webview| unsafe {
        let controller = webview.controller();
        let _ = controller.SetIsVisible(!away);
        // Older WebView2 runtimes (before 1.0.2210) don't have it; then only the above applies.
        if let Ok(core) = controller.CoreWebView2().and_then(|c| c.cast::<ICoreWebView2_19>()) {
            let level = if away { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW } else { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL };
            let _ = core.SetMemoryUsageTargetLevel(level);
        }
    });
}

#[cfg(not(windows))]
fn webview_away(_window: &tauri::WebviewWindow, _away: bool) {
    // WebKitGTK has no equivalent; the page sleeping (window://hidden) is what helps there.
}
