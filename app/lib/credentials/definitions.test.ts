import { describe, expect, it } from "vitest";

import { emptyData } from "@/app/lib/credentials/__fixtures__/data";
import { buildHolders } from "@/app/lib/credentials/calculate";
import {
  credentialFilterParams,
  credentialParticipantLines,
  credentialRuleCopy,
  credentialsExportPath,
  credentialsPath,
  DEFAULT_CREDENTIAL_FILTERS,
  DEFAULT_CREDENTIAL_RULES,
  extraCredentialUnitKey,
  parseCredentialFilters,
  parseCredentialTab,
} from "@/app/lib/credentials/definitions";

describe("credentialParticipantLines", () => {
  it("gives today's exact strings with the default rules", () => {
    expect(
      credentialParticipantLines("illustration", DEFAULT_CREDENTIAL_RULES.illustration),
    ).toEqual([
      "1 credencial por participante",
      "1 credencial para acompañante en caso de no compartir espacio con otro ilustrador",
    ]);
    expect(
      credentialParticipantLines("gastronomy", DEFAULT_CREDENTIAL_RULES.gastronomy),
    ).toEqual(["2 credenciales con el nombre del expositor"]);
    expect(
      credentialParticipantLines(
        "entrepreneurship",
        DEFAULT_CREDENTIAL_RULES.entrepreneurship,
      ),
    ).toEqual(["1 credencial para expositor", "1 credencial para acompañante"]);
  });

  it("follows a festival's own rule", () => {
    expect(
      credentialParticipantLines("entrepreneurship", {
        quantity: 3,
        namingMode: "one_per_participant",
      }),
    ).toEqual(["1 credencial para expositor", "2 credenciales para acompañantes"]);
    expect(
      credentialParticipantLines("illustration", { quantity: 1, namingMode: "all_named" }),
    ).toEqual(["1 credencial con el nombre del expositor"]);
    expect(
      credentialParticipantLines("gastronomy", { quantity: 4, namingMode: "none" }),
    ).toEqual(["4 credenciales sin nombre"]);
    expect(
      credentialParticipantLines("gastronomy", { quantity: 0, namingMode: "none" }),
    ).toEqual([]);
  });
});

describe("credentialRuleCopy", () => {
  it("describes each default group in words", () => {
    expect(credentialRuleCopy("illustration", DEFAULT_CREDENTIAL_RULES.illustration)).toBe(
      "2 por espacio: 1 con nombre por participante, hasta completar las de la reserva, y el resto sin nombre",
    );
    expect(
      credentialRuleCopy("illustration", { quantity: 1, namingMode: "one_per_participant" }),
    ).toBe("1 por espacio, con nombre por participante hasta completar las de la reserva");
    expect(credentialRuleCopy("gastronomy", DEFAULT_CREDENTIAL_RULES.gastronomy)).toBe(
      "2 por espacio, todas con el nombre del expositor",
    );
    expect(credentialRuleCopy("volunteer", DEFAULT_CREDENTIAL_RULES.volunteer)).toBe(
      "1 con nombre y rol por postulación aceptada",
    );
    expect(credentialRuleCopy("staff", { quantity: 0, namingMode: "all_named" })).toBe(
      "Sin credenciales",
    );
  });
});

describe("filters in the URL", () => {
  it("defaults to confirmed only with every other group on", () => {
    expect(parseCredentialFilters({})).toEqual(DEFAULT_CREDENTIAL_FILTERS);
    expect(credentialFilterParams(DEFAULT_CREDENTIAL_FILTERS)).toEqual({});
  });

  it("round-trips the optional statuses and groups", () => {
    const filters = parseCredentialFilters({
      estados: "pendientes,verificacion,otro",
      grupos: "voluntarios",
    });
    expect(filters).toEqual({
      statuses: { verification_payment: true, pending: true },
      groups: { external: false, volunteer: true, staff: false },
    });
    expect(parseCredentialFilters(credentialFilterParams(filters))).toEqual(filters);
  });

  it("reads an empty grupos as every group off", () => {
    expect(parseCredentialFilters({ grupos: "" }).groups).toEqual({
      external: false,
      volunteer: false,
      staff: false,
    });
  });

  it("builds the page and export links", () => {
    expect(credentialsPath(4)).toBe("/dashboard/festivals/4/credentials");
    expect(credentialsPath(4, { tab: "nombres" })).toBe(
      "/dashboard/festivals/4/credentials?tab=nombres",
    );
    expect(
      credentialsExportPath(4, {
        ...DEFAULT_CREDENTIAL_FILTERS,
        statuses: { verification_payment: false, pending: true },
      }),
    ).toBe("/dashboard/festivals/4/credentials/export?estados=pendientes");
  });
});

describe("parseCredentialTab", () => {
  it("allows the four tabs only", () => {
    expect(parseCredentialTab("reglas")).toBe("reglas");
    expect(parseCredentialTab(["equipo"])).toBe("equipo");
    expect(parseCredentialTab("otra")).toBe("resumen");
    expect(parseCredentialTab(undefined)).toBe("resumen");
  });
});

describe("extraCredentialUnitKey", () => {
  /** Removal looks printed entries up by it, so it must be what batches record. */
  it("is the key buildHolders gives a one-off entry and its unit", () => {
    const data = emptyData();
    data.extras.push(
      { id: 41, name: null, label: "Prensa", quantity: 6 },
      { id: 42, name: "Marcelo Peredo", label: "Fotografía", quantity: 1 },
    );
    const extras = buildHolders(data, DEFAULT_CREDENTIAL_RULES).holders.filter(
      (holder) => holder.kind === "extra",
    );
    expect(extras.map((holder) => [holder.key, holder.units.map((unit) => unit.key)])).toEqual([
      [extraCredentialUnitKey(41), [extraCredentialUnitKey(41)]],
      [extraCredentialUnitKey(42), [extraCredentialUnitKey(42)]],
    ]);
    expect(extraCredentialUnitKey(41)).toBe("extra:41");
  });
});
