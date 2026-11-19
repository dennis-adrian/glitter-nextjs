// @vitest-environment node

import { describe, expect, it } from "vitest";

import { volunteerFormSubmittedProperties } from "@/app/lib/volunteers/analytics";

describe("volunteerFormSubmittedProperties", () => {
  it("carries ids, counts and option keys, never what the applicant typed", () => {
    const properties = volunteerFormSubmittedProperties(7, {
      shiftIds: [23, 21],
      firstChoiceRoleId: 11,
      secondChoiceRoleId: 12,
      experience: ["photography", "events"],
      referralSource: "university",
      zone: "Equipetrol",
      portfolio: "@camila.dibuja",
      experienceNotes: "Trabajé en la feria del libro",
      imageConsent: false,
    });
    expect(properties).toEqual({
      festival_id: 7,
      shift_ids: [21, 23],
      shift_count: 2,
      first_choice_role_id: 11,
      second_choice_role_id: 12,
      experience: ["events", "photography"],
      referral_source: "university",
      has_zone: true,
      has_portfolio: true,
      has_experience_notes: true,
      image_consent: false,
    });
    expect(JSON.stringify(properties)).not.toMatch(/Equipetrol|camila|feria/i);
  });
});
