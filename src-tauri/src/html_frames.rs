//! `buzz-html://` serves the HTML pages agents show inline, each to a
//! sandboxed frame in the conversation. A `srcdoc` frame would inherit the
//! app's CSP, which blocks the inline scripts pages need, so each page gets a
//! policy of its own here: the CSP `sandbox` keeps it an opaque origin even if
//! it is loaded outside its frame. The page is prepared in shared TypeScript;
//! this only holds its bytes for the frame to load.

use std::collections::VecDeque;
use std::sync::Mutex;

use sha2::{Digest as _, Sha256};
use tauri::http::{header, Response, StatusCode};
use tauri::Manager as _;

/// A page plus its bootstrap; the tool caps pages at 512 KB.
const MAX_PAGE_BYTES: usize = 1024 * 1024;
/// Pages kept at once, the oldest dropped first. A frame loads its page once,
/// so only pages being mounted need to be here.
const MAX_PAGES: usize = 64;

pub(crate) const PAGE_POLICY: &str = "sandbox allow-scripts allow-forms";

#[derive(Default)]
pub(crate) struct HtmlFrames(Mutex<VecDeque<(String, Vec<u8>)>>);

impl HtmlFrames {
    /// Keeps `html` and returns its id, the same for the same page.
    pub(crate) fn put(&self, html: String) -> Result<String, String> {
        if html.len() > MAX_PAGE_BYTES {
            return Err("The page is too large to show".to_owned());
        }
        let id = hex::encode(Sha256::digest(html.as_bytes()));
        let mut pages = self.0.lock().map_err(|_| "Pages unavailable")?;
        pages.retain(|(kept, _)| kept != &id);
        pages.push_back((id.clone(), html.into_bytes()));
        while pages.len() > MAX_PAGES {
            pages.pop_front();
        }
        Ok(id)
    }

    fn get(&self, id: &str) -> Option<Vec<u8>> {
        let pages = self.0.lock().ok()?;
        pages
            .iter()
            .find(|(kept, _)| kept == id)
            .map(|(_, page)| page.clone())
    }

    pub(crate) fn respond(&self, path: &str) -> Response<Vec<u8>> {
        let id = path.trim_start_matches('/');
        let page = (id.len() == 64 && id.bytes().all(|b| b.is_ascii_hexdigit()))
            .then(|| self.get(id))
            .flatten();
        let Some(page) = page else {
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Vec::new())
                .expect("static response");
        };
        Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CONTENT_SECURITY_POLICY, PAGE_POLICY)
            .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
            .header(header::CACHE_CONTROL, "no-store")
            .header(header::REFERRER_POLICY, "no-referrer")
            .body(page)
            .expect("page response")
    }
}

#[tauri::command]
pub(crate) fn html_frame_put(
    frames: tauri::State<'_, HtmlFrames>,
    html: String,
) -> Result<String, String> {
    frames.put(html)
}

pub(crate) fn protocol<R: tauri::Runtime>(
    ctx: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    ctx.app_handle()
        .state::<HtmlFrames>()
        .respond(request.uri().path())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serves_a_kept_page_sandboxed_and_nothing_else() {
        let frames = HtmlFrames::default();
        let id = frames.put("<!doctype html><p>hi".to_owned()).unwrap();
        let page = frames.respond(&format!("/{id}"));
        assert_eq!(page.status(), StatusCode::OK);
        assert_eq!(page.body(), b"<!doctype html><p>hi");
        let headers = page.headers();
        assert_eq!(headers[header::CONTENT_SECURITY_POLICY], PAGE_POLICY);
        assert_eq!(headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
        assert!(!PAGE_POLICY.contains("allow-same-origin"));
        for missing in ["/", "/../etc", &format!("/{}", "0".repeat(64))] {
            assert_eq!(frames.respond(missing).status(), StatusCode::NOT_FOUND);
        }
    }

    #[test]
    fn keeps_a_bounded_number_of_pages() {
        let frames = HtmlFrames::default();
        let first = frames.put("page 0".to_owned()).unwrap();
        for n in 1..=MAX_PAGES {
            frames.put(format!("page {n}")).unwrap();
        }
        assert_eq!(
            frames.respond(&format!("/{first}")).status(),
            StatusCode::NOT_FOUND
        );
        assert!(frames.put("x".repeat(MAX_PAGE_BYTES + 1)).is_err());
    }
}
