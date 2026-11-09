// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { INSTALLED_APP_ATTRIBUTE } from "@/app/lib/installed-app-mode";

const FROM = path.join(process.cwd(), "app/globals.css");

let css = "";

// The stylesheet as Tailwind builds it, not as written.
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const tailwindPath = require.resolve("@tailwindcss/postcss");
  const tailwind = require(tailwindPath);
  const postcss = createRequire(tailwindPath)("postcss");
  const result = await postcss([tailwind({ optimize: true })]).process(
    readFileSync(FROM, "utf8"),
    { from: FROM },
  );
  css = result.css;
}, 120_000);

/** The rules for `selector`, inside whatever at-rules hold them. */
function rulesFor(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`[^{}]*${escaped}[^{}]*\\{[^}]*\\}`, "g")) ?? [];
}

describe("the installed app's styles", () => {
  const MARK = `:where([${INSTALLED_APP_ATTRIBUTE}],[${INSTALLED_APP_ATTRIBUTE}] *)`;

  it("show the tab bar and hide the hamburger in a window the start page marked", () => {
    expect(rulesFor(`.standalone\\:max-lg\\:block${MARK}`).join("")).toContain(
      "display:block",
    );
    expect(rulesFor(`.standalone\\:hidden${MARK}`).join("")).toContain(
      "display:none",
    );
  });

  it("still follow the display mode where it says standalone", () => {
    expect(css).toMatch(
      /@media \(display-mode:standalone\)\{[^@]*\.standalone\\:hidden\{display:none\}/,
    );
  });

  it("make room for the tab bar and hide the page's own back links in a marked window", () => {
    expect(rulesFor(`body:has([data-app-tabbar])${MARK}`).join("")).toContain(
      "padding-bottom",
    );
    expect(rulesFor(`[data-installed-hidden]${MARK}`).join("")).toContain(
      "display:none!important",
    );
  });

  it("let the impersonation banner take the safe area in a marked window too", () => {
    expect(
      rulesFor(
        `body:has([data-impersonation-banner]) [data-screen-bar]${MARK}`,
      ).join(""),
    ).toContain("padding-top:0");
    expect(
      rulesFor(
        `body:has([data-impersonation-banner]):has([data-screen-bar])${MARK}`,
      ).join(""),
    ).toContain("--app-header-height:76px");
  });

  it("make exactly the tab bar's height of room, border and home indicator included", () => {
    expect(css).toMatch(
      /--app-tabbar-height:calc\(4rem \+ 1px \+ env\(safe-area-inset-bottom\)\)/,
    );
    const rule = rulesFor(`body:has([data-app-tabbar])${MARK}`).join("");
    expect(rule).toContain("--app-bottom-chrome:var(--app-tabbar-height)");
    expect(rule).toContain("padding-bottom:var(--app-bottom-chrome)");
  });

  it("size the header's place to the top bar, status bar included, on a deep screen", () => {
    expect(rulesFor(`body:has([data-screen-bar])${MARK}`).join("")).toContain(
      "--app-header-height:calc(76px + env(safe-area-inset-top))",
    );
  });

  it("size the dashboard's box to the viewport between the bars, growing with a long page", () => {
    const box = css.match(/\[data-app-viewport\]\{[^}]*\}/)?.[0] ?? "";
    expect(box).toContain("var(--app-header-height)");
    expect(box).toContain("var(--app-bottom-chrome,0px)");
    expect(box).toContain("min-height:var(--app-viewport-height)");
    expect(
      rulesFor("[data-app-viewport]:has(>.flex-1.min-h-0)").join(""),
    ).toContain("height:var(--app-viewport-height)");
    expect(rulesFor(".bottom-app-chrome").join("")).toContain(
      "bottom:var(--app-bottom-chrome,0px)",
    );
  });
});

describe("a closing drawer", () => {
  it("leaves at once, its slide played by an inert stand-in", () => {
    // No exit animation on the real parts: Radix unmounts them, scroll lock
    // and overlay included, the moment they close.
    for (const part of ["drawer-content", "drawer-overlay"]) {
      const rules = rulesFor(part).filter((rule) => rule.includes("closed"));
      expect(rules.join("")).toMatch(/animation:none\s*!important/);
    }
  });

  it("keeps the page's scroll restore instant while the stand-in plays", () => {
    expect(rulesFor("data-drawer-ghost").join("")).toContain(
      "scroll-behavior:auto",
    );
  });
});
