// The system's media controls: media keys, Windows' media overlay (SMTC) and Linux's MPRIS
// (desktop widgets, playerctl). The interface tells this what's playing; button presses go back
// to the interface as "media://control", which owns the queue.

use serde::Deserialize;
use souvlaki::{MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig, SeekDirection};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, WebviewWindow};

pub struct Media {
    controls: Mutex<Option<MediaControls>>,
}

#[derive(Deserialize)]
pub struct NowPlaying {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub artwork: Option<String>,
    pub duration: Option<f64>,
}

impl Media {
    pub fn new(app: &AppHandle, window: &WebviewWindow) -> Self {
        #[cfg(windows)]
        let hwnd = window.hwnd().ok().map(|h| h.0 as *mut std::ffi::c_void);
        #[cfg(not(windows))]
        let hwnd = {
            let _ = window;
            None
        };
        let config = PlatformConfig {
            dbus_name: "rakki",
            display_name: "Rakki",
            hwnd,
        };
        let controls = MediaControls::new(config).ok().and_then(|mut controls| {
            let events = app.clone();
            controls
                .attach(move |event: MediaControlEvent| {
                    let name = match event {
                        MediaControlEvent::Play => "play".to_string(),
                        MediaControlEvent::Pause => "pause".to_string(),
                        MediaControlEvent::Toggle => "toggle".to_string(),
                        MediaControlEvent::Next => "next".to_string(),
                        MediaControlEvent::Previous => "previous".to_string(),
                        MediaControlEvent::Stop => "stop".to_string(),
                        MediaControlEvent::Seek(SeekDirection::Forward) => "forward".to_string(),
                        MediaControlEvent::Seek(SeekDirection::Backward) => "backward".to_string(),
                        MediaControlEvent::SetPosition(MediaPosition(p)) => format!("position:{}", p.as_secs_f64()),
                        MediaControlEvent::Raise => "raise".to_string(),
                        _ => return,
                    };
                    let _ = events.emit("media://control", name);
                })
                .ok()?;
            Some(controls)
        });
        Media { controls: Mutex::new(controls) }
    }

    pub fn set_now_playing(&self, now: Option<NowPlaying>) {
        let Ok(mut guard) = self.controls.lock() else { return };
        let Some(controls) = guard.as_mut() else { return };
        match now {
            Some(n) => {
                let _ = controls.set_metadata(MediaMetadata {
                    title: Some(&n.title),
                    artist: Some(&n.artist),
                    album: Some(&n.album),
                    cover_url: n.artwork.as_deref(),
                    duration: n.duration.map(Duration::from_secs_f64),
                });
            }
            None => {
                let _ = controls.set_playback(MediaPlayback::Stopped);
            }
        }
    }

    pub fn set_playback(&self, playing: bool, position: f64) {
        let Ok(mut guard) = self.controls.lock() else { return };
        let Some(controls) = guard.as_mut() else { return };
        let progress = Some(MediaPosition(Duration::from_secs_f64(position.max(0.0))));
        let _ = controls.set_playback(if playing {
            MediaPlayback::Playing { progress }
        } else {
            MediaPlayback::Paused { progress }
        });
    }
}
