import { describe, expect, it } from "vitest";

import type { EditorTermsSection } from "@/app/lib/festival-terms/definitions";
import {
  EXACTLY_ONE_SCHEDULE_MESSAGE,
  saveDraftSchema,
} from "@/app/lib/festival-terms/schema";

function section(
  kind: EditorTermsSection["kind"],
  clientId: string,
): EditorTermsSection {
  return {
    clientId,
    kind,
    layout: "plain",
    title: "Sección",
    bodyJson: kind === "rich_text" ? [] : null,
    audienceCategories: [],
    audienceFestivalTypes: [],
  };
}

describe("festival terms draft schema", () => {
  it("requires exactly one schedule section", () => {
    expect(
      saveDraftSchema.safeParse({
        sections: [section("rich_text", "a")],
      }).success,
    ).toBe(false);
    expect(
      saveDraftSchema.safeParse({
        sections: [section("schedule", "a"), section("schedule", "b")],
      }).success,
    ).toBe(false);

    const missing = saveDraftSchema.safeParse({
      sections: [section("rich_text", "a")],
    });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues[0]?.message).toBe(
        EXACTLY_ONE_SCHEDULE_MESSAGE,
      );
    }

    expect(
      saveDraftSchema.safeParse({
        sections: [section("rich_text", "a"), section("schedule", "b")],
      }).success,
    ).toBe(true);
  });
});
