import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COMUNICADOS_CRON_DEADLINE_MS,
  type ComunicadoAudienceSummary,
  PROCESS_BUTTON_DEADLINE_MS,
  parseComunicadoAudienceSummary,
  SEND_AFTER_DEADLINE_MS,
} from "@/app/lib/comunicados/definitions";

/** As the send freezes it for a festival list plus a person, in production. */
const SUMMARY: ComunicadoAudienceSummary = {
  v: 1,
  env: "production",
  narrowed: false,
  sources: [
    {
      kind: "festival",
      id: 12,
      label: "Confirmados · Glitter Primavera",
      matched: 140,
      eligible: 131,
    },
    { kind: "people", id: null, label: "1 persona", matched: 1, eligible: 1 },
  ],
  matched: 141,
  eligible: 132,
  willReceive: 132,
  stagingAdmins: 0,
  pickedByName: 1,
  skipped: [
    { reason: "Perfil no verificado", count: 6 },
    { reason: "Cuenta suspendida", count: 3 },
  ],
  channels: { email: true, push: false },
  email: {
    sendTo: 120,
    unsubscribedAnnouncements: 7,
    unsubscribedAll: 3,
    suppressed: 1,
    invalid: 1,
  },
  essentialFestival: { id: 12, name: "Glitter Primavera" },
  essentialOverride: 7,
  essentialNotOverridden: 4,
};

describe("parseComunicadoAudienceSummary", () => {
  it("reads back a summary as the send stores it", () => {
    // jsonb hands it back as plain JSON.
    const stored: unknown = JSON.parse(JSON.stringify(SUMMARY));
    expect(parseComunicadoAudienceSummary(stored)).toEqual(SUMMARY);
  });

  it("reads one from a test environment without an essential festival", () => {
    const narrowed = {
      ...SUMMARY,
      env: "preview",
      narrowed: true,
      stagingAdmins: 4,
      essentialFestival: null,
    };
    expect(parseComunicadoAudienceSummary(narrowed)).toEqual(narrowed);
  });

  it.each([
    ["nothing", null],
    ["a draft's empty object", {}],
    ["no environment", { ...SUMMARY, env: undefined }],
    ["an environment Vercel does not have", { ...SUMMARY, env: "staging" }],
    ["another version", { ...SUMMARY, v: 2 }],
    ["a negative count", { ...SUMMARY, eligible: -1 }],
    ["a fractional count", { ...SUMMARY, willReceive: 1.5 }],
    ["a count as text", { ...SUMMARY, matched: "141" }],
    ["no email split", { ...SUMMARY, email: undefined }],
    [
      "a source of an unknown kind",
      { ...SUMMARY, sources: [{ ...SUMMARY.sources[0], kind: "segment" }] },
    ],
    [
      "a skip without its count",
      { ...SUMMARY, skipped: [{ reason: "Cuenta suspendida" }] },
    ],
  ])("is null for %s", (_label, value) => {
    expect(parseComunicadoAudienceSummary(value)).toBeNull();
  });
});

describe("work deadlines", () => {
  it("each fits under the functions' maxDuration in vercel.json", () => {
    const vercel = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
    ) as { functions: Record<string, { maxDuration: number }> };
    const capMs = vercel.functions["app/**/*"]!.maxDuration * 1_000;

    for (const deadline of [
      COMUNICADOS_CRON_DEADLINE_MS,
      SEND_AFTER_DEADLINE_MS,
      PROCESS_BUTTON_DEADLINE_MS,
    ]) {
      expect(deadline).toBeLessThan(capMs);
    }
  });
});
