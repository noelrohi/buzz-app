import { useEffect, useState } from "react";
import type { AttachmentRendererProps } from "../../features/conversation/contracts";
import { HTML_RENDER_MAX_BYTES } from "../../features/html-render/bootstrap";
import { Button } from "../../shared/design-system/ui/Button";
import { HtmlRenderFrame } from "./HtmlRenderFrame";
import styles from "./HtmlRender.module.css";

export const isHtmlAttachment = (attachment: { mime?: string | undefined }) =>
  attachment.mime?.split(";")[0]?.trim().toLowerCase() === "text/html";

export const pageTitle = (name: string | undefined) =>
  (name ?? "").replace(/\.html?$/i, "").trim() || "HTML page";

/** Opens a page's link as a `target="_blank"` link click, which the desktop
 * app hands to the system browser and a browser opens in a new tab. */
function openInBrowser(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.append(link);
  link.click();
  link.remove();
}

type Load =
  | { state: "idle" | "loading" }
  | { state: "ready"; html: string }
  | { state: "failed" };

/** An HTML attachment: an agent's page runs inline at once; anyone else's
 * stays a file card until the viewer chooses to show it. */
export function HtmlAttachment(props: AttachmentRendererProps) {
  const { attachment, source, placement, FileCard, authorIsAgent } = props;
  const [shown, setShown] = useState(
    placement !== "composer" && authorIsAgent === true,
  );
  const [load, setLoad] = useState<Load>({ state: "idle" });

  useEffect(() => {
    if (!shown) return;
    const controller = new AbortController();
    setLoad({ state: "loading" });
    fetch(source, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > HTML_RENDER_MAX_BYTES)
          throw new Error("Page too large");
        return new TextDecoder().decode(bytes);
      })
      .then(
        (html) => setLoad({ state: "ready", html }),
        (error) => {
          if (!controller.signal.aborted) {
            console.warn("Could not load an HTML page", error);
            setLoad({ state: "failed" });
          }
        },
      );
    return () => controller.abort();
  }, [shown, source]);

  const card = FileCard ? (
    <FileCard
      attachment={attachment}
      source={source}
      onOpenLink={() => false}
    />
  ) : null;
  if (load.state === "ready")
    return (
      <HtmlRenderFrame
        html={load.html}
        title={pageTitle(attachment.name)}
        cacheKey={attachment.url}
        onOpenLink={openInBrowser}
        onError={() => setLoad({ state: "failed" })}
      />
    );
  return (
    <div className={styles.card}>
      {card}
      {load.state === "failed" ? (
        <span className={styles.error}>Couldn’t show this page.</span>
      ) : (
        placement !== "composer" &&
        !shown && (
          <Button size="sm" variant="subtle" onClick={() => setShown(true)}>
            Show page
          </Button>
        )
      )}
    </div>
  );
}
