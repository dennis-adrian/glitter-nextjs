import { describe, expect, it } from "vitest";

import { filterSectionsForAudience } from "@/app/lib/festival-terms/audience";
import { paragraph } from "@/app/lib/festival-terms/blocks";
import type { EditorTermsSection } from "@/app/lib/festival-terms/definitions";
import {
  EXACTLY_ONE_SCHEDULE_MESSAGE,
  NO_PARTICIPANT_VISIBLE_CONTENT_MESSAGE,
  RICH_TEXT_BODY_REQUIRED_MESSAGE,
  RICH_TEXT_TITLE_REQUIRED_MESSAGE,
  hasParticipantVisibleTermsContent,
  publishDraftSchema,
  saveDraftSchema,
} from "@/app/lib/festival-terms/schema";

function section(
  kind: EditorTermsSection["kind"],
  clientId: string,
  overrides: Partial<EditorTermsSection> = {},
): EditorTermsSection {
  return {
    clientId,
    kind,
    layout: "plain",
    title: kind === "rich_text" ? "Sección" : "Horarios",
    bodyJson: kind === "rich_text" ? [paragraph("Contenido de términos")] : null,
    audienceCategories: [],
    audienceFestivalTypes: [],
    ...overrides,
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

  it("requires non-empty trimmed titles and visible bodyJson for rich_text", () => {
    const blankTitle = saveDraftSchema.safeParse({
      sections: [
        section("rich_text", "a", { title: "   " }),
        section("schedule", "b"),
      ],
    });
    expect(blankTitle.success).toBe(false);
    if (!blankTitle.success) {
      expect(blankTitle.error.issues[0]?.message).toBe(
        RICH_TEXT_TITLE_REQUIRED_MESSAGE,
      );
    }

    const emptyBody = saveDraftSchema.safeParse({
      sections: [
        section("rich_text", "a", { bodyJson: [] }),
        section("schedule", "b"),
      ],
    });
    expect(emptyBody.success).toBe(false);
    if (!emptyBody.success) {
      expect(emptyBody.error.issues[0]?.message).toBe(
        RICH_TEXT_BODY_REQUIRED_MESSAGE,
      );
    }

    const emptyParagraph = saveDraftSchema.safeParse({
      sections: [
        section("rich_text", "a", {
          bodyJson: [{ type: "paragraph", content: [] }],
        }),
        section("schedule", "b"),
      ],
    });
    expect(emptyParagraph.success).toBe(false);

    const whitespaceOnly = saveDraftSchema.safeParse({
      sections: [
        section("rich_text", "a", { bodyJson: [paragraph("   ")] }),
        section("schedule", "b"),
      ],
    });
    expect(whitespaceOnly.success).toBe(false);

    expect(
      saveDraftSchema.safeParse({
        sections: [section("schedule", "only")],
      }).success,
    ).toBe(true);
  });

  it("rejects publish when there is no participant-visible rich_text content", () => {
    const scheduleOnly = publishDraftSchema.safeParse({
      sections: [section("schedule", "only")],
    });
    expect(scheduleOnly.success).toBe(false);
    if (!scheduleOnly.success) {
      expect(scheduleOnly.error.issues[0]?.message).toBe(
        NO_PARTICIPANT_VISIBLE_CONTENT_MESSAGE,
      );
    }

    expect(
      publishDraftSchema.safeParse({
        sections: [section("rich_text", "a"), section("schedule", "b")],
      }).success,
    ).toBe(true);
  });

  it("rejects publish when a category and festival type would see no rich_text", () => {
    const sections = [
      section("rich_text", "a", {
        audienceCategories: ["illustration"],
        audienceFestivalTypes: ["glitter"],
      }),
      section("schedule", "b"),
    ];

    expect(
      filterSectionsForAudience(sections, "gastronomy", "glitter").some(
        (item) => item.kind === "rich_text",
      ),
    ).toBe(false);
    expect(hasParticipantVisibleTermsContent(sections)).toBe(false);

    const illustrationGlitterOnly = publishDraftSchema.safeParse({
      sections,
    });
    expect(illustrationGlitterOnly.success).toBe(false);
    if (!illustrationGlitterOnly.success) {
      expect(illustrationGlitterOnly.error.issues[0]?.message).toBe(
        NO_PARTICIPANT_VISIBLE_CONTENT_MESSAGE,
      );
    }
  });
});
