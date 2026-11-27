import type { HtmlRenderTheme } from "./bootstrap";

/** The page contract's variables, from the Buzz roles that do the same job. */
const ROLES: Readonly<Record<string, string>> = {
  "--background": "--surface-base",
  "--foreground": "--text-standard",
  "--muted": "--surface-inset",
  "--muted-foreground": "--text-subtle",
  "--card": "--surface-panel",
  "--card-foreground": "--text-standard",
  "--popover": "--surface-popover",
  "--popover-foreground": "--text-standard",
  "--secondary": "--affordance-subtle",
  "--secondary-foreground": "--text-standard",
  "--border": "--border-standard",
  "--input": "--border-control",
  "--ring": "--border-focus",
  "--primary": "--affordance-prominent",
  "--primary-foreground": "--text-on-prominent",
  "--accent": "--accent-9",
  "--accent-foreground": "--text-on-accent",
  "--accent-surface": "--accent-3",
  "--accent-surface-foreground": "--accent-11",
  "--destructive": "--affordance-danger",
  "--destructive-foreground": "--text-on-status",
  "--destructive-surface": "--surface-status-danger",
  "--warning": "--text-warning",
  "--warning-surface": "--affordance-warning",
  "--success": "--affordance-success",
  "--success-foreground": "--text-on-status-success",
  "--info": "--text-categorical-blue",
  "--link": "--text-link",
  "--code-background": "--surface-inset",
  "--code-foreground": "--text-standard",
  "--chart-1": "--chart-series-1",
  "--chart-2": "--chart-series-2",
  "--chart-3": "--chart-series-3",
  "--chart-4": "--chart-series-4",
  "--chart-5": "--text-categorical-purple",
  "--chart-6": "--text-categorical-green",
  "--radius": "--radius-container",
  "--font-size": "--text-message",
  "--font-sans": "--font-sans",
  "--font-mono": "--font-mono",
};

/** The theme as `node` sees it, resolved to values: a framed page can't
 * read the app's variables. */
export function hostHtmlTheme(node: Element): HtmlRenderTheme {
  const style = getComputedStyle(node);
  const variables: Record<string, string> = {};
  for (const [name, role] of Object.entries(ROLES)) {
    const value = style.getPropertyValue(role).trim();
    if (value) variables[name] = value;
  }
  // Room for focus rings and shadows at the frame's edge.
  variables["--page-gutter"] = "8px";
  return {
    appearance:
      node.ownerDocument.documentElement.dataset.colorMode === "light"
        ? "light"
        : "dark",
    variables,
  };
}

/** Calls `listener` when the app's palette changes. */
export function subscribeHostTheme(listener: () => void): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-color-mode", "data-accent", "data-color-level"],
  });
  return () => observer.disconnect();
}
