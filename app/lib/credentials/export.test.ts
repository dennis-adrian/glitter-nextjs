// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addReservation,
  batch,
  emptyData,
} from "@/app/lib/credentials/__fixtures__/data";
import { buildView } from "@/app/lib/credentials/calculate";
import {
  DEFAULT_CREDENTIAL_FILTERS,
  DEFAULT_CREDENTIAL_RULES,
} from "@/app/lib/credentials/definitions";
import {
  CREDENTIALS_CSV_HEADER,
  credentialsExportFilename,
  serializeCredentialsCsv,
} from "@/app/lib/credentials/export";

const requireAdminOrFestivalAdmin = vi.hoisted(() => vi.fn());
const isFeatureEnabled = vi.hoisted(() => vi.fn());
const fetchCredentialsData = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/app/lib/users/helpers", () => ({ requireAdminOrFestivalAdmin }));
vi.mock("@/app/lib/feature_flags/helpers", () => ({ isFeatureEnabled }));
vi.mock("@/app/lib/credentials/queries", () => ({ fetchCredentialsData }));

function festival() {
  const data = emptyData();
  addReservation(data, {
    category: "gastronomy",
    people: [{ name: "Cocina" }],
    label: "G",
    firstNumber: 2,
  });
  addReservation(data, {
    people: [{ name: "=HYPERLINK(\"x\")" }, { name: "Socia" }],
    label: "A",
    firstNumber: 1,
  });
  addReservation(data, { people: [{ name: "Pendiente" }], status: "pending" });
  return data;
}

describe("serializeCredentialsCsv", () => {
  it("writes the header, rows in the page's order, and neutralises formulas", () => {
    const view = buildView(festival(), DEFAULT_CREDENTIAL_RULES, DEFAULT_CREDENTIAL_FILTERS);
    const lines = serializeCredentialsCsv(view.holders).split("\n");
    expect(lines[0]).toBe(CREDENTIALS_CSV_HEADER.map((cell) => `"${cell}"`).join(","));
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain(`"Ilustración","'=HYPERLINK(""x"")","Comparte con Socia","A1","Confirmada","1","0","Nueva"`);
    expect(lines[2]).toContain(`"Socia"`);
    expect(lines[3]).toContain(`"Gastronomía","Cocina","No comparte espacio","G2","Confirmada","2","0"`);
  });

  it("leaves out what no longer applies", () => {
    const data = festival();
    data.batches.push(
      batch([
        {
          unitKey: "participant:1",
          group: "illustration",
          userId: null,
          printedName: "Ya no está",
          detail: "C9",
          namedCount: 1,
          unnamedCount: 0,
          isReprint: false,
        },
      ]),
    );
    const view = buildView(data, DEFAULT_CREDENTIAL_RULES, DEFAULT_CREDENTIAL_FILTERS);
    expect(view.holders.some((holder) => holder.stale)).toBe(true);
    expect(serializeCredentialsCsv(view.holders)).not.toContain("Ya no está");
  });
});

describe("credentialsExportFilename", () => {
  it("uses the festival's slug and La Paz's date", () => {
    expect(
      credentialsExportFilename(
        { id: 7, name: "Glitter Navidad 2026 — Edición" },
        new Date("2026-12-01T02:00:00Z"),
      ),
    ).toBe("credenciales-glitter-navidad-2026-edicion-2026-11-30.csv");
    expect(credentialsExportFilename({ id: 7, name: "¡¡!!" }, new Date("2026-12-01T12:00:00Z"))).toBe(
      "credenciales-7-2026-12-01.csv",
    );
  });
});

describe("GET /dashboard/festivals/[id]/credentials/export", () => {
  let GET: typeof import("@/app/(site)/dashboard/festivals/[id]/credentials/export/route").GET;
  const call = (id: string, search = "") =>
    GET(new Request(`http://localhost/dashboard/festivals/${id}/credentials/export${search}`), {
      params: Promise.resolve({ id }),
    });

  beforeEach(async () => {
    requireAdminOrFestivalAdmin.mockResolvedValue({ id: 1, role: "festival_admin" });
    isFeatureEnabled.mockResolvedValue(true);
    fetchCredentialsData.mockResolvedValue(festival());
    ({ GET } = await import("@/app/(site)/dashboard/festivals/[id]/credentials/export/route"));
  });
  afterEach(() => vi.clearAllMocks());

  it("refuses anyone who is not staff", async () => {
    requireAdminOrFestivalAdmin.mockResolvedValue(null);
    const response = await call("1");
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("No autorizado");
  });

  it("is not found while the flag is off", async () => {
    isFeatureEnabled.mockResolvedValue(false);
    expect((await call("1")).status).toBe(404);
    expect(fetchCredentialsData).not.toHaveBeenCalled();
  });

  it("is not found for a bad id or a missing festival", async () => {
    expect((await call("abc")).status).toBe(404);
    fetchCredentialsData.mockResolvedValue(null);
    expect((await call("99")).status).toBe(404);
  });

  it("answers a private UTF-8 CSV with the page's filters", async () => {
    const response = await call("1", "?estados=pendientes");
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="credenciales-festival-de-muestra-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    const body = new Uint8Array(await response.arrayBuffer());
    expect([...body.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(body)).toContain('"Pendiente"');
    expect(await (await call("1")).text()).not.toContain('"Pendiente"');
  });
});
