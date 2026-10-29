// Rakki's own data in one folder you can open: %LOCALAPPDATA%\Rakki on Windows (Rakki Dev:
// "Rakki Dev"), ~/.local/share/Rakki on Linux. The interface decides which file holds what
// (src/lib/kv.ts) and sends whole files; this side only reads and writes them, each one written
// to a temporary file first and then swapped in, so a crash never leaves half a file. The sign-in
// token is the exception: it goes to Windows' Credential Manager, never a file (on Linux, a file
// only you can read, as there's no keyring every desktop has).
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

/// Read lazily (data_read), not at launch: the pages kept between launches can be large.
const LAZY: &[&str] = &["cache/pages.json"];

pub struct Data {
    dir: PathBuf,
    /// Rakki or Rakki Dev: the folder's name and the keyring entry's.
    name: &'static str,
    /// The newest write of each file so far: writes can arrive out of order, an older one is skipped.
    written: Mutex<HashMap<String, u64>>,
}

impl Data {
    pub fn new(app: &AppHandle) -> Self {
        let name = if app.config().identifier.ends_with(".dev") { "Rakki Dev" } else { "Rakki" };
        let base = app.path().local_data_dir().unwrap_or_else(|_| std::env::temp_dir());
        Data { dir: base.join(name), name, written: Mutex::new(HashMap::new()) }
    }

    /// A path inside the folder: plain names and sub-folders only.
    fn file(&self, path: &str) -> Result<PathBuf, String> {
        let ok = !path.is_empty()
            && path.split('/').all(|part| !part.is_empty() && part != "." && part != ".." && part.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c)));
        if ok { Ok(self.dir.join(path)) } else { Err(format!("Not a data file: {path}")) }
    }
}

fn read_all(dir: &Path, rel: &str, out: &mut HashMap<String, String>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
        let kind = entry.file_type()?;
        if kind.is_dir() {
            read_all(&entry.path(), &path, out)?;
        } else if kind.is_file() && name.ends_with(".json") && !LAZY.contains(&path.as_str()) && path != SECRET_FILE {
            if let Ok(text) = fs::read_to_string(entry.path()) {
                out.insert(path, text);
            }
        }
    }
    Ok(())
}

/// Writes `text` (or removes the file) through a temporary file next to it.
fn put(file: &Path, text: Option<&str>) -> io::Result<()> {
    match text {
        None => match fs::remove_file(file) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        },
        Some(text) => {
            if let Some(parent) = file.parent() {
                fs::create_dir_all(parent)?;
            }
            let temp = file.with_extension("json.tmp");
            fs::write(&temp, text)?;
            fs::rename(&temp, file)
        }
    }
}

#[derive(Serialize)]
pub struct Loaded {
    /// The folder, to show in Settings.
    dir: String,
    /// Every file (but the lazy ones), by its path in the folder ("settings.json").
    files: HashMap<String, String>,
    /// The sign-in token, if one is kept.
    token: Option<String>,
}

/// Everything, once, before the interface starts.
#[tauri::command]
pub async fn data_load(data: State<'_, Data>) -> Result<Loaded, String> {
    let mut files = HashMap::new();
    match read_all(&data.dir, "", &mut files) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => return Err(e.to_string()),
        _ => {}
    }
    Ok(Loaded { dir: data.dir.to_string_lossy().into_owned(), files, token: token_get(&data) })
}

/// One file read on its own (the lazy ones).
#[tauri::command]
pub async fn data_read(data: State<'_, Data>, path: String) -> Result<Option<String>, String> {
    match fs::read_to_string(data.file(&path)?) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Replace a whole file (or remove it with None). `seq` counts up per file in the interface.
#[tauri::command]
pub async fn data_write(data: State<'_, Data>, path: String, text: Option<String>, seq: u64) -> Result<(), String> {
    let file = data.file(&path)?;
    let mut written = data.written.lock().map_err(|e| e.to_string())?;
    if written.get(&path).is_some_and(|&last| last >= seq) {
        return Ok(());
    }
    put(&file, text.as_deref()).map_err(|e| format!("Couldn't save {path}: {e}"))?;
    written.insert(path, seq);
    Ok(())
}

/// Keep (or forget, with None) the sign-in token.
#[tauri::command]
pub async fn data_token(data: State<'_, Data>, token: Option<String>) -> Result<(), String> {
    token_set(&data, token.as_deref())
}

const SECRET_FILE: &str = "sign-in.json";

#[cfg(windows)]
fn entry(data: &Data) -> Result<keyring::Entry, String> {
    keyring::Entry::new(data.name, "jellyfin-token").map_err(|e| e.to_string())
}

#[cfg(windows)]
fn token_get(data: &Data) -> Option<String> {
    entry(data).ok()?.get_password().ok()
}

#[cfg(windows)]
fn token_set(data: &Data, token: Option<&str>) -> Result<(), String> {
    let entry = entry(data)?;
    match token {
        Some(token) => entry.set_password(token).map_err(|e| format!("Couldn't keep the sign-in in Windows' Credential Manager: {e}")),
        None => match entry.delete_credential() {
            Err(keyring::Error::NoEntry) | Ok(()) => Ok(()),
            Err(e) => Err(e.to_string()),
        },
    }
}

#[cfg(not(windows))]
fn token_get(data: &Data) -> Option<String> {
    let _ = data.name;
    let text = fs::read_to_string(data.dir.join(SECRET_FILE)).ok()?;
    serde_json::from_str::<serde_json::Value>(&text).ok()?.get("token")?.as_str().map(String::from)
}

#[cfg(not(windows))]
fn token_set(data: &Data, token: Option<&str>) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let file = data.dir.join(SECRET_FILE);
    let Some(token) = token else { return put(&file, None).map_err(|e| e.to_string()) };
    let save = || -> io::Result<()> {
        fs::create_dir_all(&data.dir)?;
        let temp = file.with_extension("json.tmp");
        fs::write(&temp, "")?;
        fs::set_permissions(&temp, fs::Permissions::from_mode(0o600))?;
        fs::write(&temp, serde_json::json!({ "token": token }).to_string())?;
        fs::rename(&temp, &file)
    };
    save().map_err(|e| e.to_string())
}
