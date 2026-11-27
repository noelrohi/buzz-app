/** The page contract for HTML an agent shows inline: theme variables, the
 * base sheet, and the messages a framed page and its host exchange. Pages
 * run in an opaque-origin sandbox, so these messages are all they share. */

export const HTML_RENDER_MIN_HEIGHT = 40;
/** A page taller than this scrolls inside its frame. */
export const HTML_RENDER_MAX_HEIGHT = 4000;
export const HTML_RENDER_DEFAULT_HEIGHT = 160;
export const HTML_RENDER_MAX_BYTES = 512_000;
export const HTML_RENDER_MAX_TITLE_LENGTH = 120;
/** Frame width in a message column; narrower columns shrink it. */
export const HTML_RENDER_COLUMN_WIDTH = 728;

export type HtmlRenderTheme = Readonly<{
  appearance: "light" | "dark";
  variables: Readonly<Record<string, string>>;
}>;

const SIZE_CHANGED = "ui/notifications/size-changed";
const OPEN_LINK = "ui/open-link";
const HOST_CONTEXT_CHANGED = "ui/notifications/host-context-changed";

export const HTML_RENDER_THEME_GUIDE = [
  "Use theme CSS variables, not fixed colors:",
  "--background, --foreground, --muted, --muted-foreground, --card, --card-foreground, --popover, --secondary, --border, --input, --ring, --primary, --accent, --destructive, --warning, --success, --info, --link, --code-background, --code-foreground",
  "(primary, accent, destructive and success also have -foreground; accent, destructive and warning have -surface),",
  "--chart-1 to --chart-6, --radius, --font-sans, --font-mono.",
  "They follow the viewer's light or dark theme. The base sheet sets text color and font; the page background is transparent.",
].join(" ");

export const HTML_RENDER_LAYOUT_GUIDE = [
  `The frame is the message column's width (up to ${HTML_RENDER_COLUMN_WIDTH}px, about 360px on narrow windows) and sits on the conversation background.`,
  "Leave html and body without a background, outer card, border, title banner or side padding; Buzz shows the title.",
  "Buzz adds an 8px html gutter for focus rings and shadows. Use fluid widths.",
  "A box that needs its own background gets 16px padding and var(--radius) corners. Give charts fixed pixel heights.",
  "Let content set the height: don't use vh units or height:100% on html or body.",
  "Links open in the viewer's browser once they confirm.",
].join(" ");

const BASE_CSS =
  "html{box-sizing:border-box;padding:8px;background:transparent;color:var(--foreground);font-family:var(--font-sans);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}" +
  "*,*::before,*::after{box-sizing:inherit}body{margin:0}code,kbd,pre,samp{font-family:var(--font-mono)}a{color:var(--link)}" +
  ":where(:focus-visible){outline:2px solid var(--ring);outline-offset:-2px}";

/** Applies a theme the host sends, reports the page's height, and hands
 * web links to the host. The host checks every message it receives. */
const BOOTSTRAP_SCRIPT = `(function(){var P=window.parent,s=document.getElementById("buzz-html-theme");if(P===window||!s)return;var B=${JSON.stringify(BASE_CSS)};function a(t,v){if(!v||typeof v!=="object")return;var c=":root{color-scheme:"+(t==="light"?"light":"dark")+";";for(var k in v){if(/^--[a-z0-9-]+$/.test(k))c+=k+":"+String(v[k]).replace(/[;{}<>]/g,"")+";";}s.textContent=c+"}"+B;}addEventListener("message",function(e){var d=e.data,q=d&&d.params;if(e.source!==P||!d||d.jsonrpc!=="2.0"||!q)return;if(d.method===${JSON.stringify(HOST_CONTEXT_CHANGED)})a(q.theme,q.styles&&q.styles.variables);});var l=0,f=0;function r(){f=0;var h=Math.ceil(document.documentElement.getBoundingClientRect().height);if(h>0&&h!==l){l=h;P.postMessage({jsonrpc:"2.0",method:${JSON.stringify(SIZE_CHANGED)},params:{height:h}},"*");}}function q(){if(!f)f=requestAnimationFrame(r);}if(typeof ResizeObserver==="function"){var o=new ResizeObserver(q);o.observe(document.documentElement);document.addEventListener("DOMContentLoaded",function(){if(document.body)o.observe(document.body);q();});}addEventListener("load",q);document.addEventListener("click",function(e){if(e.defaultPrevented||!e.target||!e.target.closest)return;var n=e.target.closest("a[href]");if(!n)return;var u;try{u=new URL(n.getAttribute("href"),location.href);}catch(x){return;}if(u.protocol==="http:"||u.protocol==="https:"||u.protocol==="mailto:"){e.preventDefault();P.postMessage({jsonrpc:"2.0",method:${JSON.stringify(OPEN_LINK)},params:{url:u.href}},"*");}});})();`;

