import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ActivityProofReviewEmail from "@/app/emails/activity-proof-review";

function render(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    ActivityProofReviewEmail({
      ...ActivityProofReviewEmail.PreviewProps,
      status: "rejected_resubmit",
      ...overrides,
    } as Parameters<typeof ActivityProofReviewEmail>[0]),
  );
}

describe("ActivityProofReviewEmail", () => {
  // The pronoun follows the material's gender: "la foto", "el video".
  it("asks for a feminine material back as subila", () => {
    const html = render({
      materialLabel: "foto del stand",
      materialArticle: "la",
      materialPastParticiple: "aprobada",
    });

    expect(html).toContain("subila nuevamente");
    expect(html).not.toContain("subilo");
  });

  it("asks for a masculine material back as subilo", () => {
    const html = render({
      materialLabel: "video",
      materialArticle: "el",
      materialPastParticiple: "aprobado",
    });

    expect(html).toContain("subilo nuevamente");
    expect(html).not.toContain("subila");
  });

  /** The subject already says "Fuiste removido/a"; preview and body agree. */
  it("matches the removal subject", () => {
    const html = render({ status: "rejected_removed" });

    expect(html).toContain("Fuiste removido/a de la actividad");
    expect(html).not.toContain("Has sido");
  });
});
