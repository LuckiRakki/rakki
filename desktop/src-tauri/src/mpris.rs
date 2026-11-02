// Linux's media controls: Rakki's own MPRIS player on the session bus (org.mpris.MediaPlayer2.rakki).
// Desktop shells' media widgets (Caelestia, Noctalia, waybar, KDE, GNOME) and playerctl read it.
//
// Rakki serves this itself instead of through souvlaki (still used on Windows) for what those
// widgets need and souvlaki leaves out: the DesktopEntry (the app's icon and name), a track id per
// song, a Position that moves while playing, the Seeked signal after a jump (so progress bars
// follow), and the song's speed as Rate.

use crate::media::NowPlaying;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use zbus::object_server::SignalEmitter;
use zbus::zvariant::{ObjectPath, OwnedObjectPath, Value};
use zbus::{Connection, interface};

const PATH: &str = "/org/mpris/MediaPlayer2";
const NAME: &str = "org.mpris.MediaPlayer2.rakki";
const NO_TRACK: &str = "/org/mpris/MediaPlayer2/TrackList/NoTrack";

#[derive(Default)]
struct State {
    now: Option<NowPlaying>,
    /// Counts songs, for each one's track id (widgets tell songs apart by it).
    track: u64,
    playing: bool,
    /// Where the song was (seconds) at `at`; it moves on at `rate` while playing.
    position: f64,
    at: Option<Instant>,
    rate: f64,
}

impl State {
    fn position_now(&self) -> f64 {
        let elapsed = match (self.playing, self.at) {
            (true, Some(at)) => at.elapsed().as_secs_f64() * self.rate,
            _ => 0.0,
        };
        let p = self.position + elapsed;
        match self.now.as_ref().and_then(|n| n.duration) {
            Some(d) if d > 0.0 => p.min(d),
            _ => p,
        }
    }

    fn track_id(&self) -> OwnedObjectPath {
        let path = if self.now.is_some() { format!("/app/rakki/track/{}", self.track) } else { NO_TRACK.to_string() };
        ObjectPath::try_from(path).map(Into::into).unwrap_or_else(|_| ObjectPath::from_static_str_unchecked(NO_TRACK).into())
    }
}

type Shared = Arc<Mutex<State>>;

fn lock(state: &Shared) -> std::sync::MutexGuard<'_, State> {
    state.lock().unwrap_or_else(|e| e.into_inner())
}

/// The app's .desktop file name without ".desktop", for the shell to find its icon and name.
/// Gear Lever and AppImageLauncher rename it (rakki.desktop); the packages install Rakki.desktop.
fn desktop_entry() -> String {
    let mut dirs: Vec<std::path::PathBuf> = Vec::new();
    if let Some(home) = std::env::var_os("XDG_DATA_HOME").map(Into::into).or_else(|| std::env::var_os("HOME").map(|h| std::path::Path::new(&h).join(".local/share"))) {
        dirs.push(home);
    }
    let system = std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    dirs.extend(system.split(':').filter(|d| !d.is_empty()).map(Into::into));
    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(dir.join("applications")) else { continue };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if let Some(stem) = name.strip_suffix(".desktop") {
                if stem.eq_ignore_ascii_case("rakki") || stem.eq_ignore_ascii_case("rakki-desktop") {
                    return stem.to_string();
                }
            }
        }
    }
    "rakki".into()
}

struct Root {
    app: AppHandle,
    desktop_entry: String,
}

#[interface(name = "org.mpris.MediaPlayer2")]
impl Root {
    fn raise(&self) {
        let _ = self.app.emit("media://control", "raise");
    }

    /// Closing is the tray's job (closing the window only hides it), so Quit does nothing.
    fn quit(&self) {}

    #[zbus(property)]
    fn can_quit(&self) -> bool {
        false
    }

    #[zbus(property)]
    fn can_raise(&self) -> bool {
        true
    }

    #[zbus(property)]
    fn has_track_list(&self) -> bool {
        false
    }

