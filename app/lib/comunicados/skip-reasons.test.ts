import { describe, expect, it } from "vitest";

import {
  COMUNICADO_RETRACTED_SKIP_REASON,
  COMUNICADO_SKIP_REASONS,
  COMUNICADO_SOURCE_LABELS,
} from "@/app/lib/comunicados/skip-reasons";
import { campaignRecipientSourceEnum } from "@/db/schema";

describe("comunicado recipient labels", () => {
  it("names every source a recipient row can hold", () => {
    expect(Object.keys(COMUNICADO_SOURCE_LABELS).sort()).toEqual(
      [...campaignRecipientSourceEnum.enumValues].sort(),
    );
  });

  it("keeps the retraction's label apart from every judged reason", () => {
    // The report tells "Retirado antes de enviarse" from a skip the send
    // judged by this label alone.
    expect(Object.values(COMUNICADO_SKIP_REASONS)).not.toContain(
      COMUNICADO_RETRACTED_SKIP_REASON,
    );
  });
});
