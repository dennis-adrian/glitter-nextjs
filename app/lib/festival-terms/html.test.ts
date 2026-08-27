import { describe, expect, it } from "vitest";

import {
  blocksToSeedHtml,
  richTextBodyHasVisibleContent,
} from "@/app/lib/festival-terms/html";
import { bold, bullet, link, paragraph } from "@/app/lib/festival-terms/blocks";

describe("blocksToSeedHtml", () => {
  it("renders paragraphs, emphasis, links, and lists", () => {
    const html = blocksToSeedHtml([
      paragraph("Hola ", bold("mundo")),
      bullet(["Uno"]),
      bullet(["Dos ", link("https://example.com", "link")]),
    ]);
    expect(html).toContain("<p>Hola <strong>mundo</strong></p>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>Uno</li>");
    expect(html).toContain('href="https://example.com"');
  });
});

describe("richTextBodyHasVisibleContent", () => {
  it("matches renderTermsSectionHtml emptiness for empty docs and paragraphs", () => {
    expect(richTextBodyHasVisibleContent(null)).toBe(false);
    expect(richTextBodyHasVisibleContent([])).toBe(false);
    expect(
      richTextBodyHasVisibleContent([{ type: "paragraph", content: [] }]),
    ).toBe(false);
    expect(richTextBodyHasVisibleContent([paragraph("   ")])).toBe(false);
    expect(richTextBodyHasVisibleContent([paragraph("Hola")])).toBe(true);
    expect(
      richTextBodyHasVisibleContent([{ type: "image", props: { url: "/a.png" } }]),
    ).toBe(true);
    expect(richTextBodyHasVisibleContent([{ type: "divider" }])).toBe(true);
  });
});
