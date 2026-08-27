import { beforeEach, describe, expect, it, vi } from "vitest";

import { link, paragraph } from "@/app/lib/festival-terms/blocks";

vi.mock("@/app/lib/rich-text/render", () => ({
  blocksToSanitizedHtml: vi.fn(async () => {
    throw new Error("forced blocksToSanitizedHtml failure");
  }),
}));

describe("renderTermsSectionHtml", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sanitizes unsafe URI schemes on the blocksToSeedHtml fallback path", async () => {
    const { renderTermsSectionHtml } = await import(
      "@/app/lib/festival-terms/persist"
    );
    const { blocksToSanitizedHtml } = await import("@/app/lib/rich-text/render");

    const html = await renderTermsSectionHtml("rich_text", [
      paragraph(link("javascript:alert(1)", "click"), " safe"),
    ]);

    expect(blocksToSanitizedHtml).toHaveBeenCalled();
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain("click");
    expect(html).toContain("safe");
  });
});
