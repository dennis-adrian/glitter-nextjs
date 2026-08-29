import { describe, expect, it } from "vitest";

import {
  FESTIVAL_PARTICIPANT_TERMS_DISABLED_MESSAGE,
  isFestivalParticipantTermsEnabled,
} from "@/app/lib/festivals/participant-terms";

describe("festival participant terms access", () => {
  it("is enabled only when the festival flag is true", () => {
    expect(
      isFestivalParticipantTermsEnabled({ participantTermsEnabled: true }),
    ).toBe(true);
    expect(
      isFestivalParticipantTermsEnabled({ participantTermsEnabled: false }),
    ).toBe(false);
  });

  it("exposes a stable disabled message", () => {
    expect(FESTIVAL_PARTICIPANT_TERMS_DISABLED_MESSAGE).toMatch(/todavía/i);
  });
});
