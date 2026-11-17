import { describe, expect, it } from "vitest";

import {
  decideParticipantTransfer,
  planEnrollment,
  type TransferSnapshot,
} from "@/app/lib/reservations/participant-transfer";

function snapshot(overrides: Partial<TransferSnapshot> = {}): TransferSnapshot {
  return {
    fromUserId: 1,
    toUserId: 2,
    reservation: { status: "accepted", festivalStatus: "archived" },
    participantUserIds: [1],
    holderUserId: 1,
    target: { id: 2, role: "user", status: "verified", deletionPending: false },
    targetHasLiveReservationInFestival: false,
    targetSanctionBlocked: false,
    activeFeatureActionCount: 0,
    creditsAppliedFromSource: 0,
    sourceActivitySignups: 0,
    enrollment: {
      from: { id: 10, status: "accepted" },
      to: null,
      fromHasOtherParticipationInFestival: false,
    },
    counts: { invoices: 1, scheduledTasks: 1, products: 0 },
    ...overrides,
  };
}

function refusal(overrides: Partial<TransferSnapshot>) {
  const decision = decideParticipantTransfer(snapshot(overrides));
  return decision.ok ? null : decision.code;
}

describe("decideParticipantTransfer", () => {
  it("moves a past holder's participation with its ownership, cobro and enrollment", () => {
    const decision = decideParticipantTransfer(snapshot());
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.plan.movesHolding).toBe(true);
    expect(decision.plan.enrollment).toBe("move");
    expect(decision.plan.moves).toEqual([
      "La participación en la reserva",
      "La titularidad de la reserva",
      "1 cobro a su nombre",
      "Los recordatorios de pago",
      "La inscripción al festival",
    ]);
    expect(decision.plan.warnings).toEqual([]);
  });

  it("moves a partner's participation without the reservation's ownership", () => {
    const decision = decideParticipantTransfer(
      snapshot({
        participantUserIds: [3, 1],
        holderUserId: 3,
        counts: { invoices: 0, scheduledTasks: 0, products: 2 },
      }),
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.plan.movesHolding).toBe(false);
    expect(decision.plan.moves).toEqual([
      "La participación en la reserva",
      "2 productos enviados para el festival",
      "La inscripción al festival",
    ]);
  });

  it("refuses the obvious mistakes before looking at the reservation", () => {
    expect(refusal({ toUserId: 1 })).toBe("TRANSFER_SAME_ACCOUNT");
    expect(refusal({ participantUserIds: [3] })).toBe(
      "TRANSFER_NOT_PARTICIPANT",
    );
    expect(refusal({ target: null })).toBe("TRANSFER_TARGET_NOT_FOUND");
    expect(refusal({ participantUserIds: [1, 2] })).toBe(
      "TRANSFER_TARGET_ALREADY_PARTICIPANT",
    );
  });

  it("only lets participant accounts receive", () => {
    expect(
      refusal({
        target: {
          id: 2,
          role: "admin",
          status: "verified",
          deletionPending: false,
        },
      }),
    ).toBe("TRANSFER_TARGET_NOT_ELIGIBLE");
    expect(
      refusal({
        target: {
          id: 2,
          role: "user",
          status: "banned",
          deletionPending: false,
        },
      }),
    ).toBe("TRANSFER_TARGET_NOT_ELIGIBLE");
    expect(
      refusal({
        target: {
          id: 2,
          role: "user",
          status: "pending",
          deletionPending: false,
        },
      }),
    ).toBe("TRANSFER_TARGET_NOT_ELIGIBLE");
  });

  it("treats an archived festival's accepted reservation as history", () => {
    const paused = {
      id: 2,
      role: "user",
      status: "paused",
      deletionPending: false,
    };
    expect(refusal({ target: paused })).toBeNull();
    expect(
      refusal({
        target: paused,
        reservation: { status: "accepted", festivalStatus: "active" },
      }),
    ).toBe("TRANSFER_TARGET_NOT_ELIGIBLE");
  });

  it("refuses an account whose deletion is under way, history included", () => {
    const deleting = {
      id: 2,
      role: "user",
      status: "verified",
      deletionPending: true,
    };
    expect(refusal({ target: deleting })).toBe(
      "TRANSFER_TARGET_DELETION_PENDING",
    );
    expect(
      refusal({
        target: deleting,
        reservation: { status: "pending", festivalStatus: "active" },
      }),
    ).toBe("TRANSFER_TARGET_DELETION_PENDING");
  });

  it("accepts a paused account for history but not for a live reservation", () => {
    const paused = {
      id: 2,
      role: "user",
      status: "paused",
      deletionPending: false,
    };
    expect(refusal({ target: paused })).toBeNull();
    expect(
      refusal({
        target: paused,
        reservation: { status: "pending", festivalStatus: "active" },
      }),
    ).toBe("TRANSFER_TARGET_NOT_ELIGIBLE");
  });

  it("guards a live reservation against a second stand, sanctions and held money", () => {
    const live = { status: "pending", festivalStatus: "active" };
    expect(
      refusal({ reservation: live, targetHasLiveReservationInFestival: true }),
    ).toBe("TRANSFER_TARGET_ALREADY_RESERVED");
    expect(refusal({ reservation: live, targetSanctionBlocked: true })).toBe(
      "SANCTION_BLOCKED",
    );
    expect(refusal({ reservation: live, activeFeatureActionCount: 1 })).toBe(
      "TRANSFER_FEATURE_ACTIVE",
    );
    expect(refusal({ reservation: live, creditsAppliedFromSource: 50 })).toBe(
      "TRANSFER_CREDITS_APPLIED",
    );
  });

  it("does not re-judge history against today's state of the target", () => {
    expect(
      refusal({
        targetHasLiveReservationInFestival: true,
        targetSanctionBlocked: true,
        activeFeatureActionCount: 1,
      }),
    ).toBeNull();
  });

  it("warns where credits stay behind on a closed reservation", () => {
    const decision = decideParticipantTransfer(
      snapshot({ creditsAppliedFromSource: 120.5 }),
    );
    expect(decision.ok && decision.plan.warnings[0]).toContain("Bs120.5");
  });

  it("warns that a rejected reservation in an active festival blocks the target", () => {
    const decision = decideParticipantTransfer(
      snapshot({
        reservation: { status: "rejected", festivalStatus: "active" },
      }),
    );
    expect(decision.ok && decision.plan.warnings).toEqual([
      "Esta reserva está rechazada: al transferirla, la cuenta de destino tampoco va a poder reservar en este festival.",
    ]);
  });

  it("warns about a target enrollment that is not accepted and about activity sign-ups", () => {
    const decision = decideParticipantTransfer(
      snapshot({
        reservation: { status: "accepted", festivalStatus: "active" },
        enrollment: {
          from: { id: 10, status: "accepted" },
          to: { id: 11, status: "pending" },
          fromHasOtherParticipationInFestival: false,
        },
        sourceActivitySignups: 2,
      }),
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.plan.enrollment).toBe("keep");
    expect(decision.plan.warnings).toEqual([
      "La cuenta de destino tiene su solicitud para este festival pendiente, y no se modifica.",
      "La cuenta de origen está inscrita en 2 actividades de este festival. Esas inscripciones no se mueven.",
    ]);
  });
});

describe("planEnrollment", () => {
  it("keeps the target's own enrollment", () => {
    expect(
      planEnrollment({
        from: { id: 1, status: "accepted" },
        to: { id: 2, status: "rejected" },
        fromHasOtherParticipationInFestival: false,
      }),
    ).toBe("keep");
  });

  it("copies when the old account still needs its enrollment", () => {
    expect(
      planEnrollment({
        from: { id: 1, status: "accepted" },
        to: null,
        fromHasOtherParticipationInFestival: true,
      }),
    ).toBe("copy");
  });

  it("has nothing to do when neither account is enrolled", () => {
    expect(
      planEnrollment({
        from: null,
        to: null,
        fromHasOtherParticipationInFestival: false,
      }),
    ).toBe("none");
  });
});
