import { beforeEach, describe, expect, it, vi } from "vitest";

import { link, paragraph } from "@/app/lib/festival-terms/blocks";

vi.mock("@/db", () => ({ db: {} }));

vi.mock("@/app/lib/rich-text/render", () => ({
  blocksToSanitizedHtml: vi.fn(async () => {
    throw new Error("forced blocksToSanitizedHtml failure");
  }),
}));

import { renderTermsSectionHtml } from "@/app/lib/festival-terms/persist";
import { blocksToSanitizedHtml } from "@/app/lib/rich-text/render";

describe("renderTermsSectionHtml", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sanitizes unsafe URI schemes on the blocksToSeedHtml fallback path", async () => {
    const html = await renderTermsSectionHtml("rich_text", [
      paragraph(link("javascript:alert(1)", "click"), " safe"),
    ]);

    expect(blocksToSanitizedHtml).toHaveBeenCalled();
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain("click");
    expect(html).toContain("safe");
  });

  it("renders image-only bodies via the blocksToSeedHtml fallback path", async () => {
    const html = await renderTermsSectionHtml("rich_text", [
      { type: "image", props: { url: "/terms/diagram.png", name: "Diagrama" } },
    ]);

    expect(html).toContain('src="/terms/diagram.png"');
    expect(html).toContain('alt="Diagrama"');
  });

  it("renders divider-only bodies via the blocksToSeedHtml fallback path", async () => {
    const html = await renderTermsSectionHtml("rich_text", [{ type: "divider" }]);

    expect(html).toContain("<hr");
  });
});
