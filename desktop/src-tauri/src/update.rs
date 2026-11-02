// Updates (src/lib/updateCheck.ts asks; this does the work). Mostly Tauri's updater as it comes,
// with one Linux fix: an AppImage replaces itself at the path it was started from ($APPIMAGE),
// but AppImage managers (Gear Lever, AppImageLauncher) move the file into their own folder right
// after the first launch. That Rakki then had nothing to replace and nothing to restart into, so
// Update did nothing. Here the AppImage is looked up again before installing and restarting.
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// The update found by the last check, kept for the Update button.
#[derive(Default)]
pub struct Pending(Mutex<Option<Update>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    got: u64,
    total: Option<u64>,
}

fn updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    let mut builder = app.updater_builder();
    if let Some(path) = appimage() {
        builder = builder.executable_path(path);
    }
    builder.build().map_err(|e| e.to_string())
}

/// Ask GitHub for a newer Rakki: its version, or None.
#[tauri::command]
pub async fn update_check(app: AppHandle, pending: State<'_, Pending>) -> Result<Option<String>, String> {
    let update = updater(&app)?.check().await.map_err(|e| e.to_string())?;
    let version = update.as_ref().map(|u| u.version.clone());
    *pending.0.lock().unwrap() = update;
    Ok(version)
}

/// Download and install the update found by update_check, then restart into it. Windows'
/// installer closes Rakki itself.
#[tauri::command]
pub async fn update_install(
    app: AppHandle,
    pending: State<'_, Pending>,
    on_progress: Channel<Progress>,
) -> Result<(), String> {
    let update = pending.0.lock().unwrap().clone().ok_or("No update to install")?;
    let mut got = 0u64;
    update
        .download_and_install(
            |chunk, total| {
                got += chunk as u64;
                let _ = on_progress.send(Progress { got, total });
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    restart(&app);
}

/// Start the new version, then close this one. Lets go of "Rakki is running" first, or the new
/// one would find this one still there and close.
pub fn restart(app: &AppHandle) -> ! {
    tauri_plugin_single_instance::destroy(app);
    // Tauri restarts an AppImage from $APPIMAGE, which may be gone (above).
    if let Some(path) = appimage() {
        let args: Vec<_> = std::env::args_os().skip(1).collect();
        let mut cmd = std::process::Command::new(&path);
        if crate::host::system_env(&mut cmd).args(args).spawn().is_ok() {
            app.cleanup_before_exit();
            std::process::exit(0);
        }
    }
    app.restart()
}

/// Where this AppImage is now, when Rakki runs as one (None otherwise, and on Windows).
#[cfg(not(target_os = "linux"))]
fn appimage() -> Option<PathBuf> {
    None
}

#[cfg(target_os = "linux")]
fn appimage() -> Option<PathBuf> {
    let started = PathBuf::from(std::env::var_os("APPIMAGE")?);
    if started.is_file() {
        return Some(started);
    }
    moved::find()
}

/// Finding the AppImage after a manager moved it: the menu entry it wrote points at the new place.
#[cfg(target_os = "linux")]
mod moved {
    use std::path::{Path, PathBuf};

    fn home() -> Option<PathBuf> {
        std::env::var_os("HOME").map(PathBuf::from)
    }

    fn is_appimage(path: &Path) -> bool {
        path.extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("appimage"))
            && path.is_file()
    }

    fn named_rakki(path: &Path) -> bool {
        path.file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.to_ascii_lowercase().contains("rakki"))
    }

    /// The AppImages a .desktop file's Exec/TryExec lines start, and whether the entry is Rakki's
    /// (Rakki's window class, or Rakki in the file's name).
    fn from_entry(text: &str) -> Vec<(PathBuf, bool)> {
        let ours = text.lines().any(|l| l.trim() == "StartupWMClass=rakki-desktop");
        text.lines()
            .filter_map(|l| l.strip_prefix("Exec=").or_else(|| l.strip_prefix("TryExec=")))
            .flat_map(|cmd| cmd.split_whitespace().map(|t| t.trim_matches(|c| c == '"' || c == '\'')))
            .map(PathBuf::from)
            .filter(|p| is_appimage(p))
            .map(|p| {
                let rakki = ours || named_rakki(&p);
                (p, rakki)
            })
            .collect()
    }

    pub fn find() -> Option<PathBuf> {
        let home = home()?;
        let data = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".local/share"));
        let mut found: Vec<PathBuf> = Vec::new();
        if let Ok(entries) = std::fs::read_dir(data.join("applications")) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("desktop") {
                    continue;
                }
                let Ok(text) = std::fs::read_to_string(&path) else { continue };
                found.extend(from_entry(&text).into_iter().filter(|(_, rakki)| *rakki).map(|(p, _)| p));
            }
        }
        // No menu entry: the folders AppImage managers use.
        if found.is_empty() {
            for dir in ["AppImages", "Applications", ".local/bin"] {
                if let Ok(entries) = std::fs::read_dir(home.join(dir)) {
                    found.extend(entries.flatten().map(|e| e.path()).filter(|p| is_appimage(p) && named_rakki(p)));
                }
            }
        }
        // More than one: the newest is the one last installed.
        found
            .into_iter()
            .max_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok())
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn reads_a_gear_lever_entry() {
            let dir = std::env::temp_dir().join("rakki-update-test");
            std::fs::create_dir_all(&dir).unwrap();
            let image = dir.join("rakki.appimage");
            std::fs::write(&image, b"x").unwrap();
            let text = format!(
                "[Desktop Entry]\nName=Rakki\nTryExec={0}\nExec=env DESKTOPINTEGRATION=1 {0}\nStartupWMClass=rakki-desktop\n",
                image.display()
            );
            let got = from_entry(&text);
            assert!(got.iter().any(|(p, ours)| p == &image && *ours));
            assert!(from_entry("Exec=/usr/bin/other %U\n").is_empty());
        }
    }
}
