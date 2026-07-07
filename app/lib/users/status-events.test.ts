import { describe, expect, it, vi } from "vitest";

import {
  logUserStatusEvent,
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
