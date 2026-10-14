// Rakki's own sound, for the visualizer and the moving backgrounds: what mpv plays, and nothing
// else (games, calls and other apps never move them). Music plays in mpv, outside the webview,
// so the page can't hear it; this records mpv's output and passes it to the page, which
// analyses it there (src/audio/sound.ts).
//
// Windows (10 2004 and later): process loopback, the system's capture of one process's audio
// (mpv's), the same way OBS's "application audio capture" works. Linux: mpv's own stream on
// PulseAudio or PipeWire, recorded with parec.
//
// Only runs while something on screen shows it (the page starts and stops it), and sends
// small mono chunks (48 kHz floats, about 21 ms each).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::ipc::{Channel, InvokeResponseBody};

pub const RATE: u32 = 48_000;
/// Samples per message to the page.
const CHUNK: usize = 1024;

#[derive(Default)]
pub struct Capture(Mutex<Option<Arc<AtomicBool>>>);

impl Capture {
    /// Starts recording `pid`'s sound (stopping any earlier recording).
    pub fn start(&self, pid: u32, out: Channel<InvokeResponseBody>) {
        self.stop();
        let stop = Arc::new(AtomicBool::new(false));
        *self.0.lock().unwrap() = Some(stop.clone());
        std::thread::Builder::new()
            .name("rakki-capture".into())
            .spawn(move || {
                let mut pending: Vec<f32> = Vec::with_capacity(CHUNK * 2);
                let mut send = |mono: &[f32]| {
                    pending.extend_from_slice(mono);
                    if pending.len() >= CHUNK {
                        let bytes: Vec<u8> = pending.iter().flat_map(|s| s.to_le_bytes()).collect();
                        pending.clear();
                        // The page went away: stop.
                        if out.send(InvokeResponseBody::Raw(bytes)).is_err() {
                            return false;
                        }
                    }
                    true
                };
                if let Err(e) = platform::run(pid, &stop, &mut send) {
                    eprintln!("rakki: sound capture stopped: {e}");
                }
            })
            .ok();
    }

    pub fn stop(&self) {
        if let Some(stop) = self.0.lock().unwrap().take() {
            stop.store(true, Ordering::SeqCst);
        }
    }
}

#[cfg(windows)]
mod platform {
    use std::sync::atomic::{AtomicBool, Ordering};

