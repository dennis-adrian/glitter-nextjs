// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  serializeVolunteerExportCsv,
  VOLUNTEER_EXPORT_HEADER,
  type VolunteerExport,
  type VolunteerExportApplication,
  volunteerExportFilename,
} from "@/app/lib/volunteers/admin-export";

const { requireAdminOrFestivalAdmin, fetchVolunteerApplicationsForExport } =
  vi.hoisted(() => ({
    requireAdminOrFestivalAdmin: vi.fn(),
    fetchVolunteerApplicationsForExport: vi.fn(),
  }));

vi.mock("@/app/lib/users/helpers", () => ({ requireAdminOrFestivalAdmin }));
vi.mock("@/app/lib/volunteers/admin-queries", () => ({
  fetchVolunteerApplicationsForExport,
}));

import { GET } from "@/app/dashboard/festivals/[id]/volunteers/export/route";

/** An instant from La Paz wall-clock time (UTC-4, no DST). */
function laPaz(isoLocal: string) {
  return new Date(`${isoLocal}:00-04:00`);
}

const TODAY = laPaz("2026-11-21T10:00");

function application(
  overrides: Partial<VolunteerExportApplication> = {},
): VolunteerExportApplication {
  return {
    id: 1,
    fullName: "Camila Rojas",
    status: "accepted",
    phone: "+59170000001",
    email: "camila@example.test",
    birthdate: "2004-11-22",
    zone: "Sopocachi",
    firstChoiceRoleName: "Acreditación",
    secondChoiceRoleName: "Fotografía",
    assignedRoleName: "Acreditación",
    availableShiftIds: [12, 11],
    assignedShiftIds: [11],
    experience: ["events", "own_camera"],
    experienceNotes: null,
    portfolio: "https://example.test/camila",
    motivation: 'Me gusta "ayudar",\nde verdad.',
    emergencyContactName: "Ana Rojas",
    emergencyContactPhone: "+59171234567",
    referralSource: "instagram",
    imageConsent: true,
    adminNotes: null,
    // 22:30 in La Paz is already the 22nd in UTC.
    createdAt: laPaz("2026-11-20T22:30"),
    ...overrides,
  };
}

function exportOf(applications: VolunteerExportApplication[]): VolunteerExport {
  return {
    festival: { id: 7, name: "Glitter Diciembre 2026" },
    shifts: [
      {
        id: 11,
        label: "Montaje",
        startsAt: laPaz("2026-12-18T15:00"),
        endsAt: laPaz("2026-12-18T19:00"),
      },
      {
        id: 12,
        label: "Mañana",
        startsAt: laPaz("2026-12-19T09:00"),
        endsAt: laPaz("2026-12-19T13:00"),
      },
    ],
    applications,
  };
}

