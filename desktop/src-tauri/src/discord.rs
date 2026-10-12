// "Listening to ..." on your Discord profile, through the Discord app's local IPC (the same
// way games set their status): a named pipe on Windows, a socket on Linux. Nothing goes over
// the internet from here; the Discord app on this computer does that. Each message is a frame
// of [opcode: u32 LE][length: u32 LE][JSON]. The first one names the Discord application
// whose name shows ("Listening to Rakki"); the user makes it in Discord's developer portal.
use std::io;
use std::time::Duration;

use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;
use tokio::time::timeout;

#[cfg(windows)]
type Pipe = tokio::net::windows::named_pipe::NamedPipeClient;
#[cfg(unix)]
type Pipe = tokio::net::UnixStream;

const HANDSHAKE: u32 = 0;
const FRAME: u32 = 1;
const CLOSE: u32 = 2;
const WAIT: Duration = Duration::from_secs(5);

/// The open connection and the application id it was opened for.
#[derive(Default)]
pub struct Discord(Mutex<Option<(String, Pipe)>>);

#[cfg(windows)]
async fn open() -> io::Result<Pipe> {
    use tokio::net::windows::named_pipe::ClientOptions;
    for i in 0..10 {
        if let Ok(pipe) = ClientOptions::new().open(format!(r"\\.\pipe\discord-ipc-{i}")) {
            return Ok(pipe);
        }
    }
    Err(io::Error::new(io::ErrorKind::NotFound, "Discord isn't running"))
}

#[cfg(unix)]
async fn open() -> io::Result<Pipe> {
    let mut dirs: Vec<String> = ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"].iter().filter_map(|v| std::env::var(v).ok()).collect();
    dirs.push("/tmp".into());
    for i in 0..10 {
        for dir in &dirs {
            // Discord itself, then the Flatpak and Snap packages of it.
            for sub in ["", "/app/com.discordapp.Discord", "/snap.discord"] {
                if let Ok(socket) = tokio::net::UnixStream::connect(format!("{dir}{sub}/discord-ipc-{i}")).await {
                    return Ok(socket);
                }
            }
        }
    }
    Err(io::Error::new(io::ErrorKind::NotFound, "Discord isn't running"))
}

async fn send(pipe: &mut Pipe, op: u32, body: &Value) -> io::Result<()> {
    let data = body.to_string().into_bytes();
    let mut frame = Vec::with_capacity(8 + data.len());
    frame.extend_from_slice(&op.to_le_bytes());
    frame.extend_from_slice(&(data.len() as u32).to_le_bytes());
    frame.extend_from_slice(&data);
    pipe.write_all(&frame).await
}

async fn receive(pipe: &mut Pipe) -> io::Result<(u32, Value)> {
    let read = async {
        let mut head = [0u8; 8];
        pipe.read_exact(&mut head).await?;
        let op = u32::from_le_bytes(head[..4].try_into().unwrap());
        let len = u32::from_le_bytes(head[4..].try_into().unwrap()) as usize;
        let mut body = vec![0u8; len.min(1 << 20)];
        pipe.read_exact(&mut body).await?;
        Ok::<_, io::Error>((op, serde_json::from_slice(&body).unwrap_or(Value::Null)))
    };
    timeout(WAIT, read).await.map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "Discord didn't answer"))?
}

fn failed(body: &Value) -> Option<String> {
    (body.get("evt").and_then(Value::as_str) == Some("ERROR") || body.get("code").is_some())
        .then(|| body.pointer("/data/message").or(body.get("message")).and_then(Value::as_str).unwrap_or("Discord said no").to_string())
}

impl Discord {
    /// Show `activity` (or clear it with None) under the application `app_id`.
    pub async fn set(&self, app_id: &str, activity: Option<Value>) -> Result<(), String> {
        let mut conn = self.0.lock().await;
        // Twice: the first try may find the old connection gone (Discord restarted).
        for _ in 0..2 {
            if conn.as_ref().is_none_or(|(id, _)| id != app_id) {
                *conn = None;
                let mut pipe = open().await.map_err(|e| e.to_string())?;
                send(&mut pipe, HANDSHAKE, &json!({ "v": 1, "client_id": app_id })).await.map_err(|e| e.to_string())?;
                let (op, body) = receive(&mut pipe).await.map_err(|e| e.to_string())?;
                if op == CLOSE {
                    return Err(failed(&body).unwrap_or_else(|| "Discord closed the connection (is the Application ID right?)".into()));
                }
                *conn = Some((app_id.to_string(), pipe));
            }
            let (_, pipe) = conn.as_mut().unwrap();
            let nonce = format!("{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos());
            let message = json!({ "cmd": "SET_ACTIVITY", "args": { "pid": std::process::id(), "activity": activity }, "nonce": nonce });
            let answer = match send(pipe, FRAME, &message).await {
                Ok(()) => receive(pipe).await,
                Err(e) => Err(e),
            };
            match answer {
                Ok((CLOSE, body)) => {
                    *conn = None;
                    return Err(failed(&body).unwrap_or_else(|| "Discord closed the connection".into()));
                }
                Ok((_, body)) => return failed(&body).map_or(Ok(()), Err),
                Err(_) => *conn = None,
            }
        }
        Err("Couldn't reach Discord".into())
    }
}
