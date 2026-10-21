// Music Review Queue (MRQ), your tag editor on the server: Rakki's Edit Metadata sends its
// changes there (src/mrq). The page can't call MRQ itself (MRQ doesn't allow other sites in
// its answers), so the request goes through here, to the MRQ address the page passes (the one
// in Settings); the body is passed through untouched (JSON, or a cover as a form).

use std::time::Duration;
use tauri::ipc::{InvokeBody, Request, Response};

fn header<'a>(request: &'a Request<'_>, name: &str) -> Option<&'a str> {
    request.headers().get(name).and_then(|v| v.to_str().ok())
}

/// One request to MRQ. Headers: `mrq-url` (the full address), `mrq-method` (GET or POST) and
/// the body's `content-type`. Answers with MRQ's own body; a failed request or an error status
/// comes back as a message.
#[tauri::command]
pub async fn mrq_request(request: Request<'_>) -> Result<Response, String> {
    let url = header(&request, "mrq-url").ok_or("No MRQ address")?.to_string();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("The MRQ address must start with http:// or https://".into());
    }
    let method = header(&request, "mrq-method").unwrap_or("GET").to_ascii_uppercase();
    let content_type = header(&request, "content-type").map(str::to_string);
    let body = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(v) if !v.is_null() => serde_json::to_vec(v).map_err(|e| e.to_string())?,
        InvokeBody::Json(_) => Vec::new(),
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .connect_timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = if method == "POST" { client.post(&url).body(body) } else { client.get(&url) };
    if let Some(ct) = content_type.filter(|_| method == "POST") {
        req = req.header("Content-Type", ct);
    }
    let res = req.send().await.map_err(|e| {
        if e.is_timeout() {
            "MRQ didn't answer in time. Is Tailscale on?".to_string()
        } else {
            "Couldn't reach MRQ. Check the address in Settings and that Tailscale is on.".to_string()
        }
    })?;
    let status = res.status();
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        // MRQ explains most refusals as {"ok": false, "error": "..."}.
        let said = serde_json::from_slice::<serde_json::Value>(&bytes)
            .ok()
            .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(str::to_string));
        return Err(said.unwrap_or_else(|| format!("MRQ answered {}", status.as_u16())));
    }
    Ok(Response::new(bytes.to_vec()))
}