/** A minimal RFC 4180 reader: every cell of ours is quoted. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function asRecord(csv: string, rowIndex = 1) {
  const rows = parseCsv(csv);
  return Object.fromEntries(
    rows[0]!.map((header, index) => [header, rows[rowIndex]![index]]),
  );
}

describe("serializeVolunteerExportCsv", () => {
  it("writes the Spanish header, then one row per application", () => {
    const csv = serializeVolunteerExportCsv(
      exportOf([application(), application({ id: 2, fullName: "Otra" })]),
      TODAY,
    );
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([...VOLUNTEER_EXPORT_HEADER]);
    expect(rows).toHaveLength(3);
    expect(
      rows.every((row) => row.length === VOLUNTEER_EXPORT_HEADER.length),
    ).toBe(true);
  });

  it("spells out every answer and the decision", () => {
    const record = asRecord(
      serializeVolunteerExportCsv(exportOf([application()]), TODAY),
    );
    expect(record).toEqual({
      Nombre: "Camila Rojas",
      Estado: "Aceptada",
      Celular: "+59170000001",
      Correo: "camila@example.test",
      "Fecha de nacimiento": "22/11/2004",
      // Turns 22 tomorrow.
      Edad: "21",
      Zona: "Sopocachi",
      "1ª opción": "Acreditación",
      "2ª opción": "Fotografía",
      "Turnos disponibles":
        "Vie 18 dic · 15:00–19:00 (Montaje); Sáb 19 dic · 09:00–13:00 (Mañana)",
      "Rol asignado": "Acreditación",
      "Turnos asignados": "Vie 18 dic · 15:00–19:00 (Montaje)",
      Experiencia: "Eventos, Tiene cámara propia o iPhone",
      "Otra experiencia": "",
      Portafolio: "https://example.test/camila",
      "¿Por qué?": 'Me gusta "ayudar",\nde verdad.',
      "Contacto de emergencia": "Ana Rojas",
      "Celular de emergencia": "+59171234567",
      "Cómo se enteró": "Instagram",
      "Uso de imagen": "Autorizó",
      "Postuló el": "20/11/2026 22:30",
      "Notas internas": "",
    });
  });

  it("leaves blanks for what is missing", () => {
    const record = asRecord(
      serializeVolunteerExportCsv(
        exportOf([
          application({
            status: "pending",
            zone: null,
            assignedRoleName: null,
            availableShiftIds: [],
            assignedShiftIds: [],
            experience: [],
            portfolio: null,
            imageConsent: false,
          }),
        ]),
        TODAY,
      ),
    );
    expect(record).toMatchObject({
      Estado: "Pendiente",
      Zona: "",
      "Rol asignado": "",
      "Turnos disponibles": "",
      "Turnos asignados": "",
      Experiencia: "",
      Portafolio: "",
      "Uso de imagen": "No autorizó",
    });
  });

  it("neutralizes formulas an applicant could type", () => {
    const record = asRecord(
      serializeVolunteerExportCsv(
        exportOf([
          application({
            fullName: '=HYPERLINK("https://evil.test","x")',
            zone: "+1+1",
            experienceNotes: "-2+3",
            motivation: "@SUM(A1)",
            adminNotes: "  =1+1",
          }),
        ]),
        TODAY,
      ),
    );
    expect(record.Nombre).toBe(`'=HYPERLINK("https://evil.test","x")`);
    expect(record.Zona).toBe("'+1+1");
    expect(record["Otra experiencia"]).toBe("'-2+3");
    expect(record["¿Por qué?"]).toBe("'@SUM(A1)");
    expect(record["Notas internas"]).toBe("'  =1+1");
    // A plain phone number is not a formula.
    expect(record.Celular).toBe("+59170000001");
  });
});

describe("volunteerExportFilename", () => {
  it("slugs the festival's name and dates it in La Paz", () => {
    // 23:30 on the 21st in La Paz is the 22nd in UTC.
    expect(
      volunteerExportFilename(
        { id: 7, name: "Glitter Navideño 2026!" },
        laPaz("2026-11-21T23:30"),
      ),
    ).toBe("voluntarios-glitter-navideno-2026-2026-11-21.csv");
  });

  it("falls back to the id when the name has no ASCII letters or digits", () => {
    expect(volunteerExportFilename({ id: 7, name: "✨✨" }, TODAY)).toBe(
      "voluntarios-7-2026-11-21.csv",
    );
  });
});

describe("GET /dashboard/festivals/[id]/volunteers/export", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const request = new Request("https://example.test/export");

  beforeEach(() => {
    requireAdminOrFestivalAdmin.mockReset();
    fetchVolunteerApplicationsForExport.mockReset();
  });

  it("refuses anyone but an admin or festival admin, without reading", async () => {
    requireAdminOrFestivalAdmin.mockResolvedValue(null);
    const response = await GET(request, params("7"));
    expect(response.status).toBe(401);
    expect(fetchVolunteerApplicationsForExport).not.toHaveBeenCalled();
  });

  it("is 404 for a bad id or a festival that does not exist", async () => {
    requireAdminOrFestivalAdmin.mockResolvedValue({ id: 1, role: "admin" });
    expect((await GET(request, params("abc"))).status).toBe(404);
    expect((await GET(request, params("99999999999"))).status).toBe(404);
    expect(fetchVolunteerApplicationsForExport).not.toHaveBeenCalled();

    fetchVolunteerApplicationsForExport.mockResolvedValue(null);
    expect((await GET(request, params("7"))).status).toBe(404);
  });

  it("downloads the CSV with a BOM, never cached", async () => {
    requireAdminOrFestivalAdmin.mockResolvedValue({
      id: 1,
      role: "festival_admin",
    });
    fetchVolunteerApplicationsForExport.mockResolvedValue(
      exportOf([application({ fullName: "=cmd" })]),
    );

    const response = await GET(request, params("7"));

    expect(fetchVolunteerApplicationsForExport).toHaveBeenCalledWith(7);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="voluntarios-glitter-diciembre-2026-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const body = (await response.text()).replace(/^﻿/, "");
    const rows = parseCsv(body);
    expect(rows[0]![0]).toBe("Nombre");
    expect(rows[1]![0]).toBe("'=cmd");
  });
});
