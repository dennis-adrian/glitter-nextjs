import { describe, expect, it } from "vitest";

import {
  credentialFilterParams,
  credentialParticipantLines,
  credentialRuleCopy,
  credentialsExportPath,
  credentialsPath,
  DEFAULT_CREDENTIAL_FILTERS,
  DEFAULT_CREDENTIAL_RULES,
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
      "2 por espacio: 1 con nombre por participante y el resto sin nombre",
    );
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