export function themeRule(theme: HtmlRenderTheme): string {
  const declarations = Object.entries(theme.variables)
    .filter(([name]) => /^--[a-z0-9-]+$/.test(name))
    .map(([name, value]) => `${name}:${value.replace(/[;{}<>]/g, "")};`)
    .join("");
  return `:root{color-scheme:${theme.appearance};${declarations}}${BASE_CSS}`;
}

/** A page with its theme and bootstrap first in `<head>`, so they apply
 * before it paints and its own styles can override them. */
export function injectHtmlRenderBootstrap(
  html: string,
  theme: HtmlRenderTheme,
): string {
  const markup =
    (/<meta\s[^<>]*charset/i.test(html.slice(0, 4096))
      ? ""
      : '<meta charset="utf-8">') +
    (/<meta\s[^<>]*name\s*=\s*["']?viewport/i.test(html)
      ? ""
      : '<meta name="viewport" content="width=device-width, initial-scale=1">') +
    `<style id="buzz-html-theme">${themeRule(theme)}</style>` +
    `<script>${BOOTSTRAP_SCRIPT}</script>`;
  const body = withDoctype(html);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(body)?.[0] ?? "";
  const rest = body.slice(doctype.length);
  const open =
    /<head(?:\s[^<>]*)?>/i.exec(rest) ?? /<html(?:\s[^<>]*)?>/i.exec(rest);
  if (!open) return `${doctype}${markup}${rest}`;
  const at = open.index + open[0].length;
  return `${doctype}${rest.slice(0, at)}${markup}${rest.slice(at)}`;
}

/** A page that starts with a doctype, which is also how the relay tells an
 * upload is HTML rather than an opaque file. */
export function withDoctype(html: string): string {
  return /^\s*<!doctype\s+html/i.test(html)
    ? html.trimStart()
    : `<!doctype html>\n${html}`;
}

export function hostContextMessage(theme: HtmlRenderTheme) {
  return {
    jsonrpc: "2.0",
    method: HOST_CONTEXT_CHANGED,
    params: { theme: theme.appearance, styles: { variables: theme.variables } },
  } as const;
}

type Message = { jsonrpc?: unknown; method?: unknown; params?: unknown };
const params = (data: unknown, method: string) => {
  if (typeof data !== "object" || data === null) return undefined;
  const message = data as Message;
  return message.jsonrpc === "2.0" &&
    message.method === method &&
    typeof message.params === "object" &&
    message.params !== null
    ? (message.params as Record<string, unknown>)
    : undefined;
};

export function readContentHeight(data: unknown): number | undefined {
  const height = params(data, SIZE_CHANGED)?.height;
  return typeof height === "number" && Number.isFinite(height) && height > 0
    ? height
    : undefined;
}

export function readOpenLink(data: unknown): string | undefined {
  const url = params(data, OPEN_LINK)?.url;
  if (typeof url !== "string") return undefined;
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol)
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}

export const clampHeight = (height: number) =>
  Math.min(
    HTML_RENDER_MAX_HEIGHT,
    Math.max(HTML_RENDER_MIN_HEIGHT, Math.ceil(height)),
  );
