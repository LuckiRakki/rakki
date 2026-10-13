// Start with the computer (Settings): Rakki opens quietly in the tray when you sign in to the
// computer. Windows: your own startup list (HKCU\...\Run, no admin needed); Linux: an
// ~/.config/autostart entry. Only the installed app can do this: a development build would
// start without its interface.
use std::path::PathBuf;

/// Rakki was started this way (it stays in the tray instead of opening its window).
pub const TRAY_ARG: &str = "--tray";

fn exe() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Err("Only the installed Rakki can start with the computer".into());
    }
    // An AppImage runs from a temporary mount: start the AppImage file itself.
    if let Some(appimage) = std::env::var_os("APPIMAGE") {
        return Ok(PathBuf::from(appimage));
    }
    std::env::current_exe().map_err(|e| e.to_string())
}

#[cfg(windows)]
mod imp {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    const NAME: &str = "Rakki";
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    fn reg(args: &[&str]) -> std::io::Result<std::process::ExitStatus> {
        Command::new("reg").args(args).creation_flags(CREATE_NO_WINDOW).status()
    }

    pub fn enabled() -> bool {
        reg(&["query", KEY, "/v", NAME]).map(|s| s.success()).unwrap_or(false)
    }

    pub fn set(on: bool) -> Result<(), String> {
        let ok = if on {
            let exe = super::exe()?;
            let command = format!("\"{}\" {}", exe.display(), super::TRAY_ARG);
            reg(&["add", KEY, "/v", NAME, "/t", "REG_SZ", "/d", &command, "/f"])
        } else {
            reg(&["delete", KEY, "/v", NAME, "/f"])
        }
        .map_err(|e| e.to_string())?
        .success();
        if ok || (!on && !enabled()) {
            Ok(())
        } else {
            Err("Windows didn't take the change".into())
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use std::path::PathBuf;

    fn entry() -> Option<PathBuf> {
        let base = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
        Some(base.join("autostart").join("rakki.desktop"))
    }

    pub fn enabled() -> bool {
        entry().is_some_and(|p| p.exists())
    }

    pub fn set(on: bool) -> Result<(), String> {
        let path = entry().ok_or("No home folder")?;
        if on {
            let exe = super::exe()?;
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            }
            let body = format!(
                "[Desktop Entry]\nType=Application\nName=Rakki\nComment=Jellyfin music\nExec=\"{}\" {}\nX-GNOME-Autostart-enabled=true\n",
                exe.display(),
                super::TRAY_ARG
            );
            std::fs::write(&path, body).map_err(|e| e.to_string())
        } else if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())
        } else {
            Ok(())
        }
    }
}

pub use imp::{enabled, set};
