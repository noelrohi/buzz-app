import { test, expect } from "./source-fixture.mjs";

// A page that proves its script ran, reports a tall body, and shows the
// background variable the host gave it.
const page = `<!doctype html><html><head><style>
#tall{height:600px}
</style></head><body><p id="out">waiting</p><div id="tall"></div><a href="https://example.com/next">Next</a>
<script>
document.getElementById("out").textContent = "ran " + getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim();
// A page may ask on its own; only a click may open a link.
parent.postMessage({ jsonrpc: "2.0", method: "ui/open-link", params: { url: "https://example.com/unprompted" } }, "*");
addEventListener("message", () => requestAnimationFrame(() => {
  document.getElementById("out").textContent = "theme " + getComputedStyle(document.documentElement).colorScheme;
}));
</script></body></html>`;

test.beforeEach(async ({ page: browser }) => {
  for (const name of ["agent-page", "person-page"])
    await browser.route(`**/${name}.fixture`, (route) =>
      route.fulfill({ contentType: "application/octet-stream", body: page }),
    );
});

// Browser-only: a sandboxed frame running its own script, measuring itself
// and messaging its host needs a real browser.
test("an agent's HTML page runs sandboxed inline and follows the theme; a person's waits", async ({
  page: browser,
}) => {
  await browser.goto("/tests/fixtures/html-render.html");
  const agent = browser.getByRole("region", { name: "Agent page.html" });
  const frame = agent.frameLocator("iframe[title='Agent page']");
  await expect(frame.locator("#out")).toHaveText(/^ran \S/);
  // It grew to its content rather than keeping the default height.
  await expect
    .poll(async () => (await agent.locator("iframe").boundingBox())?.height)
    .toBeGreaterThan(600);
  // Opaque origin: no access to the host page.
  expect(
    await frame.locator("body").evaluate(() => {
      try {
        return window.parent.document === undefined;
      } catch {
        return "blocked";
      }
    }),
  ).toBe("blocked");

  const opened = [];
  browser.context().on("page", (tab) => opened.push(tab.url()));
  await browser
    .context()
    .route("https://example.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "ok" }),
    );
  const confirm = agent.getByRole("group", { name: "Open link" });
  // The page asked on load; nothing opened, and the viewer can still decline.
  await expect(confirm).toContainText("https://example.com/unprompted");
  // A shown request stays fixed until Open or Cancel.
  await frame.getByRole("link", { name: "Next" }).click();
  await expect(confirm).toContainText("https://example.com/unprompted");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await frame.getByRole("link", { name: "Next" }).click();
  await expect(confirm).toContainText("https://example.com/next");
  const tab = browser.context().waitForEvent("page");
  await confirm.getByRole("button", { name: "Open" }).click();
  await expect
    .poll(async () => (await tab).url())
    .toBe("https://example.com/next");
  await expect(confirm).toHaveCount(0);
  expect(opened).not.toContain("https://example.com/unprompted");

  await browser
    .locator("html")
    .evaluate((element) => (element.dataset.colorMode = "dark"));
  await expect(frame.locator("#out")).toHaveText("theme dark");

  const person = browser.getByRole("region", { name: "Person page.html" });
  await expect(person.locator("iframe")).toHaveCount(0);
  await person.getByRole("button", { name: "Show page" }).click();
  await expect(
    person.frameLocator("iframe[title='Person page']").locator("#out"),
  ).toHaveText(/^ran/);
  // Its own unprompted request came moments after the Show page click.
  expect(opened).not.toContain("https://example.com/unprompted");
});
