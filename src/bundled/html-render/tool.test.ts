import { expect, it, vi } from "vitest";
import type { BuzzClient, Template } from "../../buzz-mcp/client";
import { htmlRenderTool } from "./tool";

const me = "a".repeat(64);
const hash = "b".repeat(64);

function community(storedAs = "text/html") {
  const published: Template[] = [];
  const uploads: Uint8Array[] = [];
  const client: BuzzClient = {
    key: me,
    pubkey: me,
    signingAuthority: null,
    query: vi.fn(async () => []),
    publish: vi.fn(async (template: Template) => {
      published.push(template);
      return {
        ...template,
        tags: template.tags.map((tag) => [...tag]),
        id: "e".repeat(64),
        pubkey: me,
        created_at: 100,
        sig: "",
      };
    }),
    upload: vi.fn(async (data: Uint8Array) => {
      uploads.push(data);
      return {
        url: `https://relay/media/${hash}.html`,
        sha256: hash,
        size: data.byteLength,
        type: storedAs,
      };
    }),
    read: vi.fn(async () => {
      throw new Error("no local files");
    }),
    media: vi.fn(),
    memories: vi.fn(),
    remember: vi.fn(),
  };
  return { client, published, uploads };
}

it("posts the page as an ordinary .html file message in the current thread", async () => {
  const { client, published, uploads } = community();
  await htmlRenderTool.call(
    client,
    { channel: "chan" },
    { title: "Weekly sales", html: "<p>Sales</p>", text: "Here it is" },
  );
  expect(published).toHaveLength(1);
  const [event] = published;
  expect(event?.kind).toBe(9);
  expect(event?.tags).toContainEqual(["h", "chan"]);
  expect(event?.tags).toContainEqual([
    "imeta",
    `url https://relay/media/${hash}.html`,
    "m text/html",
    "x " + hash,
    `size ${uploads[0]?.byteLength}`,
    "filename Weekly sales.html",
  ]);
  expect(event?.content).toContain("Here it is");
  // The relay recognizes HTML by its leading doctype.
  expect(new TextDecoder().decode(uploads[0])).toBe(
    "<!doctype html>\n<p>Sales</p>",
  );
});

it("posts nothing when the community doesn't keep the page as HTML", async () => {
  const { client, published } = community("application/octet-stream");
  await expect(
    htmlRenderTool.call(
      client,
      { channel: "chan" },
      { title: "Chart", html: "<p>x</p>" },
    ),
  ).rejects.toThrow(/can't show inline/);
  expect(published).toHaveLength(0);
});
