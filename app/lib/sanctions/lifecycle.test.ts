import { describe, expect, it } from "vitest";

import {
  calculateSanctionEndsAt,
  canEditSanction,
  canRevokeSanction,
  isSanctionValidityExtension,
  resolveSanctionStatusOnApproval,
} from "@/app/lib/sanctions/lifecycle";
import {
  createSanctionSchema,
  editSanctionSchema,
  revokeSanctionSchema,
} from "@/app/lib/sanctions/schema";

describe("sanction lifecycle helpers", () => {
  it("calculates calendar endsAt and leaves festival/indefinite open-ended", () => {
    const startsAt = new Date("2026-01-01T12:00:00.000Z");

    expect(calculateSanctionEndsAt(startsAt, 2, "days")?.toISOString()).toBe(
      "2026-01-03T12:00:00.000Z",
    );
    expect(calculateSanctionEndsAt(startsAt, 3, "festivals")).toBeNull();
    expect(calculateSanctionEndsAt(startsAt, null, "indefinitely")).toBeNull();
  });

  it("schedules future starts and activates immediate starts", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    expect(
      resolveSanctionStatusOnApproval(
        new Date("2026-07-23T12:00:00.000Z"),
        new Date("2026-07-30T12:00:00.000Z"),
        now,
      ),
    ).toBe("scheduled");
    expect(
      resolveSanctionStatusOnApproval(
        new Date("2026-07-22T11:00:00.000Z"),
        new Date("2026-07-30T12:00:00.000Z"),
        now,
      ),
    ).toBe("active");
    expect(
      resolveSanctionStatusOnApproval(
        new Date("2026-07-20T12:00:00.000Z"),
        new Date("2026-07-21T12:00:00.000Z"),
        now,
      ),
    ).toBe("expired");
  });

  it("only classifies actual validity increases as extensions", () => {
    expect(
      isSanctionValidityExtension(
        {
          validityUnit: "days",
          validityDuration: 10,
          endsAt: new Date("2026-08-01T12:00:00.000Z"),
        },
        {
          validityUnit: "days",
          validityDuration: 5,
          endsAt: new Date("2026-07-27T12:00:00.000Z"),
        },
      ),
    ).toBe(false);

    expect(
      isSanctionValidityExtension(
        {
          validityUnit: "festivals",
          validityDuration: 2,
          endsAt: null,
        },
        {
          validityUnit: "festivals",
          validityDuration: 3,
          endsAt: null,
        },
      ),
    ).toBe(true);

    expect(
      isSanctionValidityExtension(
        {
          validityUnit: "days",
          validityDuration: 10,
          endsAt: new Date("2026-08-01T12:00:00.000Z"),
        },
        {
          validityUnit: "indefinitely",
          validityDuration: null,
          endsAt: null,
        },
      ),
    ).toBe(true);
  });

  it("only allows edit/revoke on scheduled or active sanctions", () => {
    expect(canEditSanction("active")).toBe(true);
    expect(canRevokeSanction("scheduled")).toBe(true);
    expect(canEditSanction("revoked")).toBe(false);
    expect(canRevokeSanction("expired")).toBe(false);
  });
});

describe("createSanctionSchema", () => {
  const base = {
    userId: 1,
    infractionIds: [10, 11],
    type: "warning" as const,
    festivalScope: "global" as const,
    validityUnit: "days" as const,
    validityDuration: 7,
    startsAt: new Date("2026-07-22T12:00:00.000Z"),
  };

  it("accepts a valid warning with calendar validity", () => {
    const parsed = createSanctionSchema.parse(base);
    expect(parsed.type).toBe("warning");
    expect(parsed.validityDuration).toBe(7);
    expect(parsed.reservationDelayMinutes ?? null).toBeNull();
  });

  it("requires reservation delay minutes only for reservation_delay", () => {
    expect(
      createSanctionSchema.safeParse({
        ...base,
        type: "reservation_delay",
      }).success,
    ).toBe(false);

    expect(
      createSanctionSchema.parse({
        ...base,
        type: "reservation_delay",
        reservationDelayMinutes: 120,
      }).reservationDelayMinutes,
    ).toBe(120);
  });

  it("rejects duration for indefinite validity", () => {
    expect(
      createSanctionSchema.safeParse({
        ...base,
        validityUnit: "indefinitely",
        validityDuration: 3,
      }).success,
    ).toBe(false);
  });

  it.each([
    ["festivals", "Indicá cuántos festivales aplican"],
    ["days", "La duración de calendario es obligatoria"],
  ] as const)(
    "uses the validity message for %s",
    (validityUnit, expectedMessage) => {
      const parsed = createSanctionSchema.safeParse({
        ...base,
        validityUnit,
        validityDuration: null,
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(
          parsed.error.issues.filter(
            (issue) => issue.path[0] === "validityDuration",
          ),
        ).toEqual([
          expect.objectContaining({
            message: expectedMessage,
          }),
        ]);
      }
    },
  );
});

describe("edit and revoke schemas", () => {
  it("requires a reason when editing", () => {
    expect(
      editSanctionSchema.safeParse({
        sanctionId: 1,
        description: null,
        festivalScope: "glitter",
        validityUnit: "indefinitely",
        validityDuration: null,
        startsAt: new Date(),
        reservationDelayMinutes: null,
        reason: "",
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate or contradictory relationship edits", () => {
    const base = {
      sanctionId: 1,
      description: null,
      festivalScope: "global" as const,
      validityUnit: "days" as const,
      validityDuration: 3,
      startsAt: new Date(),
      reservationDelayMinutes: null,
      reason: "Corrección",
    };

    expect(
      editSanctionSchema.safeParse({
        ...base,
        addInfractionIds: [2, 2],
      }).success,
    ).toBe(false);
    expect(
      editSanctionSchema.safeParse({
        ...base,
        addInfractionIds: [2],
        removeInfractionIds: [2],
      }).success,
    ).toBe(false);
  });

  it("requires a revocation reason", () => {
    expect(
      revokeSanctionSchema.safeParse({
        sanctionId: 1,
        revocationReason: "  ",
      }).success,
    ).toBe(false);
    expect(
      revokeSanctionSchema.parse({
        sanctionId: 1,
        revocationReason: "Error administrativo",
      }).revocationReason,
    ).toBe("Error administrativo");
  });
});
