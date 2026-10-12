// Rakki for Windows and Linux. The window is a web interface (the system's own webview, not a
// bundled browser); playback is mpv in its own process (mpv.rs); the system's media controls
// (media.rs) and a tray icon sit alongside. Closing the window only hides it to the tray, where
// music keeps playing with the interface asleep.

mod discord;
mod media;
mod memory;
mod mpv;
mod video;

use discord::Discord;
use media::{Media, NowPlaying};
use mpv::Mpv;
use video::Video;
use serde_json::{json, Value};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tokio::sync::OnceCell;

/// mpv, started on first use (so a missing mpv shows as an error in the app, not a crash).
#[derive(Default)]
struct Player(OnceCell<Mpv>);

impl Player {
    async fn get(&self, app: &AppHandle) -> Result<&Mpv, String> {
        self.0.get_or_try_init(|| Mpv::start(app.clone())).await
    }
}

#[tauri::command]
async fn player_load(
    app: AppHandle,
    player: State<'_, Player>,
    current: String,
    next: Option<String>,
    start: f64,
    play: bool,
) -> Result<(), String> {
    player.get(&app).await?.load(&current, next.as_deref(), start, play);
    Ok(())
}

#[tauri::command]
async fn player_set_next(app: AppHandle, player: State<'_, Player>, next: Option<String>) -> Result<(), String> {
    player.get(&app).await?.set_next(next.as_deref());
    Ok(())
}

#[tauri::command]
async fn player_set(app: AppHandle, player: State<'_, Player>, name: String, value: Value) -> Result<(), String> {
    player.get(&app).await?.set(&name, value);
    Ok(())
}

#[tauri::command]
async fn player_seek(app: AppHandle, player: State<'_, Player>, seconds: f64) -> Result<(), String> {
    player.get(&app).await?.command(json!(["seek", seconds, "absolute"]));
    Ok(())
}

#[tauri::command]
async fn player_stop(app: AppHandle, player: State<'_, Player>) -> Result<(), String> {
    player.get(&app).await?.command(json!(["stop"]));
    Ok(())
}

#[tauri::command]
fn media_now_playing(media: State<'_, Media>, now: Option<NowPlaying>) {
    media.set_now_playing(now);
}

#[tauri::command]
fn media_playback(media: State<'_, Media>, playing: bool, position: f64) {
    media.set_playback(playing, position);
}

/// A music video in its own mpv window (video.rs).
#[tauri::command]
async fn video_play(app: AppHandle, video: State<'_, Video>, url: String, title: String, volume: f64) -> Result<(), String> {
    video.play(&app, &url, &title, volume).await
}

#[tauri::command]
async fn video_stop(video: State<'_, Video>) -> Result<(), String> {
    video.stop().await;
    Ok(())
}

/// Discord's "Listening to" (discord.rs); None clears it.
#[tauri::command]
async fn discord_set(discord: State<'_, Discord>, app_id: String, activity: Option<Value>) -> Result<(), String> {
    discord.set(&app_id, activity).await
}

fn show_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        memory::set_away(app, false);
    }
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Rakki", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Play / Pause", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "Next", true, None::<&str>)?;
    let previous = MenuItem::with_id(app, "previous", "Previous", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Rakki", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &sep, &toggle, &next, &previous, &sep2, &quit])?;
    TrayIconBuilder::with_id("rakki")
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("Rakki")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_window(app),
            "quit" => {
                if let Some(mpv) = app.state::<Player>().0.get() {
                    mpv.quit();
                }
                tauri::async_runtime::block_on(app.state::<Video>().stop());
                app.exit(0);
            }
            other => {
                let _ = app.emit("media://control", other.to_string());
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Player::default())
        .manage(Discord::default())
        .manage(Video::default())
        .setup(|app| {
            let handle = app.handle().clone();
            let window = app.get_webview_window("main").expect("main window");
            app.manage(Media::new(&handle, &window));
            setup_tray(&handle)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                // Closing hides to the tray; music keeps playing. Quit from the tray menu.
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                    memory::set_away(window.app_handle(), true);
                }
                // Minimized counts as out of sight too; restoring it wakes the interface.
                WindowEvent::Resized(_) => {
                    let minimized = window.is_minimized().unwrap_or(false);
                    if minimized || window.is_visible().unwrap_or(false) {
                        memory::set_away(window.app_handle(), minimized);
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            player_load,
            player_set_next,
            player_set,
            player_seek,
            player_stop,
            media_now_playing,
            media_playback,
            discord_set,
            video_play,
            video_stop
        ])
        .run(tauri::generate_context!())
        .expect("error while running Rakki");
}
