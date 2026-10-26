// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Profile = { id: number; role: string };
const mocks = vi.hoisted(() => ({
  profile: null as Profile | null,
  flagOn: true,
  guard: vi.fn(),
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => mocks.profile,
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  featureFlagGuard: mocks.guard,
}));

import {
  comunicadosActor,
  logComunicadosFailure,
} from "@/app/lib/comunicados/actor";

const FLAG_OFF = {
  success: false,
  message: "Esta funcionalidad no está disponible",
} as const;

beforeEach(() => {
  mocks.profile = null;
  mocks.flagOn = true;
  mocks.guard.mockReset();
  mocks.guard.mockImplementation(async () => (mocks.flagOn ? null : FLAG_OFF));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("comunicadosActor", () => {
  it.each([
    ["nobody signed in", null],
    ["a festival admin", { id: 7, role: "festival_admin" }],
    ["a participant", { id: 8, role: "user" }],
  ])("refuses %s before reading the flag", async (_label, profile) => {
    mocks.profile = profile;

    expect(await comunicadosActor()).toEqual({
      actor: null,
      blocked: { success: false, message: "No autorizado." },
    });
    expect(mocks.guard).not.toHaveBeenCalled();
  });

  it("refuses a global admin while the flag is off for them", async () => {
    mocks.profile = { id: 3, role: "admin" };
    mocks.flagOn = false;

    expect(await comunicadosActor()).toEqual({
      actor: null,
      blocked: FLAG_OFF,
    });
    expect(mocks.guard).toHaveBeenCalledWith("comunicados", mocks.profile);
  });

  it("lets a global admin with the flag through", async () => {
    mocks.profile = { id: 3, role: "admin" };

    expect(await comunicadosActor()).toEqual({
      actor: mocks.profile,
      blocked: null,
    });
  });
});

describe("logComunicadosFailure", () => {
  it("logs the error's type, never its message", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logComunicadosFailure(
      "Error sending a comunicado",
      new TypeError("bad address ana@example.test"),
    );
    logComunicadosFailure("Error sending a comunicado", "ana@example.test");

    expect(error.mock.calls).toEqual([
      ["Error sending a comunicado", { errorType: "TypeError" }],
      ["Error sending a comunicado", { errorType: "string" }],
    ]);
  });
});
