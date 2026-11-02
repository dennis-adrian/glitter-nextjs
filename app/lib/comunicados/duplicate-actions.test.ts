// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  logFailure: vi.fn(),
  revalidatePath: vi.fn(),
  duplicate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/app/lib/comunicados/actor", () => ({
  comunicadosActor: mocks.actor,
  logComunicadosFailure: mocks.logFailure,
}));
vi.mock("@/app/lib/comunicados/duplicate", () => ({
  duplicateComunicado: mocks.duplicate,
}));

import { duplicateComunicadoAction } from "@/app/lib/comunicados/duplicate-actions";

const ADMIN = { id: 42, role: "admin" };
const BLOCKED = { success: false, message: "No autorizado." } as const;

beforeEach(() => {
  mocks.actor.mockResolvedValue({ actor: ADMIN, blocked: null });
  mocks.duplicate.mockResolvedValue(108);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("duplicateComunicadoAction", () => {
  it("refuses anyone the guard refuses before reading the input", async () => {
    mocks.actor.mockResolvedValue({ actor: null, blocked: BLOCKED });

    expect(await duplicateComunicadoAction("7")).toEqual(BLOCKED);
    expect(await duplicateComunicadoAction(7)).toEqual(BLOCKED);
    expect(mocks.duplicate).not.toHaveBeenCalled();
  });

  it("copies as the acting admin, returns the new draft's id and refreshes the list", async () => {
    expect(await duplicateComunicadoAction(7)).toEqual({
      success: true,
      comunicadoId: 108,
    });
    expect(mocks.duplicate).toHaveBeenCalledWith(7, 42);
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/dashboard/communications"],
    ]);
  });

  it("says it was not found when the source is gone", async () => {
    mocks.duplicate.mockResolvedValue(null);

    expect(await duplicateComunicadoAction(7)).toEqual({
      success: false,
      message: "No encontramos este comunicado.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["an id that is not one", "7"],
    ["zero", 0],
    ["nothing", undefined],
  ])("refuses %s as not found", async (_label, input) => {
    expect(await duplicateComunicadoAction(input)).toEqual({
      success: false,
      message: "No encontramos este comunicado.",
    });
    expect(mocks.duplicate).not.toHaveBeenCalled();
  });

  it("logs an unexpected failure through the type-only logger", async () => {
    const error = new Error("connection lost");
    mocks.duplicate.mockRejectedValue(error);

    expect(await duplicateComunicadoAction(7)).toEqual({
      success: false,
      message: "No pudimos duplicarlo. Probá de nuevo.",
    });
    expect(mocks.logFailure).toHaveBeenCalledWith(
      "[comunicados] duplicate failed",
      error,
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
