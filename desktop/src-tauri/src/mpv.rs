// The audio engine: mpv in its own process, driven over its JSON IPC (a named pipe on Windows,
// a Unix socket on Linux). Like Rakki's iPhone engine (and Feishin's mpv player), mpv only ever
// holds the song that's playing and the next one, so the next is already buffered when the
// current ends (gapless). The queue itself lives in the interface; when mpv moves on to the
// next song this sends "player://advanced" and drops the finished one, and the interface hands
// over the new next song.
//
// mpv keeps playing while the window is hidden (in the tray), which is the point: the interface
// can sleep while you game, and this process plus mpv is all that's left running.

use serde::Serialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;

/// What the interface hears about (one property at a time, as mpv reports it).
#[derive(Clone, Serialize)]
pub struct PropChange {
    pub name: String,
    pub value: Value,
}

pub struct Mpv {
    tx: mpsc::UnboundedSender<String>,
    next_id: AtomicU64,
    child: Mutex<Option<Child>>,
}

/// Properties the interface follows. time-pos is thinned out below (mpv reports it many times
/// a second; the interface fills in between).
const OBSERVED: &[&str] = &[
    "pause",
    "time-pos",
    "duration",
    "playlist-pos",
    "idle-active",
    "paused-for-cache",
    "volume",
];

impl Mpv {
    /// Starts mpv and connects to it. Fails when mpv can't be found or doesn't answer.
    pub async fn start(app: AppHandle) -> Result<Self, String> {
        let binary = find_binary(&app);
        let ipc = ipc_path();
        let mut cmd = Command::new(&binary);
        cmd.args([
            "--idle=yes",
            "--no-video",
            "--no-config",
            "--load-scripts=no",
            "--terminal=no",
            "--audio-display=no",
            "--prefetch-playlist=yes",
            "--gapless-audio=weak",
            "--cache=yes",
            "--network-timeout=10",
            "--stream-lavf-o=reconnect=1,reconnect_streamed=1,reconnect_at_eof=1,reconnect_delay_max=5",
            "--volume-max=100",
        ])
        .arg(format!("--input-ipc-server={}", ipc))
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
        #[cfg(windows)]
        {
            // No console window flashing up for mpv.
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let child = cmd
            .spawn()
            .map_err(|e| format!("Couldn't start mpv ({}): {}", binary.display(), e))?;

        let (reader, mut writer) = connect(&ipc).await?;
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        // Writer: commands from the interface, one JSON line each.
        tauri::async_runtime::spawn(async move {
            while let Some(line) = rx.recv().await {
                if writer.write_all(line.as_bytes()).await.is_err() || writer.write_all(b"\n").await.is_err() {
                    break;
                }
            }
        });

        // Reader: property changes and events, passed on to the interface.
        let events = app.clone();
        let advance_tx = tx.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(reader).lines();
            let mut last_pos: f64 = -1.0;
            while let Ok(Some(line)) = lines.next_line().await {
                let Ok(msg) = serde_json::from_str::<Value>(&line) else { continue };
                if let Some(error) = msg.get("error").and_then(Value::as_str).filter(|e| *e != "success") {
                    let _ = events.emit("player://refused", error.to_string());
                    continue;
                }
                match msg.get("event").and_then(Value::as_str) {
                    Some("property-change") => {
                        let name = msg["name"].as_str().unwrap_or_default().to_string();
                        let value = msg.get("data").cloned().unwrap_or(Value::Null);
                        if name == "time-pos" {
                            // A quarter second is plenty: the interface counts between reports.
                            let pos = value.as_f64().unwrap_or(0.0);
                            if (pos - last_pos).abs() < 0.25 {
                                continue;
                            }
                            last_pos = pos;
                        }
                        if name == "playlist-pos" && value.as_i64() == Some(1) {
                            // The next song started: drop the finished one (the new current
                            // becomes item 0) and ask the interface for the one after.
                            let _ = advance_tx.send(json!({ "command": ["playlist-remove", 0] }).to_string());
                            let _ = events.emit("player://advanced", ());
                            continue;
                        }
                        let _ = events.emit("player://prop", PropChange { name, value });
                    }
                    Some("end-file") => {
                        let reason = msg["reason"].as_str().unwrap_or_default().to_string();
                        let error = msg.get("file_error").cloned().unwrap_or(Value::Null);
                        let _ = events.emit("player://end", json!({ "reason": reason, "error": error }));
                    }
                    _ => {}
                }
            }
            let _ = events.emit("player://gone", ());
        });

