// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";

import {
  VOLUNTEER_ADMIN_NOTES_MAX_LENGTH,
  volunteerActiveInputSchema,
  volunteerAssignmentInputSchema,
  volunteerCallSettingsInputSchema,
  volunteerNotesInputSchema,
  volunteerReviewInputSchema,
  volunteerRoleInputSchema,
  volunteerRoleMoveInputSchema,
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

describe("volunteerReviewInputSchema", () => {
  const base = {
    festivalId: "1",
    applicationId: 2,
    status: "accepted",
    roleId: "4",
    shiftIds: [5, "5", 6],
    adminNotes: "  Llamar el lunes  ",
  };

  it("coerces ids, dedupes shifts and trims the notes", () => {
    expect(volunteerReviewInputSchema.parse(base)).toEqual({
      festivalId: 1,
      applicationId: 2,
      status: "accepted",
      roleId: 4,
      shiftIds: [5, 6],
      adminNotes: "Llamar el lunes",
    });
  });

  it("keeps a null role and stores blank notes as null", () => {
    expect(
      volunteerReviewInputSchema.parse({
        ...base,
        status: "pending",
        roleId: null,
        shiftIds: [],
        adminNotes: "   ",
      }),
    ).toMatchObject({ roleId: null, shiftIds: [], adminNotes: null });
  });

  it("refuses another status and over-long notes", () => {
    expect(
      firstMessage(
        volunteerReviewInputSchema.safeParse({ ...base, status: "approved" }),
      )?.message,
    ).toBe("Elegí un estado.");
    expect(
      volunteerReviewInputSchema.safeParse({
        ...base,
        adminNotes: "a".repeat(VOLUNTEER_ADMIN_NOTES_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
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

  it("leaves the order out when it is not given", () => {
    const parsed = volunteerRoleInputSchema.parse({
      festivalId: 1,
      roleId: 3,
      name: "Acreditación",
      description: "Recibir al público",
    });
    expect(parsed.sortOrder).toBeUndefined();
    expect("sortOrder" in parsed && parsed.sortOrder !== undefined).toBe(false);
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

describe("volunteerRoleMoveInputSchema", () => {
  it("takes up or down", () => {
    expect(
      volunteerRoleMoveInputSchema.parse({
        festivalId: "1",
        roleId: "3",
        direction: "up",
      }),
    ).toEqual({ festivalId: 1, roleId: 3, direction: "up" });
    expect(
      volunteerRoleMoveInputSchema.safeParse({
        festivalId: 1,
        roleId: 3,
        direction: "left",
      }).success,
    ).toBe(false);
  });
});

describe("volunteerShiftInputSchema", () => {
  const base = {
    festivalId: 1,
    label: " Montaje ",
    date: "2026-12-18",
    startTime: "15:00",
    endTime: "21:00",
    neededHeadcount: "6",
  };

  it("turns the La Paz day and times into instants", () => {
    expect(volunteerShiftInputSchema.parse(base)).toEqual({
      festivalId: 1,
      label: "Montaje",
      neededHeadcount: 6,
      startsAt: new Date("2026-12-18T19:00:00.000Z"),
      endsAt: new Date("2026-12-19T01:00:00.000Z"),
    });
  });

  it("gives the same instants whatever the server's zone", () => {
    process.env.TZ = "Asia/Tokyo";
    const tokyo = volunteerShiftInputSchema.parse(base);
    process.env.TZ = "America/New_York";
    const newYork = volunteerShiftInputSchema.parse(base);
    process.env.TZ = "UTC";
    const utc = volunteerShiftInputSchema.parse(base);
    expect(tokyo.startsAt.toISOString()).toBe("2026-12-18T19:00:00.000Z");
    expect(newYork.startsAt).toEqual(tokyo.startsAt);
    expect(utc.endsAt).toEqual(tokyo.endsAt);
  });

  it("accepts HH:mm:ss from a time input and keeps the shift id", () => {
    const parsed = volunteerShiftInputSchema.parse({
      ...base,
      shiftId: "9",
      startTime: "15:00:00",
      endTime: "23:59:00",
    });
    expect(parsed.shiftId).toBe(9);
    expect(parsed.endsAt.toISOString()).toBe("2026-12-19T03:59:00.000Z");
  });

  it("requires the end after the start, on the same day", () => {
    for (const endTime of ["15:00", "14:00", "01:00"]) {
      const issue = firstMessage(
        volunteerShiftInputSchema.safeParse({ ...base, endTime }),
      );
      expect(issue?.path).toEqual(["endTime"]);
      expect(issue?.message).toBe("El fin tiene que ser posterior al inicio.");
    }
  });

  it("refuses a missing or impossible day and a bad time", () => {
    for (const date of ["", "2026-02-30", "18/12/2026"]) {
      expect(
        firstMessage(volunteerShiftInputSchema.safeParse({ ...base, date }))
          ?.message,
      ).toBe("Indicá el día.");
    }
    expect(
      firstMessage(
        volunteerShiftInputSchema.safeParse({ ...base, startTime: "" }),
      )?.message,
    ).toBe("Indicá la hora de inicio.");
    expect(
      firstMessage(
        volunteerShiftInputSchema.safeParse({ ...base, endTime: "24:00" }),
      )?.message,
    ).toBe("Indicá la hora de fin.");
    expect(
      firstMessage(
        volunteerShiftInputSchema.safeParse({ ...base, neededHeadcount: "-1" }),
      )?.message,
    ).toBe("No puede ser negativo.");
  });

  it("refuses an empty cupo instead of reading it as 0", () => {
    for (const neededHeadcount of ["", "  ", undefined]) {
      const issue = firstMessage(
        volunteerShiftInputSchema.safeParse({ ...base, neededHeadcount }),
      );
      expect(issue?.path).toEqual(["neededHeadcount"]);
      expect(issue?.message).toBe("Indicá el cupo.");
    }
    expect(
      volunteerShiftInputSchema.parse({ ...base, neededHeadcount: "0" })
        .neededHeadcount,
    ).toBe(0);
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
