// Music Review Queue (MRQ), your tag editor on the server: Rakki's Edit Metadata sends its
// changes there (src/mrq). The page can't call MRQ itself (MRQ doesn't allow other sites in
// its answers), so the request goes through here, to the MRQ address the page passes (the one
// in Settings); the body is passed through untouched (JSON, or a cover as a form).

use serde_json::{json, Value};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::ipc::{InvokeBody, Request, Response};

/// One client for every request. Its https needs an encryption provider chosen for the whole
/// app first (reqwest panics without one, and a panic closes the app); the updater picks the
/// same one, so whichever comes first wins and the other is a no-op.
fn http() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let _ = rustls::crypto::ring::default_provider().install_default();
    let c = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .connect_timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(CLIENT.get_or_init(|| c))
}

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

    let client = http()?;
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


/// A Spotify album's songs, in order, from its public embed page (no account or key needed):
/// `{ name, tracks: [{ id, title, artists, ms }] }`. Edit Metadata matches them to the album's
/// songs to fill in each song's Spotify link.
#[tauri::command]
pub async fn spotify_album(id: String) -> Result<Value, String> {
    if id.len() != 22 || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("That isn't a Spotify album link".into());
    }
    let html = http()?
        .get(format!("https://open.spotify.com/embed/album/{id}"))
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")
        .header("Accept-Language", "en")
        .send()
        .await
        .map_err(|_| "Couldn't reach Spotify".to_string())?
        .error_for_status()
        .map_err(|e| match e.status().map(|s| s.as_u16()) {
            Some(404) => "Spotify doesn't have that album".to_string(),
            _ => "Spotify didn't answer".to_string(),
        })?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    parse_album(&html).ok_or_else(|| "Spotify's album page changed; Rakki couldn't read it".into())
}

/// The page carries its data as JSON in a <script id="__NEXT_DATA__">.
fn parse_album(html: &str) -> Option<Value> {
    let start = html.find("id=\"__NEXT_DATA__\"")?;
    let body = &html[start..];
    let body = &body[body.find('>')? + 1..];
    let data: Value = serde_json::from_str(&body[..body.find("</script>")?]).ok()?;
    let entity = data.pointer("/props/pageProps/state/data/entity")?;
    let tracks: Vec<Value> = entity
        .get("trackList")?
        .as_array()?
        .iter()
        .filter_map(|t| {
            let id = t.get("uri")?.as_str()?.strip_prefix("spotify:track:")?;
            Some(json!({
                "id": id,
                "title": t.get("title").and_then(Value::as_str).unwrap_or(""),
                "artists": t.get("subtitle").and_then(Value::as_str).unwrap_or(""),
                "ms": t.get("duration").and_then(Value::as_u64).unwrap_or(0),
            }))
        })
        .collect();
    if tracks.is_empty() {
        return None;
    }
    let name = entity.get("name").or_else(|| entity.get("title")).and_then(Value::as_str).unwrap_or("");
    Some(json!({ "name": name, "tracks": tracks }))
}

#[cfg(test)]
mod tests {
    #[test]
    fn client_builds_without_the_updater() {
        assert!(super::http().is_ok());
    }

    #[test]
    fn reads_an_album_page() {
        let html = r#"<html><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"state":{"data":{"entity":{"name":"Album","trackList":[{"uri":"spotify:track:4cOdK2wGLETKBW3PvgPWqT","title":"One","subtitle":"A, B","duration":201000},{"uri":"spotify:track:1DFixLWuPkv3KT3TnV35m3","title":"Two","subtitle":"A","duration":180000}]}}}}}}</script></html>"#;
        let v = super::parse_album(html).expect("parsed");
        assert_eq!(v["name"], "Album");
        assert_eq!(v["tracks"][1]["id"], "1DFixLWuPkv3KT3TnV35m3");
        assert_eq!(v["tracks"][0]["artists"], "A, B");
    }
}
