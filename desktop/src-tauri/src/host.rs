// Starting the computer's own programs (mpv, pactl, parec, a new Rakki) from inside an AppImage.
// The AppImage's start-up script points LD_LIBRARY_PATH, PATH, GTK/GIO/GStreamer/Python paths
// and XDG_DATA_DIRS at the libraries it carries (Ubuntu 22.04's). Rakki's own webview needs them,
// but a program from the system started with them loads those old libraries instead of its own
// and can die at once (mpv on CachyOS: "symbol lookup error ... nghttp2"). So each such program
// gets the environment back without them. Outside an AppImage this changes nothing.
use std::ffi::OsString;
use std::process::Command;

/// Variables the AppImage sets only for itself.
const OWN: &[&str] = &[
    "LD_LIBRARY_PATH",
    "PYTHONHOME",
    "PYTHONPATH",
    "PERLLIB",
    "GIO_MODULE_DIR",
    "GIO_EXTRA_MODULES",
    "GDK_PIXBUF_MODULE_FILE",
    "GDK_PIXBUF_MODULEDIR",
    "GTK_PATH",
    "GTK_EXE_PREFIX",
    "GTK_DATA_PREFIX",
    "GTK_IM_MODULE_FILE",
    "GTK_THEME",
    "GST_PLUGIN_SYSTEM_PATH",
    "GST_PLUGIN_SYSTEM_PATH_1_0",
    "GST_PLUGIN_SCANNER",
    "GST_PLUGIN_SCANNER_1_0",
    "QT_PLUGIN_PATH",
    "GI_TYPELIB_PATH",
    "GSETTINGS_SCHEMA_DIR",
    "APPDIR",
    "APPIMAGE",
    "ARGV0",
    "OWD",
];

/// Lists of folders (PATH, XDG_DATA_DIRS) keep only the computer's own folders.
const LISTS: &[&str] = &["PATH", "XDG_DATA_DIRS"];

fn inside_appimage() -> bool {
    cfg!(target_os = "linux") && (std::env::var_os("APPDIR").is_some() || std::env::var_os("APPIMAGE").is_some())
}

/// A folder inside a mounted AppImage (this one, or another one that started it).
fn in_appimage(dir: &std::path::Path) -> bool {
    let appdir = std::env::var_os("APPDIR").filter(|a| !a.is_empty());
    appdir.is_some_and(|a| dir.starts_with(a))
        || dir.to_str().is_some_and(|d| d.contains("/.mount_"))
}

/// `list` without the AppImage's folders, or None when nothing is left.
fn system_list(list: &OsString) -> Option<OsString> {
    let kept: Vec<_> = std::env::split_paths(list).filter(|d| !in_appimage(d)).collect();
    if kept.is_empty() {
        return None;
    }
    std::env::join_paths(kept).ok()
}

/// Give `cmd` the computer's environment instead of the AppImage's.
pub fn system_env(cmd: &mut Command) -> &mut Command {
    if !inside_appimage() {
        return cmd;
    }
    for name in OWN {
        cmd.env_remove(name);
    }
    for name in LISTS {
        match std::env::var_os(name).and_then(|v| system_list(&v)) {
            Some(v) => cmd.env(name, v),
            None => cmd.env_remove(name),
        };
    }
    cmd
}

/// A program on the computer's PATH (without the AppImage's folders), as a full path.
pub fn which(name: &str) -> Option<std::path::PathBuf> {
    let path = std::env::var_os("PATH")?;
    let path = if inside_appimage() { system_list(&path)? } else { path };
    std::env::split_paths(&path).map(|d| d.join(name)).find(|p| p.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drops_mounted_folders() {
        let list = OsString::from("/tmp/.mount_rakki.abc/usr/bin:/usr/local/bin:/tmp/.mount_rakki.xyz/usr/bin:/usr/bin");
        assert_eq!(system_list(&list).unwrap(), OsString::from("/usr/local/bin:/usr/bin"));
        assert!(system_list(&OsString::from("/tmp/.mount_x/usr/share")).is_none());
    }
}
