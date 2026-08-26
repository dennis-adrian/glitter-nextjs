import { describe, expect, it } from "vitest";

import {
  ARTICLE_BLOCK_TYPES,
  COMPACT_BLOCK_TYPES,
  allowedBlockTypes,
  articleEditorSchema,
  assertCompactDocument,
  compactEditorSchema,
  disallowedBlockTypes,
} from "@/app/lib/rich-text/schemas";
import { sanitizeRichTextHtml } from "@/app/lib/rich-text/sanitize";

describe("editor schemas", () => {
  it("exposes compact as a subset of article", () => {
    for (const type of COMPACT_BLOCK_TYPES) {
      expect(ARTICLE_BLOCK_TYPES).toContain(type);
    }
    expect(allowedBlockTypes("article")).toContain("image");
    expect(allowedBlockTypes("compact")).not.toContain("image");
  });

  it("omits image, video, and file from the compact schema", () => {
    const compactTypes = Object.keys(compactEditorSchema.blockSchema);
    expect(compactTypes).not.toContain("image");
    expect(compactTypes).not.toContain("video");
    expect(compactTypes).not.toContain("file");
    expect(Object.keys(articleEditorSchema.blockSchema)).toContain("image");
  });

  it("rejects image/video/file blocks in compact documents", () => {
    expect(disallowedBlockTypes([{ type: "image" }], "compact")).toEqual([
      "image",
    ]);
    expect(() =>
      assertCompactDocument([{ type: "video" }, { type: "file" }]),
    ).toThrow(/no permitidos/i);
  });
});

describe("HTML sanitizer", () => {
  it("strips script tags and javascript: links", () => {
    const dirty =
      '<p>Hola</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>';
    const clean = sanitizeRichTextHtml(dirty, "compact");
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toContain("Hola");
  });

  it("keeps compact allowlisted markup including mailto links", () => {
    const html =
      '<h2>Título</h2><p>Texto <strong>negrita</strong> y <a href="mailto:equipo@productoraglitter.com">correo</a></p><ul><li>Uno</li></ul>';
    const clean = sanitizeRichTextHtml(html, "compact");
    expect(clean).toContain("<h2>");
    expect(clean).toContain("<strong>");
    expect(clean).toContain("mailto:equipo@productoraglitter.com");
    expect(clean).toContain("<li>");
  });
});
