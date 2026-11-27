import type { BuzzClient, Upload } from "../../buzz-mcp/client";
import type { AddedTool } from "../../buzz-mcp/session-tools";
import { callTool } from "../../buzz-mcp/tools";
import {
  HTML_RENDER_LAYOUT_GUIDE,
  HTML_RENDER_MAX_BYTES,
  HTML_RENDER_MAX_TITLE_LENGTH,
  HTML_RENDER_THEME_GUIDE,
  withDoctype,
} from "../../features/html-render/bootstrap";

export const HTML_RENDER_TOOL = "html_render";

const str = { type: "string" } as const;

/** Posts a page as an ordinary `.html` file message, through `send`, so it
 * carries the same thread, mention and attachment tags any file does. Buzz
 * shows it inline; other apps show the file. */
export const htmlRenderTool: AddedTool = {
  name: HTML_RENDER_TOOL,
  description: `Show a finished HTML page (chart, diagram, table, mockup) inline in the conversation, as a message of its own. Without channel, it goes to the current thread. Self-contained: inline <style> and <script>; remote URLs load as-is. Other apps show it as a downloadable .html file. Afterwards reply as usual, without restating the page. ${HTML_RENDER_LAYOUT_GUIDE} ${HTML_RENDER_THEME_GUIDE}`,
  inputSchema: {
    type: "object",
    properties: {
      html: { ...str, description: "The page's HTML." },
      path: { ...str, description: "A local .html file to show instead." },
      title: {
        ...str,
        description: `What the page shows, up to ${HTML_RENDER_MAX_TITLE_LENGTH} characters. It names the file.`,
      },
      text: { ...str, description: "A short caption posted with it." },
      channel: str,
      reply: { ...str, description: "A message to reply to, as in send." },
    },
    required: ["title"],
    additionalProperties: false,
  },
  async call(client, context, args) {
    const title = pageName(args.title);
    const html = await pageHtml(client, args);
    const bytes = new TextEncoder().encode(withDoctype(html));
    if (bytes.byteLength > HTML_RENDER_MAX_BYTES)
      throw new Error(
        `The page is ${bytes.byteLength} bytes; the limit is ${HTML_RENDER_MAX_BYTES}. Nothing was posted.`,
      );
    const file = `${title}.html`;
    const page: BuzzClient = {
      ...client,
      read: async (path) => {
        if (path !== file)
          throw new Error(`${HTML_RENDER_TOOL} posts one page`);
        return bytes;
      },
      upload: async (data) => {
        const upload: Upload = await client.upload(data, "text/html");
        if (upload.type !== "text/html")
          throw new Error(
            `The community stored the page as ${upload.type}, so it can't show inline. Nothing was posted.`,
          );
        return upload;
      },
      // A page held only in memory leaves no local file to manage.
      publish: (event) => client.publish(event),
    };
    const reply = await callTool(page, context, "send", {
      files: [file],
      audience: "everyone",
      ...optional(args, "text"),
      ...optional(args, "channel"),
      ...optional(args, "reply"),
    });
    return `${typeof reply === "string" ? reply : "Posted."} The page shows inline in that message.`;
  },
};

function pageName(value: unknown) {
  const name =
    typeof value === "string"
      ? value
          .replace(/[\\/:*?"<>|\p{Cc}]+/gu, " ")
          .replace(/\s+/g, " ")
          .replace(/\.html?$/i, "")
          .trim()
      : "";
  if (!name) throw new Error("title is required.");
  return name.slice(0, HTML_RENDER_MAX_TITLE_LENGTH).trim();
}

async function pageHtml(client: BuzzClient, args: Record<string, unknown>) {
  const inline = typeof args.html === "string" ? args.html : undefined;
  const path = typeof args.path === "string" ? args.path.trim() : "";
  if (inline !== undefined && path)
    throw new Error("Give html or path, not both.");
  const html = path
    ? new TextDecoder().decode(await client.read(path))
    : (inline ?? "");
  if (!html.trim()) throw new Error("html or path is required.");
  return html;
}

const optional = (args: Record<string, unknown>, key: string) =>
  typeof args[key] === "string" && args[key].trim() ? { [key]: args[key] } : {};