    #[zbus(property)]
    fn identity(&self) -> &str {
        "Rakki"
    }

    #[zbus(property)]
    fn desktop_entry(&self) -> &str {
        &self.desktop_entry
    }

    #[zbus(property)]
    fn supported_uri_schemes(&self) -> Vec<String> {
        Vec::new()
    }

    #[zbus(property)]
    fn supported_mime_types(&self) -> Vec<String> {
        Vec::new()
    }
}

struct Player {
    app: AppHandle,
    state: Shared,
}

impl Player {
    fn control(&self, command: impl Into<String>) {
        let _ = self.app.emit("media://control", command.into());
    }
}

#[interface(name = "org.mpris.MediaPlayer2.Player")]
impl Player {
    fn next(&self) {
        self.control("next");
    }

    fn previous(&self) {
        self.control("previous");
    }

    fn pause(&self) {
        self.control("pause");
    }

    fn play_pause(&self) {
        self.control("toggle");
    }

    fn stop(&self) {
        self.control("stop");
    }

    fn play(&self) {
        self.control("play");
    }

    /// Jump by `offset` microseconds from where the song is now.
    fn seek(&self, offset: i64) {
        let target = {
            let s = lock(&self.state);
            if s.now.is_none() {
                return;
            }
            (s.position_now() + offset as f64 / 1e6).max(0.0)
        };
        self.control(format!("position:{target}"));
    }

    /// Jump to `position` microseconds, if `track_id` is still the song that's on.
    fn set_position(&self, track_id: ObjectPath<'_>, position: i64) {
        if position < 0 {
            return;
        }
        let current = lock(&self.state).track_id();
        if track_id.as_str() == current.as_str() {
            self.control(format!("position:{}", position as f64 / 1e6));
        }
    }

    fn open_uri(&self, _uri: &str) {}

    #[zbus(signal)]
    async fn seeked(emitter: &SignalEmitter<'_>, position: i64) -> zbus::Result<()>;

    #[zbus(property)]
    fn playback_status(&self) -> &str {
        let s = lock(&self.state);
        match (&s.now, s.playing) {
            (None, _) => "Stopped",
            (Some(_), true) => "Playing",
            (Some(_), false) => "Paused",
        }
    }

    #[zbus(property)]
    fn rate(&self) -> f64 {
        lock(&self.state).rate
    }

    #[zbus(property)]
    fn set_rate(&mut self, _rate: f64) {}

    #[zbus(property)]
    fn metadata(&self) -> HashMap<String, Value<'static>> {
        let s = lock(&self.state);
        let mut m = HashMap::new();
        m.insert("mpris:trackid".into(), Value::from(s.track_id()));
        if let Some(n) = &s.now {
            m.insert("xesam:title".into(), Value::from(n.title.clone()));
            if !n.artist.is_empty() {
                m.insert("xesam:artist".into(), Value::from(vec![n.artist.clone()]));
            }
            if !n.album.is_empty() {
                m.insert("xesam:album".into(), Value::from(n.album.clone()));
            }
            if let Some(art) = n.artwork.as_ref().filter(|a| !a.is_empty()) {
                m.insert("mpris:artUrl".into(), Value::from(art.clone()));
            }
            if let Some(d) = n.duration.filter(|d| *d > 0.0) {
                m.insert("mpris:length".into(), Value::from((d * 1e6) as i64));
            }
        }
        m
    }

    #[zbus(property)]
    fn volume(&self) -> f64 {
        1.0
    }

    #[zbus(property)]
    fn set_volume(&mut self, _volume: f64) {}

    /// Not announced on change (MPRIS says so): widgets read it, then count on from Rate.
    #[zbus(property(emits_changed_signal = "false"))]
    fn position(&self) -> i64 {
        (lock(&self.state).position_now() * 1e6) as i64
    }

    #[zbus(property)]
    fn minimum_rate(&self) -> f64 {
        0.25
    }

