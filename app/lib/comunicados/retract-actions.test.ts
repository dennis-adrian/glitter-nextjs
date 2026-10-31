// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  logFailure: vi.fn(),
  revalidatePath: vi.fn(),
  retract: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/app/lib/comunicados/actor", () => ({
  comunicadosActor: mocks.actor,
  logComunicadosFailure: mocks.logFailure,
}));
vi.mock("@/app/lib/comunicados/retract", () => ({
  retractComunicado: mocks.retract,
}));

import { retractComunicadoAction } from "@/app/lib/comunicados/retract-actions";

const ADMIN = { id: 42, role: "admin" };
const BLOCKED = { success: false, message: "No autorizado." } as const;
const REASON = "Salió con el horario equivocado";

beforeEach(() => {
  mocks.actor.mockResolvedValue({ actor: ADMIN, blocked: null });
  mocks.retract.mockResolvedValue({
    ok: true,
    campaignId: 91,
    completed: true,
    hidden: 3,
    skippedDeliveries: 2,
    skippedRecipients: 1,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("retractComunicadoAction", () => {
  it("refuses anyone the guard refuses before reading the input", async () => {
    mocks.actor.mockResolvedValue({ actor: null, blocked: BLOCKED });

    expect(
      await retractComunicadoAction({ comunicadoId: 7, reason: REASON }),
    ).toEqual(BLOCKED);
    expect(mocks.retract).not.toHaveBeenCalled();
  });

  it("retracts as the acting admin with the reason trimmed, and refreshes the list and the page", async () => {
    expect(
      await retractComunicadoAction({
        comunicadoId: 7,
        reason: `  ${REASON}\u0000 \n`,
      }),
    ).toEqual({
      success: true,
      message: "Lo retiramos de las notificaciones.",
    });
    expect(mocks.retract).toHaveBeenCalledWith(7, { reason: REASON }, 42);
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/dashboard/communications"],
      ["/dashboard/communications/7"],
    ]);
  });

  it.each([
    ["no reason", undefined, "Contá por qué lo retirás."],
    ["an empty one", "", "Contá por qué lo retirás."],
    ["only spaces", " \n\t ", "Contá por qué lo retirás."],
    [
      "one past 300 characters",
      "a".repeat(301),
      "El motivo puede tener hasta 300 caracteres.",
    ],
  ])("refuses %s, retracting nothing", async (_label, reason, message) => {
    expect(await retractComunicadoAction({ comunicadoId: 7, reason })).toEqual({
      success: false,
      message,
    });
    expect(mocks.retract).not.toHaveBeenCalled();
  });

  it("takes 300 characters, counted after trimming", async () => {
    const reason = "a".repeat(300);
    await retractComunicadoAction({ comunicadoId: 7, reason: ` ${reason} ` });
    expect(mocks.retract).toHaveBeenCalledWith(7, { reason }, 42);
  });

  it.each([
    ["an id that is not one", { comunicadoId: "7", reason: REASON }],
    ["no input at all", undefined],
  ])("refuses %s as not found", async (_label, input) => {
    expect(await retractComunicadoAction(input)).toEqual({
      success: false,
      message: "No encontramos este comunicado.",
    });
    expect(mocks.retract).not.toHaveBeenCalled();
  });

  it("passes on the retraction's refusal without refreshing anything", async () => {
    mocks.retract.mockResolvedValue({
      ok: false,
      code: "ALREADY_RETRACTED",
      message: "Este comunicado ya fue retirado.",
    });

    expect(
      await retractComunicadoAction({ comunicadoId: 7, reason: REASON }),
    ).toEqual({ success: false, message: "Este comunicado ya fue retirado." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("logs an unexpected failure through the type-only logger", async () => {
    const error = new Error("connection lost");
    mocks.retract.mockRejectedValue(error);

    expect(
      await retractComunicadoAction({ comunicadoId: 7, reason: REASON }),
    ).toEqual({
      success: false,
      message: "No pudimos retirarlo. Probá de nuevo.",
    });
    expect(mocks.logFailure).toHaveBeenCalledWith(
      "[comunicados] retract failed",
      error,
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
