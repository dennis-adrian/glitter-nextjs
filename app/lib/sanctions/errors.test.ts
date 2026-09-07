import { describe, expect, it } from "vitest";

import {
  mapSanctionMutationError,
  sanctionDomainError,
} from "@/app/lib/sanctions/errors";

describe("sanction mutation error mapping", () => {
  it("preserves approved domain errors", () => {
    expect(
      mapSanctionMutationError(
        sanctionDomainError("Sanción no encontrada", "not_found"),
        "Falló",
      ),
    ).toEqual({
      success: false,
      message: "Sanción no encontrada",
      code: "not_found",
    });
  });

  it("maps nested PostgreSQL unique violations without exposing details", () => {
    const error = Object.assign(new Error("Failed query: secret SQL"), {
      cause: Object.assign(new Error("duplicate key value"), { code: "23505" }),
    });

    const result = mapSanctionMutationError(error, "Falló");

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ code: "conflict" });
    expect(result.message).not.toContain("secret SQL");
    expect(result.message).not.toContain("duplicate key");
  });

  it("uses the safe fallback for unknown errors", () => {
    expect(
      mapSanctionMutationError(
        new Error("connection details must stay private"),
        "No se pudo actualizar la sanción",
      ),
    ).toEqual({
      success: false,
      message: "No se pudo actualizar la sanción",
    });
  });
});