        let mpv = Mpv { tx, next_id: AtomicU64::new(1), child: Mutex::new(Some(child)) };
        for (i, name) in OBSERVED.iter().enumerate() {
            mpv.send(json!({ "command": ["observe_property", i + 1, name] }));
        }
        Ok(mpv)
    }

    fn send(&self, mut msg: Value) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        msg["request_id"] = json!(id);
        let _ = self.tx.send(msg.to_string());
    }

    pub fn command(&self, args: Value) {
        self.send(json!({ "command": args }));
    }

    pub fn set(&self, name: &str, value: Value) {
        self.command(json!(["set_property", name, value]));
    }

    /// Plays `current` (from `start` seconds), with `next` lined up behind it. Each can carry
    /// mpv options for that song only (a song's audio edit: af, speed, start, end), which mpv
    /// drops again when the song ends.
    pub fn load(&self, current: &str, current_options: Option<&FileOptions>, next: Option<&str>, next_options: Option<&FileOptions>, start: f64, play: bool) {
        self.set("pause", json!(!play));
        let mut options = current_options.cloned().unwrap_or_default();
        if start > 0.0 {
            options.insert("start".into(), json!(format!("{start:.3}")));
        }
        self.command(loadfile(current, "replace", &options));
        if let Some(next) = next {
            self.command(loadfile(next, "append", next_options.unwrap_or(&FileOptions::new())));
        }
    }

    /// Replaces whatever is lined up after the current song.
    pub fn set_next(&self, next: Option<&str>, options: Option<&FileOptions>) {
        // Removes every entry but the one playing.
        self.command(json!(["playlist-clear"]));
        if let Some(next) = next {
            self.command(loadfile(next, "append", options.unwrap_or(&FileOptions::new())));
        }
    }

    /// mpv's process id (for recording its sound, capture.rs).
    pub fn pid(&self) -> Option<u32> {
        self.child.lock().ok()?.as_ref()?.id()
    }

    pub fn quit(&self) {
        self.command(json!(["quit"]));
        if let Some(mut child) = self.child.lock().ok().and_then(|mut c| c.take()) {
            let _ = child.start_kill();
        }
    }
}

/// mpv options for one song, as mpv's own text values ("af", "speed", "start", "end").
pub type FileOptions = serde_json::Map<String, Value>;

fn loadfile(url: &str, flags: &str, options: &FileOptions) -> Value {
    let mut load = json!({ "name": "loadfile", "url": url, "flags": flags });
    if !options.is_empty() {
        load["options"] = Value::Object(options.clone());
    }
    load
}

/// The audio filters this mpv has (`mpv --af=help`), so an edit only asks for ones it can do
/// (pitch needs rubberband, which some mpv builds leave out).
pub async fn audio_filters(app: &AppHandle) -> Vec<String> {
    let mut cmd = Command::new(find_binary(app));
    cmd.args(["--no-config", "--af=help"]).stdin(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let Ok(Ok(out)) = tokio::time::timeout(Duration::from_secs(5), cmd.output()).await else { return Vec::new() };
    // Lines like "  rubberband       Pitch conversion with librubberband".
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter(|l| l.starts_with("  "))
        .filter_map(|l| l.split_whitespace().next().map(str::to_string))
        .collect()
}

/// RAKKI_MPV, else mpv next to the app (bundled on Windows), else a usual Windows install
/// folder, else whatever `mpv` is on PATH (Linux: the system's mpv package).
fn find_binary(app: &AppHandle) -> PathBuf {
    if let Ok(custom) = std::env::var("RAKKI_MPV") {
        return PathBuf::from(custom);
    }
    let name = if cfg!(windows) { "mpv.exe" } else { "mpv" };
    let mut candidates = vec![
        app.path().resource_dir().ok().map(|d| d.join("mpv").join(name)),
        std::env::current_exe().ok().and_then(|e| e.parent().map(|d| d.join("mpv").join(name))),
    ];
    // Where Windows installers put it when they don't add it to the PATH (winget's shinchiro.mpv:
    // "MPV Player").
    if cfg!(windows) {
        for folder in ["MPV Player", "mpv"] {
            candidates.push(std::env::var_os("ProgramFiles").map(|p| PathBuf::from(p).join(folder).join(name)));
        }
    }
    for c in candidates.into_iter().flatten() {
        if c.exists() {
            return c;
        }
    }
    PathBuf::from(name)
}

fn ipc_path() -> String {
    let id = std::process::id();
    if cfg!(windows) {
        format!(r"\\.\pipe\rakki-mpv-{id}")
    } else {
        let dir = std::env::var("XDG_RUNTIME_DIR").unwrap_or_else(|_| "/tmp".into());
        format!("{dir}/rakki-mpv-{id}.sock")
    }
}

#[cfg(windows)]
type IpcRead = tokio::io::ReadHalf<tokio::net::windows::named_pipe::NamedPipeClient>;
#[cfg(windows)]
type IpcWrite = tokio::io::WriteHalf<tokio::net::windows::named_pipe::NamedPipeClient>;
#[cfg(unix)]
type IpcRead = tokio::net::unix::OwnedReadHalf;
#[cfg(unix)]
type IpcWrite = tokio::net::unix::OwnedWriteHalf;

/// mpv takes a moment to open its pipe: try for up to 5 seconds.
async fn connect(path: &str) -> Result<(IpcRead, IpcWrite), String> {
    for _ in 0..50 {
        #[cfg(windows)]
        {
            if let Ok(pipe) = tokio::net::windows::named_pipe::ClientOptions::new().open(path) {
                return Ok(tokio::io::split(pipe));
            }
        }
        #[cfg(unix)]
        {
            if let Ok(sock) = tokio::net::UnixStream::connect(path).await {
                return Ok(sock.into_split());
            }
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    Err("mpv started but didn't answer on its control pipe.".into())
}
