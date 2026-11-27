import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";

export type HtmlFrameSource =
  | Readonly<{ src: string }>
  | Readonly<{ srcdoc: string }>;

/** Where a sandboxed frame loads `html` from. The desktop app serves it from
 * its `buzz-html` scheme with a policy of its own, since a `srcdoc` page
 * inherits the app's CSP, which blocks inline scripts. The browser build
 * sends no CSP, so `srcdoc` runs there as it is. */
export async function htmlFrameSource(html: string): Promise<HtmlFrameSource> {
  if (!isTauri()) return { srcdoc: html };
  const id = await invoke<string>("html_frame_put", { html });
  return { src: convertFileSrc(id, "buzz-html") };
}
