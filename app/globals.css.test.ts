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
});