    #[zbus(property)]
    fn maximum_rate(&self) -> f64 {
        4.0
    }

    #[zbus(property)]
    fn can_go_next(&self) -> bool {
        true
    }

    #[zbus(property)]
    fn can_go_previous(&self) -> bool {
        true
    }

    #[zbus(property)]
    fn can_play(&self) -> bool {
        true
    }

    #[zbus(property)]
    fn can_pause(&self) -> bool {
        true
    }

    #[zbus(property)]
    fn can_seek(&self) -> bool {
        lock(&self.state).now.is_some()
    }

    #[zbus(property(emits_changed_signal = "const"))]
    fn can_control(&self) -> bool {
        true
    }
}

/// What changed, for the signals to send.
#[derive(Default)]
struct Changes {
    metadata: bool,
    status: bool,
    rate: bool,
    seeked: Option<i64>,
}

async fn send(conn: &Connection, c: Changes) -> zbus::Result<()> {
    let iface = conn.object_server().interface::<_, Player>(PATH).await?;
    let emitter = iface.signal_emitter();
    let player = iface.get().await;
    if c.metadata {
        player.metadata_changed(emitter).await?;
        player.can_seek_changed(emitter).await?;
    }
    if c.status {
        player.playback_status_changed(emitter).await?;
    }
    if c.rate {
        player.rate_changed(emitter).await?;
    }
    if let Some(position) = c.seeked {
        Player::seeked(emitter, position).await?;
    }
    Ok(())
}

pub struct Mpris {
    state: Shared,
    /// Signals go out in order, one batch at a time.
    queue: tokio::sync::mpsc::UnboundedSender<Changes>,
}

impl Mpris {
    pub fn new(app: &AppHandle) -> Self {
        let state: Shared = Arc::new(Mutex::new(State { rate: 1.0, ..State::default() }));
        let (queue, mut changes) = tokio::sync::mpsc::unbounded_channel::<Changes>();
        let (app, shared) = (app.clone(), state.clone());
        tauri::async_runtime::spawn(async move {
            // No session bus (or the name is taken): no media widget, and nothing else breaks.
            let built: zbus::Result<Connection> = async {
                zbus::connection::Builder::session()?
                    .name(NAME)?
                    .serve_at(PATH, Root { app: app.clone(), desktop_entry: desktop_entry() })?
                    .serve_at(PATH, Player { app, state: shared })?
                    .build()
                    .await
            }
            .await;
            let Ok(conn) = built else { return };
            while let Some(c) = changes.recv().await {
                let _ = send(&conn, c).await;
            }
        });
        Mpris { state, queue }
    }

    pub fn set_now_playing(&self, now: Option<NowPlaying>) {
        let mut s = lock(&self.state);
        let had = s.now.is_some();
        if now.is_some() {
            s.track += 1;
        }
        s.now = now;
        if s.now.is_none() {
            s.playing = false;
            s.position = 0.0;
            s.at = None;
        }
        let status = had != s.now.is_some();
        drop(s);
        let _ = self.queue.send(Changes { metadata: true, status, ..Changes::default() });
    }

    pub fn set_playback(&self, playing: bool, position: f64, rate: f64) {
        let mut s = lock(&self.state);
        let rate = if rate.is_finite() && rate > 0.0 { rate } else { 1.0 };
        let expected = s.position_now();
        let status = s.playing != playing;
        let rate_changed = (s.rate - rate).abs() > f64::EPSILON;
        s.playing = playing;
        s.position = position.max(0.0);
        s.at = Some(Instant::now());
        s.rate = rate;
        // A jump (a seek, or a new song from its start): widgets only re-read Position when told.
        let jumped = (expected - s.position).abs() > 1.0;
        let seeked = jumped.then(|| (s.position * 1e6) as i64);
        drop(s);
        let _ = self.queue.send(Changes { status, rate: rate_changed, seeked, ..Changes::default() });
    }
}
