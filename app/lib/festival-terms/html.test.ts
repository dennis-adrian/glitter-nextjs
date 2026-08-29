import { describe, expect, it } from "vitest";

import {
  blocksToSeedHtml,
  richTextBodyHasVisibleContent,
} from "@/app/lib/festival-terms/html";
import {
  bold,
  bullet,
  heading,
  link,
  paragraph,
} from "@/app/lib/festival-terms/blocks";

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

  it("omits disallowed URI schemes from link href and image src", () => {
    const html = blocksToSeedHtml([
      paragraph(link("javascript:alert(1)", "click"), " safe"),
      {
        type: "image",
        props: { url: "javascript:alert(1)", name: "Diagrama" },
      },
    ]);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toContain("href=");
    expect(html).not.toContain("src=");
    expect(html).toContain("click");
    expect(html).toContain("safe");
    expect(html).toContain('alt="Diagrama"');
  });

  it("renders image-only bodies on the fallback path", () => {
    const html = blocksToSeedHtml([
      { type: "image", props: { url: "/a.png", name: "Diagrama" } },
    ]);
    expect(html).toBe('<img src="/a.png" alt="Diagrama" />');
    expect(richTextBodyHasVisibleContent([{ type: "image", props: { url: "/a.png" } }])).toBe(
      true,
    );
  });

  it("renders divider-only bodies on the fallback path", () => {
    const html = blocksToSeedHtml([{ type: "divider" }]);
    expect(html).toBe("<hr />");
    expect(richTextBodyHasVisibleContent([{ type: "divider" }])).toBe(true);
  });

  it("renders nested children of headings and paragraphs", () => {
    const nestedOnlyParagraph = {
      type: "paragraph",
      content: [],
      children: [paragraph("Hijo")],
    };
    const headingWithChildren = {
      ...heading(2, "Titulo"),
      children: [paragraph("Detalle")],
    };

    const nestedHtml = blocksToSeedHtml([nestedOnlyParagraph]);
    expect(nestedHtml).toBe("<p>Hijo</p>");
    expect(richTextBodyHasVisibleContent([nestedOnlyParagraph])).toBe(true);

    const headingHtml = blocksToSeedHtml([headingWithChildren]);
    expect(headingHtml).toContain("<h2>Titulo</h2>");
    expect(headingHtml).toContain("<p>Detalle</p>");
    expect(richTextBodyHasVisibleContent([headingWithChildren])).toBe(true);
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
