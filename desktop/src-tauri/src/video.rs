// Music videos play in their own mpv window (mpv plays every video format straight from the
// file, which the webview can't, and no server conversion is needed). mpv's own on-screen
// controls drive it; closing the window (or q) ends it, and the page hears video://closed. One
// video at a time: starting another closes the last.
use tauri::{AppHandle, Emitter};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::mpv::find_binary;

#[derive(Default)]
pub struct Video(Mutex<Option<Child>>);

impl Video {
    pub async fn play(&self, app: &AppHandle, url: &str, title: &str, volume: f64) -> Result<(), String> {
        let mut current = self.0.lock().await;
        if let Some(mut old) = current.take() {
            let _ = old.kill().await;
        }
        let mut cmd = Command::new(find_binary(app));
        cmd.args([
            "--force-window=immediate",
            "--keep-open=no",
            "--idle=no",
            "--autofit=70%",
            "--autofit-larger=90%x90%",
            "--osc=yes",
            "--input-default-bindings=yes",
            "--no-terminal",
        ])
        .arg(format!("--title={title}"))
        .arg(format!("--volume={}", volume.clamp(0.0, 100.0)))
        .arg(url)
        .kill_on_drop(true);
        #[cfg(windows)]
        {
            // No console window flashing up behind the video.
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let child = cmd.spawn().map_err(|e| format!("Couldn't start mpv for the video: {e}"))?;
        // Hear when it closes, without holding the lock: check the stored child now and then.
        let wait_app = app.clone();
        let pid = child.id();
        tokio::spawn(async move {
            let video = tauri::Manager::state::<Video>(&wait_app);
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                let mut guard = video.0.lock().await;
                match guard.as_mut() {
                    Some(c) if c.id() == pid => {
                        if let Ok(Some(_)) = c.try_wait() {
                            *guard = None;
                            let _ = wait_app.emit("video://closed", ());
                            return;
                        }
                    }
                    // Replaced by another video, or stopped: that one reports instead.
                    _ => return,
                }
            }
        });
        *current = Some(child);
        Ok(())
    }

    pub async fn stop(&self) {
        if let Some(mut c) = self.0.lock().await.take() {
            let _ = c.kill().await;
        }
    }
}
