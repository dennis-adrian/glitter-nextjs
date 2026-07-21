import { describe, expect, it } from "vitest";

import {
  assertInfractionStatusTransition,
  buildInfractionStatusUpdate,
  canTransitionInfractionStatus,
} from "@/app/lib/infractions/lifecycle";
import {
  changeInfractionStatusSchema,
  registerInfractionSchema,
} from "@/app/lib/infractions/schema";
import { getPriorNoticeLabel } from "@/app/lib/infractions/mappers";

describe("infraction lifecycle transitions", () => {
  it("allows pending to under_review, resolved, and voided", () => {
    expect(canTransitionInfractionStatus("pending", "under_review")).toBe(true);
    expect(canTransitionInfractionStatus("pending", "resolved")).toBe(true);
    expect(canTransitionInfractionStatus("pending", "voided")).toBe(true);
  });

  it("blocks invalid transitions", () => {
    expect(canTransitionInfractionStatus("pending", "pending")).toBe(false);
    expect(() =>
      assertInfractionStatusTransition("voided", "resolved"),
    ).toThrow(/inválida/);
  });

  it("allows audited reopen from voided", () => {
    expect(canTransitionInfractionStatus("voided", "pending")).toBe(true);
  });

  it("clears resolution and void metadata when reopening for review", () => {
    const update = buildInfractionStatusUpdate({
      status: "under_review",
      actorUserId: 12,
      now: new Date("2026-07-21T12:00:00Z"),
      resolutionNotes: "old resolution",
      voidReason: "old void reason",
    });

    expect(update).toMatchObject({
      handled: false,
      resolvedAt: null,
      resolvedByUserId: null,
      resolutionNotes: null,
      voidedAt: null,
      voidedByUserId: null,
      voidReason: null,
    });
  });

  it("sets only resolution metadata when resolving", () => {
    const now = new Date("2026-07-21T12:00:00Z");
    const update = buildInfractionStatusUpdate({
      status: "resolved",
      actorUserId: 12,
      now,
      resolutionNotes: "Resolved with a warning",
      voidReason: "must not persist",
    });

    expect(update).toMatchObject({
      handled: true,
      resolvedAt: now,
      resolvedByUserId: 12,
      resolutionNotes: "Resolved with a warning",
      voidedAt: null,
      voidedByUserId: null,
      voidReason: null,
    });
  });
});

describe("registerInfractionSchema", () => {
  const base = {
    userId: 1,
    typeId: 2,
    festivalId: 3,
    userGaveNotice: false,
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  };

  it("requires gaveNoticeAt when userGaveNotice is true", () => {
    const result = registerInfractionSchema.safeParse({
      ...base,
      userGaveNotice: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts prior notice with a timestamp", () => {
    const result = registerInfractionSchema.safeParse({
      ...base,
      userGaveNotice: true,
      gaveNoticeAt: new Date("2026-07-01T12:00:00Z"),
    });
    expect(result.success).toBe(true);
  });

  it("rejects gaveNoticeAt when userGaveNotice is false", () => {
    const result = registerInfractionSchema.safeParse({
      ...base,
      gaveNoticeAt: new Date("2026-07-01T12:00:00Z"),
    });
    expect(result.success).toBe(false);
  });

  it("allows global infractions without festivalId", () => {
    const result = registerInfractionSchema.safeParse({
      ...base,
      festivalId: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("changeInfractionStatusSchema", () => {
  it("requires voidReason when voiding", () => {
    const result = changeInfractionStatusSchema.safeParse({
      infractionId: 1,
      toStatus: "voided",
    });
    expect(result.success).toBe(false);
  });

  it("accepts void with reason", () => {
    const result = changeInfractionStatusSchema.safeParse({
      infractionId: 1,
      toStatus: "voided",
      voidReason: "Registro erróneo",
    });
    expect(result.success).toBe(true);
  });
});

describe("getPriorNoticeLabel", () => {
  it("explains missing legacy notice dates", () => {
    expect(
      getPriorNoticeLabel({ userGaveNotice: true, gaveNoticeAt: null }),
    ).toContain("fecha no registrada");
  });
});
