import { describe, expect, it } from "vitest";

import { blocksToSeedHtml } from "@/app/lib/festival-terms/html";
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
