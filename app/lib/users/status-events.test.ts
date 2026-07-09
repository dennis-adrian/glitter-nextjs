import { describe, expect, it, vi } from "vitest";

import {
  logUserStatusEvent,
  updateUserStatusWithAudit,
  verificationReasonForStatus,
} from "@/app/lib/users/status-events";

describe("verificationReasonForStatus", () => {
  it("uses distinct copy for banned and rejected profiles", () => {
    expect(verificationReasonForStatus("banned")).toContain("Habilitación");
    expect(verificationReasonForStatus("rejected")).toContain("rechazo");
    expect(verificationReasonForStatus("pending")).toContain("Verificación");
  });
});

describe("logUserStatusEvent", () => {
  it("skips inserts when status does not change", async () => {
    const insert = vi.fn();
    const tx = { insert: vi.fn(() => ({ values: insert })) };

    await logUserStatusEvent(tx as never, {
      userId: 1,
      fromStatus: "verified",
      toStatus: "verified",
      reason: "noop",
    });

    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("writes an audit row when status changes", async () => {
    const values = vi.fn();
    const tx = { insert: vi.fn(() => ({ values })) };

    await logUserStatusEvent(tx as never, {
      userId: 2,
      fromStatus: "pending",
      toStatus: "rejected",
      reason: "Perfil incompleto",
      createdByUserId: 9,
    });

    expect(values).toHaveBeenCalledWith({
      userId: 2,
      fromStatus: "pending",
      toStatus: "rejected",
      reason: "Perfil incompleto",
      createdByUserId: 9,
    });
  });
});

describe("updateUserStatusWithAudit", () => {
  it("updates only when the current status matches fromStatus", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 3 }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const values = vi.fn();
    const tx = {
      update: vi.fn(() => ({ set })),
      insert: vi.fn(() => ({ values })),
    };

    await updateUserStatusWithAudit(tx as never, {
      userId: 3,
      fromStatus: "pending",
      toStatus: "verified",
      reason: "Verificación manual por administrador.",
      createdByUserId: 1,
    });

    expect(where).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith({
      userId: 3,
      fromStatus: "pending",
      toStatus: "verified",
      reason: "Verificación manual por administrador.",
      createdByUserId: 1,
    });
  });

  it("fails when no row matches the expected status", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const tx = {
      update: vi.fn(() => ({ set })),
      insert: vi.fn(),
    };

    await expect(
      updateUserStatusWithAudit(tx as never, {
        userId: 4,
        fromStatus: "pending",
        toStatus: "banned",
      }),
    ).rejects.toThrow(/expected status "pending"/);

    expect(tx.insert).not.toHaveBeenCalled();
  });
});
