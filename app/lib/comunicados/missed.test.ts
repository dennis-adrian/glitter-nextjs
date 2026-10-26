import { describe, expect, it } from "vitest";

import {
  SEND_REFUSAL_CODES,
  type SendRefusalCode,
} from "@/app/lib/comunicados/contracts";
import {
  missedDetailOf,
  missedReasonOf,
  refusalClause,
} from "@/app/lib/comunicados/missed";
import { unreadableListFilterMessage } from "@/app/lib/distribution_lists/definitions";
import { comunicadoNotSentBody } from "@/app/lib/notifications/kinds/comunicado";

function detailOf(
  code: SendRefusalCode,
  message = "Algo no se pudo usar.",
  eligible: number | null = null,
) {
  return missedDetailOf({ code, message, eligible });
}

describe("missedReasonOf (E4)", () => {
  const REASONS = [
    ["LATE", "late"],
    ["AUDIENCE_TOO_LARGE", "too_large"],
    ["NO_ELIGIBLE_RECIPIENTS", "empty"],
    ["SENDER_NOT_ADMIN", "sender_not_admin"],
    ["INVALID_CONTENT", "invalid"],
    ["INVALID_AUDIENCE", "invalid"],
    ["ESSENTIAL_NOT_ALLOWED", "invalid"],
    ["BASE_URL", "invalid"],
    // The row changed under the claim, or a typed count: not a miss.
    ["NOT_FOUND", null],
    ["STALE", null],
    ["AUDIENCE_CHANGED", null],
  ] as const;

  it.each(REASONS)("records %s as %s", (code, reason) => {
    expect(missedReasonOf(code)).toBe(reason);
  });

  it("knows every refusal a send can throw", () => {
    expect(REASONS.map(([code]) => code).sort()).toEqual(
      [...SEND_REFUSAL_CODES].sort(),
    );
  });
});

describe("refusalClause", () => {
  it("keeps the first part of the sentence, lower-cased, with no period", () => {
    expect(refusalClause(unreadableListFilterMessage("Ilustradores"))).toBe(
      "la lista «Ilustradores» tiene un filtro que ya no se puede leer",
    );
    expect(
      refusalClause(
        "No pudimos leer los destinatarios guardados. Elegilos de nuevo.",
      ),
    ).toBe("no pudimos leer los destinatarios guardados");
    expect(refusalClause("Esa lista ya no está disponible.")).toBe(
      "esa lista ya no está disponible",
    );
  });

  it("leaves a word in capitals as it is", () => {
    expect(refusalClause("URL sin configurar.")).toBe("URL sin configurar");
    expect(refusalClause("«Ilustradores» ya no existe")).toBe(
      "«Ilustradores» ya no existe",
    );
  });
});

describe("missedDetailOf (G9)", () => {
  it("counts a too-large audience as the bell says it", () => {
    expect(detailOf("AUDIENCE_TOO_LARGE", "Por ahora…", 3120)).toBe(
      "la audiencia sumaba 3.120 personas y el máximo es 3.000",
    );
    // No count to show: the body has its own words.
    expect(detailOf("AUDIENCE_TOO_LARGE", "Por ahora…", null)).toBeNull();
  });

  it("words the invalid refusals as clauses", () => {
    expect(detailOf("ESSENTIAL_NOT_ALLOWED")).toBe(
      "el festival ya terminó y no puede ser esencial",
    );
    expect(detailOf("BASE_URL")).toBe(
      "falta configurar la dirección pública del sitio, así que los enlaces del correo no funcionarían",
    );
    expect(
      detailOf("INVALID_AUDIENCE", unreadableListFilterMessage("Ilustradores")),
    ).toBe("la lista «Ilustradores» tiene un filtro que ya no se puede leer");
    expect(
      detailOf("INVALID_CONTENT", "Escribí el texto del comunicado."),
    ).toBe(
      "el contenido no se pudo validar («Escribí el texto del comunicado»)",
    );
  });

  it.each([
    "LATE",
    "NO_ELIGIBLE_RECIPIENTS",
    "SENDER_NOT_ADMIN",
    "NOT_FOUND",
    "STALE",
    "AUDIENCE_CHANGED",
  ] as const)("has none for %s", (code) => {
    expect(detailOf(code, "Algo.", 12)).toBeNull();
  });

  it("cuts a long one on a word boundary, within 300 characters", () => {
    const name = "Ilustradores de la feria ".repeat(16).trim();
    const clause = refusalClause(unreadableListFilterMessage(name));
    expect(clause.length).toBeGreaterThan(300);

    const audience = detailOf(
      "INVALID_AUDIENCE",
      unreadableListFilterMessage(name),
    )!;
    expect(audience.length).toBeLessThanOrEqual(300);
    expect(audience.endsWith("…")).toBe(true);
    const kept = audience.slice(0, -1);
    expect(clause.startsWith(kept)).toBe(true);
    expect(clause[kept.length]).toBe(" ");

    // The content's own message is the part cut, so the quote still closes.
    const content = detailOf(
      "INVALID_CONTENT",
      `${"Texto largo ".repeat(40)}.`,
    )!;
    expect(content.length).toBeLessThanOrEqual(300);
    expect(content).toMatch(
      /^el contenido no se pudo validar \(«Texto .*\S…»\)$/,
    );
  });

  it("makes the sentence the draft and the bell show (D1)", () => {
    expect(
      comunicadoNotSentBody({
        comunicadoId: 7,
        title: "",
        reason: "too_large",
        detail: detailOf("AUDIENCE_TOO_LARGE", "Por ahora…", 3120),
        scheduledAt: "2026-10-31T13:00:00.000Z",
        audienceCount: 3120,
      }),
    ).toBe(
      "Al enviarlo, la audiencia sumaba 3.120 personas y el máximo es 3.000. Quedó como borrador.",
    );
  });
});
