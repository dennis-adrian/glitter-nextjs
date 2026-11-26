import { describe, expect, it } from "vitest";
import {
  ActivityFormSchema,
  parseActivityDate,
  toDatetimeLocal,
} from "./activity-form-schema";

// A type without a map badge, so material stays optional for the generic
// rules below. The map-badge rule has its own block.
const valid = {
  name: "Mejor stand",
  type: "best_stand",
  accessLevel: "public",
  registrationStartDate: "2026-09-22T09:00",
  registrationEndDate: "2026-09-24T17:00",
  allowsVoting: false,
  waitlistEnabled: false,
  details: [{}],
};

describe("activity form validation", () => {
  it("allows unlimited capacity and no optional settings", () => {
    expect(ActivityFormSchema.safeParse(valid).success).toBe(true);
  });
  it.each(["", "2026-02-30T09:00", "T09:00", "2026-09-22T25:00"])(
    "rejects an incomplete or invalid registration date: %s",
    (date) => {
      const result = ActivityFormSchema.safeParse({
        ...valid,
        registrationStartDate: date,
      });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(
          result.error.issues.some(
            (issue) => issue.path[0] === "registrationStartDate",
          ),
        ).toBe(true);
    },
  );
  it("marks the closing field when the range is reversed", () => {
    const result = ActivityFormSchema.safeParse({
      ...valid,
      registrationEndDate: valid.registrationStartDate,
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].path).toEqual(["registrationEndDate"]);
  });
  it("requires the material deadline when material is requested", () => {
    expect(
      ActivityFormSchema.safeParse({ ...valid, proofType: "text" }).success,
    ).toBe(false);
    expect(
      ActivityFormSchema.safeParse({
        ...valid,
        proofType: "text",
        proofUploadLimitDate: "2026-09-25T18:00",
      }).success,
    ).toBe(true);
  });
  it("requires a complete ordered voting period when enabled", () => {
    expect(
      ActivityFormSchema.safeParse({ ...valid, allowsVoting: true }).success,
    ).toBe(false);
    expect(
      ActivityFormSchema.safeParse({
        ...valid,
        allowsVoting: true,
        votingStartDate: "2026-09-26T18:00",
        votingEndDate: "2026-09-25T18:00",
      }).success,
    ).toBe(false);
  });
  it("does not block saving on hidden disabled settings", () => {
    expect(
      ActivityFormSchema.safeParse({
        ...valid,
        proofUploadLimitDate: "T09:00",
        votingStartDate: "T09:00",
        waitlistWindowMinutes: 0,
      }).success,
    ).toBe(true);
    expect(
      ActivityFormSchema.safeParse({
        ...valid,
        waitlistEnabled: true,
        waitlistWindowMinutes: 0,
      }).success,
    ).toBe(false);
  });
  it("round-trips dates in Bolivia regardless of the computer timezone", () => {
    const value = new Date("2026-09-23T02:47:00Z");
    expect(toDatetimeLocal(value)).toBe("2026-09-22T22:47");
    expect(parseActivityDate(toDatetimeLocal(value)).toISOString()).toBe(
      value.toISOString(),
    );
    expect(parseActivityDate("2026-09-22T00:00").toISOString()).toBe(
      "2026-09-22T04:00:00.000Z",
    );
    expect(parseActivityDate("2026-09-22T12:00").toISOString()).toBe(
      "2026-09-22T16:00:00.000Z",
    );
  });
});

describe("material required by map-badge activity types", () => {
  const deadline = { proofUploadLimitDate: "2026-09-25T18:00" };

  it.each(["stamp_passport", "sticker_hunt", "festival_sticker"])(
    "requires an image for %s",
    (type) => {
      const missing = ActivityFormSchema.safeParse({ ...valid, type });
      expect(missing.success).toBe(false);
      if (!missing.success)
        expect(missing.error.issues).toEqual([
          expect.objectContaining({
            path: ["proofType"],
            message: expect.stringMatching(
              /^Elegí «Imagen»: el mapa solo marca/,
            ),
          }),
        ]);

      for (const proofType of ["text", "both"]) {
        const wrong = ActivityFormSchema.safeParse({
          ...valid,
          ...deadline,
          type,
          proofType,
        });
        expect(wrong.success).toBe(false);
        if (!wrong.success)
          expect(wrong.error.issues.map((issue) => issue.path)).toEqual([
            ["proofType"],
          ]);
      }

      expect(
        ActivityFormSchema.safeParse({
          ...valid,
          ...deadline,
          type,
          proofType: "image",
        }).success,
      ).toBe(true);
    },
  );

  it("requires promo text for a coupon book", () => {
    const missing = ActivityFormSchema.safeParse({
      ...valid,
      type: "coupon_book",
    });
    expect(missing.success).toBe(false);
    if (!missing.success)
      expect(missing.error.issues[0]).toMatchObject({
        path: ["proofType"],
        message:
          "Elegí «Texto» o «Imagen y texto»: el mapa solo marca a quienes tienen la promoción aprobada.",
      });

    expect(
      ActivityFormSchema.safeParse({
        ...valid,
        ...deadline,
        type: "coupon_book",
        proofType: "image",
      }).success,
    ).toBe(false);
    for (const proofType of ["text", "both"])
      expect(
        ActivityFormSchema.safeParse({
          ...valid,
          ...deadline,
          type: "coupon_book",
          proofType,
        }).success,
      ).toBe(true);
  });

  it("still requires the deadline once the right material is chosen", () => {
    const result = ActivityFormSchema.safeParse({
      ...valid,
      type: "stamp_passport",
      proofType: "image",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.path)).toEqual([
        ["proofUploadLimitDate"],
      ]);
  });

  it.each(["best_stand", "sticker_print"])(
    "leaves material optional for %s, which has no map badge",
    (type) => {
      expect(ActivityFormSchema.safeParse({ ...valid, type }).success).toBe(
        true,
      );
    },
  );
});