    use windows::core::{implement, Interface, Ref, Result, HRESULT, IUnknown};
    use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0};
    use windows::Win32::Media::Audio::{
        ActivateAudioInterfaceAsync, IActivateAudioInterfaceAsyncOperation, IActivateAudioInterfaceCompletionHandler,
        IActivateAudioInterfaceCompletionHandler_Impl, IAudioCaptureClient, IAudioClient, AUDCLNT_BUFFERFLAGS_SILENT,
        AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM, AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
        AUDCLNT_STREAMFLAGS_LOOPBACK, AUDIOCLIENT_ACTIVATION_PARAMS, AUDIOCLIENT_ACTIVATION_PARAMS_0,
        AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK, AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS,
        PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE, VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, WAVEFORMATEX,
    };
    use windows::Win32::Media::Multimedia::WAVE_FORMAT_IEEE_FLOAT;
    use windows::Win32::System::Com::StructuredStorage::{PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0};
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, BLOB, COINIT_MULTITHREADED};
    use windows::Win32::System::Threading::{CreateEventW, SetEvent, WaitForSingleObject};
    use windows::Win32::System::Variant::VT_BLOB;

    use super::RATE;

    /// Signals an event when the system has the audio client ready.
    #[implement(IActivateAudioInterfaceCompletionHandler)]
    struct Ready(HANDLE);

    impl IActivateAudioInterfaceCompletionHandler_Impl for Ready_Impl {
        fn ActivateCompleted(&self, _op: Ref<IActivateAudioInterfaceAsyncOperation>) -> Result<()> {
            unsafe { SetEvent(self.0) }
        }
    }

    pub fn run(pid: u32, stop: &AtomicBool, send: &mut dyn FnMut(&[f32]) -> bool) -> std::result::Result<(), String> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let result = capture(pid, stop, send).map_err(|e| e.message().to_string());
            CoUninitialize();
            result
        }
    }

    unsafe fn capture(pid: u32, stop: &AtomicBool, send: &mut dyn FnMut(&[f32]) -> bool) -> Result<()> {
        unsafe {
            // mpv's sound (and any process it starts), not the whole system's.
            let mut params = AUDIOCLIENT_ACTIVATION_PARAMS {
                ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
                Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
                    ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                        TargetProcessId: pid,
                        ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
                    },
                },
            };
            // Never cleared: PROPVARIANT's drop would free the blob, which points at `params`
            // on this stack (heap corruption).
            let prop = std::mem::ManuallyDrop::new(PROPVARIANT {
                Anonymous: PROPVARIANT_0 {
                    Anonymous: std::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
                        vt: VT_BLOB,
                        Anonymous: PROPVARIANT_0_0_0 {
                            blob: BLOB {
                                cbSize: std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32,
                                pBlobData: &mut params as *mut _ as *mut u8,
                            },
                        },
                        ..Default::default()
                    }),
                },
            });
            let ready_event = CreateEventW(None, false, false, None)?;
            let handler: IActivateAudioInterfaceCompletionHandler = Ready(ready_event).into();
            let op = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, &IAudioClient::IID, Some(&*prop), &handler)?;
            WaitForSingleObject(ready_event, 5_000);
            let _ = CloseHandle(ready_event);
            let mut hr = HRESULT(0);
            let mut unknown: Option<IUnknown> = None;
            op.GetActivateResult(&mut hr, &mut unknown)?;
            hr.ok()?;
            let client: IAudioClient = unknown.ok_or_else(|| windows::core::Error::from(HRESULT(-1)))?.cast()?;

            // 48 kHz stereo floats; mixed down to mono below.
            let format = WAVEFORMATEX {
                wFormatTag: WAVE_FORMAT_IEEE_FLOAT as u16,
                nChannels: 2,
                nSamplesPerSec: RATE,
                nAvgBytesPerSec: RATE * 8,
                nBlockAlign: 8,
                wBitsPerSample: 32,
                cbSize: 0,
            };
            client.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
                200_000, // 20 ms
                0,
                &format,
                None,
            )?;
            let packets = CreateEventW(None, false, false, None)?;
            client.SetEventHandle(packets)?;
            let capture: IAudioCaptureClient = client.GetService()?;
            client.Start()?;

            let mut mono: Vec<f32> = Vec::with_capacity(2048);
            'outer: while !stop.load(Ordering::SeqCst) {
                if WaitForSingleObject(packets, 200) != WAIT_OBJECT_0 {
                    continue;
                }
                loop {
                    if capture.GetNextPacketSize()? == 0 {
                        break;
                    }
                    let mut data: *mut u8 = std::ptr::null_mut();
                    let mut frames = 0u32;
                    let mut flags = 0u32;
                    capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None)?;
                    mono.clear();
                    if flags & (AUDCLNT_BUFFERFLAGS_SILENT.0 as u32) != 0 || data.is_null() {
                        mono.resize(frames as usize, 0.0);
                    } else {
                        let samples = std::slice::from_raw_parts(data as *const f32, frames as usize * 2);
                        mono.extend(samples.chunks_exact(2).map(|lr| (lr[0] + lr[1]) * 0.5));
                    }
                    capture.ReleaseBuffer(frames)?;
                    if !send(&mono) {
                        break 'outer;
                    }
                }
            }
            let _ = client.Stop();
            let _ = CloseHandle(packets);
            Ok(())
        }
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::sync::atomic::{AtomicBool, Ordering};

    use super::RATE;

    /// mpv's playback stream on PulseAudio / PipeWire (its sink input), found by process id.
    fn sink_input(pid: u32) -> Option<String> {
        let out = Command::new("pactl").args(["-f", "json", "list", "sink-inputs"]).output().ok()?;
        let list: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
        list.as_array()?.iter().find_map(|s| {
            let props = s.get("properties")?;
            let owner = props.get("application.process.id")?.as_str()?.parse::<u32>().ok()?;
            (owner == pid).then(|| s.get("index").map(|i| i.to_string()))?
        })
    }

    pub fn run(pid: u32, stop: &AtomicBool, send: &mut dyn FnMut(&[f32]) -> bool) -> Result<(), String> {
        // mpv only opens its stream once something plays: wait for it.
        let index = loop {
            if stop.load(Ordering::SeqCst) {
                return Ok(());
            }
            if let Some(i) = sink_input(pid) {
                break i;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        };
        let mut child = Command::new("parec")
            .args([
                &format!("--monitor-stream={index}"),
                "--format=float32le",
                &format!("--rate={RATE}"),
                "--channels=1",
                "--raw",
                "--latency-msec=20",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("parec: {e}"))?;
        let mut stdout = child.stdout.take().ok_or("parec: no output")?;
        let mut bytes = [0u8; 4096];
        let mut mono: Vec<f32> = Vec::with_capacity(1024);
        while !stop.load(Ordering::SeqCst) {
            let n = match stdout.read(&mut bytes) {
                Ok(0) | Err(_) => break,
                Ok(n) => n - n % 4,
            };
            mono.clear();
            mono.extend(bytes[..n].chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])));
            if !send(&mono) {
                break;
            }
        }
        let _ = child.kill();
        let _ = child.wait();
        Ok(())
    }
}

#[cfg(not(any(windows, target_os = "linux")))]
mod platform {
    use std::sync::atomic::AtomicBool;

    pub fn run(_pid: u32, _stop: &AtomicBool, _send: &mut dyn FnMut(&[f32]) -> bool) -> Result<(), String> {
        Err("not supported here".into())
    }
}
