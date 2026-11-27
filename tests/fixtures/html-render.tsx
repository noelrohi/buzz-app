import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HtmlAttachment } from "../../src/bundled/html-render/HtmlAttachment";
import { FileAttachment } from "../../src/features/messages/FileAttachment";
import "../../src/shared/styles/globals.css";

const page = (url: string, name: string, authorIsAgent: boolean) => (
  <section aria-label={name} style={{ width: "48rem", maxWidth: "100%" }}>
    <HtmlAttachment
      attachment={{ url, kind: "file", mime: "text/html", name }}
      source={url}
      placement="message"
      authorIsAgent={authorIsAgent}
      FileCard={FileAttachment}
      canOpen={() => false}
      open={() => false}
    />
  </section>
);

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(
  <StrictMode>
    <main aria-label="HTML page fixture">
      {page("/agent-page.fixture", "Agent page.html", true)}
      {page("/person-page.fixture", "Person page.html", false)}
    </main>
  </StrictMode>,
);
