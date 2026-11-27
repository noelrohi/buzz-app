import { useEffect, useRef, useState } from "react";
import { Button } from "../../shared/design-system/ui/Button";
import {
  clampHeight,
  HTML_RENDER_DEFAULT_HEIGHT,
  hostContextMessage,
  injectHtmlRenderBootstrap,
  readContentHeight,
  readOpenLink,
} from "../../features/html-render/bootstrap";
import {
  htmlFrameSource,
  type HtmlFrameSource,
} from "../../features/html-render/frame-source";
import {
  hostHtmlTheme,
  subscribeHostTheme,
} from "../../features/html-render/theme";
import styles from "./HtmlRender.module.css";

const MAX_REMEMBERED = 200;
// The height each page last reported, so a remounted frame opens at it.
const measured = new Map<string, number>();
function remember(key: string, height: number) {
  measured.delete(key);
  measured.set(key, height);
  if (measured.size > MAX_REMEMBERED) {
    const oldest = measured.keys().next().value;
    if (oldest !== undefined) measured.delete(oldest);
  }
}

/** An agent's page in an opaque-origin sandbox: no same-origin access, so it
 * can't reach the app, its storage or the host bridge. It follows the app
 * theme and grows to its content's height. */
export function HtmlRenderFrame({
  html,
  title,
  cacheKey,
  onOpenLink,
  onError,
}: Readonly<{
  html: string;
  title: string;
  cacheKey: string;
  onOpenLink(url: string): void;
  onError?(error: unknown): void;
}>) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [source, setSource] = useState<HtmlFrameSource | null>(null);
  const [height, setHeight] = useState(
    () => measured.get(cacheKey) ?? HTML_RENDER_DEFAULT_HEIGHT,
  );
  // A link the page asked to open, waiting for the viewer to confirm it.
  const [link, setLink] = useState<string | null>(null);
  const fail = useRef(onError);
  fail.current = onError;

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    let live = true;
    htmlFrameSource(injectHtmlRenderBootstrap(html, hostHtmlTheme(node))).then(
      (next) => live && setSource(next),
      (error) => live && fail.current?.(error),
    );
    return () => {
      live = false;
    };
  }, [html]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow)
        return;
      const content = readContentHeight(event.data);
      if (content !== undefined) {
        const next = clampHeight(content);
        remember(cacheKey, next);
        setHeight(next);
        return;
      }
      // The page can ask unprompted, and nothing it does proves a click, so
      // the viewer confirms with a control the page can't reach.
      const url = readOpenLink(event.data);
      // It stays fixed while shown, so the page can't swap what Open opens.
      if (url) setLink((shown) => shown ?? url);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [cacheKey]);

  useEffect(
    () =>
      subscribeHostTheme(() => {
        const node = box.current;
        frame.current?.contentWindow?.postMessage(
          hostContextMessage(hostHtmlTheme(node ?? document.documentElement)),
          "*",
        );
      }),
    [],
  );

  return (
    <div className={styles.page}>
      <div
        ref={box}
        className={styles.frame}
        style={{ height }}
        data-html-render=""
      >
        {source && (
          <iframe
            ref={frame}
            title={title}
            // Never allow-same-origin: the page must stay an opaque origin.
            sandbox="allow-scripts allow-forms"
            referrerPolicy="no-referrer"
            {...source}
          />
        )}
      </div>
      {link && (
        // biome-ignore lint/a11y/useSemanticElements: a status line with its actions, not a form.
        <div className={styles.link} role="group" aria-label="Open link">
          <span className={styles.linkUrl} title={link}>
            Open {link}?
          </span>
          <Button
            size="sm"
            variant="subtle"
            onClick={() => {
              setLink(null);
              onOpenLink(link);
            }}
          >
            Open
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLink(null)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
