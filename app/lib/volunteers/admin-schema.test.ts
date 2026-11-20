// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";

import {
  VOLUNTEER_ADMIN_NOTES_MAX_LENGTH,
  volunteerActiveInputSchema,
  volunteerAssignmentInputSchema,
  volunteerCallSettingsInputSchema,
  volunteerNotesInputSchema,
  volunteerRoleInputSchema,
  volunteerShiftInputSchema,
  volunteerStatusInputSchema,
} from "@/app/lib/volunteers/admin-schema";

function firstMessage(result: {
  success: boolean;
  error?: { issues: { message: string; path: PropertyKey[] }[] };
}) {
  return result.error?.issues[0];
}

const originalTz = process.env.TZ;
afterEach(() => {
  // Assigning undefined would store the string "undefined", an invalid zone.
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe("volunteerStatusInputSchema", () => {
  it("accepts the four statuses and coerces ids", () => {
    expect(
      volunteerStatusInputSchema.parse({
        festivalId: "3",
        applicationId: 9,
        status: "waitlist",
      }),
    ).toEqual({ festivalId: 3, applicationId: 9, status: "waitlist" });
  });

  it("refuses another status", () => {
    const result = volunteerStatusInputSchema.safeParse({
      festivalId: 3,
      applicationId: 9,
      status: "approved",
    });
    expect(firstMessage(result)?.message).toBe("Elegí un estado.");
  });
});

describe("volunteerNotesInputSchema", () => {
  it("trims, and stores blank notes as null", () => {
    expect(
      volunteerNotesInputSchema.parse({
        festivalId: 1,
        applicationId: 2,
        adminNotes: "  Llamar el lunes  ",
      }).adminNotes,
    ).toBe("Llamar el lunes");
    expect(
      volunteerNotesInputSchema.parse({
        festivalId: 1,
        applicationId: 2,
        adminNotes: "   ",
      }).adminNotes,
    ).toBeNull();
  });

  it("refuses notes over the maximum", () => {
    const result = volunteerNotesInputSchema.safeParse({
      festivalId: 1,
      applicationId: 2,
      adminNotes: "a".repeat(VOLUNTEER_ADMIN_NOTES_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });
});

describe("volunteerAssignmentInputSchema", () => {
  it("dedupes shift ids and keeps a null role", () => {
    expect(
      volunteerAssignmentInputSchema.parse({
        festivalId: 1,
        applicationId: 2,
        roleId: null,
        shiftIds: [5, "5", 6],
      }),
    ).toEqual({
      festivalId: 1,
      applicationId: 2,
      roleId: null,
      shiftIds: [5, 6],
    });
  });
});

describe("volunteerCallSettingsInputSchema", () => {
  const base = {
    festivalId: 1,
    applicationsCloseAt: "2026-11-30T23:59",
    inductionDate: "",
    inductionTime: "",
  };

  it("reads the closing as La Paz time and blanks as null", () => {
    expect(volunteerCallSettingsInputSchema.parse(base)).toEqual({
      festivalId: 1,
      applicationsCloseAt: new Date("2026-12-01T03:59:00.000Z"),
      inductionDate: null,
      inductionTime: null,
    });
  });

  it("gives the same instant whatever the server's zone", () => {
    process.env.TZ = "Asia/Tokyo";
    const tokyo = volunteerCallSettingsInputSchema.parse(base);
    process.env.TZ = "UTC";
    const utc = volunteerCallSettingsInputSchema.parse(base);
    expect(tokyo.applicationsCloseAt.toISOString()).toBe(
      "2026-12-01T03:59:00.000Z",
    );
    expect(utc.applicationsCloseAt).toEqual(tokyo.applicationsCloseAt);
  });

  it("keeps the induction date and the time as HH:mm", () => {
    const parsed = volunteerCallSettingsInputSchema.parse({
      ...base,
      inductionDate: "2026-12-12",
      inductionTime: "18:00:00",
    });
    expect(parsed.inductionDate).toBe("2026-12-12");
    expect(parsed.inductionTime).toBe("18:00");
  });

  it("requires the date when there is a time", () => {
    const issue = firstMessage(
      volunteerCallSettingsInputSchema.safeParse({
        ...base,
        inductionTime: "18:00",
      }),
    );
    expect(issue?.path).toEqual(["inductionDate"]);
    expect(issue?.message).toBe("Indicá la fecha de la inducción.");
  });

  it("refuses a missing closing, a bad date and a bad time", () => {
    expect(
      firstMessage(
        volunteerCallSettingsInputSchema.safeParse({
          ...base,
          applicationsCloseAt: "",
        }),
      )?.message,
    ).toBe("Indicá la fecha y la hora de cierre.");
    expect(
      firstMessage(
        volunteerCallSettingsInputSchema.safeParse({
          ...base,
          inductionDate: "2026-02-30",
        }),
      )?.message,
    ).toBe("La fecha no es válida.");
    expect(
      firstMessage(
        volunteerCallSettingsInputSchema.safeParse({
          ...base,
          inductionDate: "2026-12-12",
          inductionTime: "25:00",
        }),
      )?.message,
    ).toBe("La hora no es válida.");
  });
});

describe("volunteerRoleInputSchema", () => {
  it("creates without a role id and trims", () => {
    expect(
      volunteerRoleInputSchema.parse({
        festivalId: 1,
        name: "  Acreditación ",
        description: " Recibir al público ",
        sortOrder: "2",
      }),
    ).toEqual({
      festivalId: 1,
      name: "Acreditación",
      description: "Recibir al público",
      sortOrder: 2,
    });
  });

  it("refuses a blank name or a negative order", () => {
    expect(
      firstMessage(
        volunteerRoleInputSchema.safeParse({
          festivalId: 1,
          name: " ",
          description: "x",
          sortOrder: 0,
        }),
      )?.message,
    ).toBe("Escribí el nombre del rol.");
    expect(
      firstMessage(
        volunteerRoleInputSchema.safeParse({
          festivalId: 1,
          name: "Rol",
          description: "x",
          sortOrder: -1,
        }),
      )?.message,
    ).toBe("No puede ser negativo.");
  });
});

describe("volunteerShiftInputSchema", () => {
  const base = {
    festivalId: 1,
    label: "Montaje",
    startsAt: "2026-12-18T15:00",
    endsAt: "2026-12-18T21:00",
    neededHeadcount: "6",
    sortOrder: 0,
  };

  it("reads start and end as La Paz time, whatever the server's zone", () => {
    process.env.TZ = "America/New_York";
    const parsed = volunteerShiftInputSchema.parse(base);
    expect(parsed.startsAt.toISOString()).toBe("2026-12-18T19:00:00.000Z");
    expect(parsed.endsAt.toISOString()).toBe("2026-12-19T01:00:00.000Z");
    expect(parsed.neededHeadcount).toBe(6);
    expect(parsed.shiftId).toBeUndefined();
  });

  it("requires the end after the start", () => {
    for (const endsAt of ["2026-12-18T15:00", "2026-12-18T14:00"]) {
      const issue = firstMessage(
        volunteerShiftInputSchema.safeParse({ ...base, endsAt }),
      );
      expect(issue?.path).toEqual(["endsAt"]);
      expect(issue?.message).toBe("El fin tiene que ser posterior al inicio.");
    }
  });

  it("refuses a missing start", () => {
    expect(
      firstMessage(
        volunteerShiftInputSchema.safeParse({ ...base, startsAt: "" }),
      )?.message,
    ).toBe("Indicá cuándo empieza.");
  });
});

describe("volunteerActiveInputSchema", () => {
  it("needs a boolean", () => {
    expect(
      volunteerActiveInputSchema.safeParse({
        festivalId: 1,
        id: 2,
        isActive: "true",
      }).success,
    ).toBe(false);
    expect(
      volunteerActiveInputSchema.parse({
        festivalId: 1,
        id: 2,
        isActive: false,
      }),
    ).toEqual({ festivalId: 1, id: 2, isActive: false });
  });
});
