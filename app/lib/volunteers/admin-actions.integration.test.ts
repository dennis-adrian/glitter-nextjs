// @vitest-environment node

import { and, asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { VolunteerApplicationsFilters } from "@/app/lib/volunteers/admin-definitions";
import type { VolunteerApplicationStatus } from "@/app/lib/volunteers/definitions";
import * as schema from "@/db/schema";
import {
  festivals,
  users,
  volunteerApplicationAssignedShifts,
  volunteerApplicationAvailableShifts,
  volunteerApplications,
  volunteerCallSettings,
  volunteerRoles,
  volunteerShifts,
} from "@/db/schema";

/**
 * The volunteer admin's actions and reads against a real database, with the
 * signed-in admin simulated.
 */

const requireAdminOrFestivalAdmin = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/app/lib/users/helpers", () => ({ requireAdminOrFestivalAdmin }));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
    return /(^|[_-])(test|ci)([_-]|$)/i.test(databaseName);
  } catch {
    return false;
  }
}

if (testDatabaseUrl && !isSafeTestDatabase(testDatabaseUrl)) {
  throw new Error(
    "TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.",
  );
}

const pool = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Actions = typeof import("@/app/lib/volunteers/admin-actions");
type Queries = typeof import("@/app/lib/volunteers/admin-queries");
let actions: Actions;
let queries: Queries;

const createdFestivals: number[] = [];
let REVIEWER: { id: number; role: "festival_admin" };

const UNAUTHORIZED = {
  success: false,
  message: "No tenés permiso para hacer esto.",
};
const NOT_FOUND = {
  success: false,
  message: "No encontramos esa postulación. Actualizá la página.",
};
const SAVED = { success: true, message: "Cambios guardados." };
const SHIFT_UNAVAILABLE = {
  success: false,
  message: "Uno de los turnos ya no está disponible. Actualizá la página.",
};
const ROLE_UNAVAILABLE = {
  success: false,
  message: "Ese rol ya no está disponible. Actualizá la página.",
};

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** An instant from La Paz wall-clock time (UTC-4, no DST). */
function laPaz(isoLocal: string) {
  return new Date(`${isoLocal}:00-04:00`);
}

/**
 * A festival with three roles and four shifts: three on Saturday 19 December
 * (the last at 22:00, already the 20th in UTC) and one on Sunday the 20th.
 */
async function createCall(options: { withSettings?: boolean } = {}) {
  const db = integrationDb!;
  const [festival] = await db
    .insert(festivals)
    .values({
      name: `Volunteers admin ${suffix()}`,
      status: "published",
      festivalType: "glitter",
    })
    .returning({ id: festivals.id });
  const festivalId = festival!.id;
  createdFestivals.push(festivalId);

  if (options.withSettings !== false) {
    await db.insert(volunteerCallSettings).values({
      festivalId,
      applicationsCloseAt: laPaz("2026-11-30T23:59"),
    });
  }
  const roles = await db
    .insert(volunteerRoles)
    .values(
      ["Acreditación", "Orientación", "Fotografía"].map((name, index) => ({
        festivalId,
        name,
        description: `${name}: una línea`,
        sortOrder: index,
      })),
    )
    .returning({ id: volunteerRoles.id });
  const shifts = await db
    .insert(volunteerShifts)
    .values(
      [
        ["Mañana", "2026-12-19T09:00", "2026-12-19T13:00"],
        ["Tarde", "2026-12-19T14:00", "2026-12-19T18:00"],
        ["Noche", "2026-12-19T22:00", "2026-12-19T23:30"],
        ["Domingo", "2026-12-20T09:00", "2026-12-20T13:00"],
      ].map(([label, startsAt, endsAt], index) => ({
        festivalId,
        label: label!,
        startsAt: laPaz(startsAt!),
        endsAt: laPaz(endsAt!),
        neededHeadcount: 4,
        sortOrder: index,
      })),
    )
    .returning({ id: volunteerShifts.id });

  return {
    festivalId,
    roleIds: roles.map((role) => role.id),
    shiftIds: shifts.map((shift) => shift.id),
  };
}

type Call = Awaited<ReturnType<typeof createCall>>;

async function insertApplication(
  call: Call,
  options: {
    fullName?: string;
    email?: string;
    phone?: string;
    adminNotes?: string | null;
    status?: VolunteerApplicationStatus;
    firstChoice?: number;
    secondChoice?: number;
    assignedRoleId?: number | null;
    available?: number[];
    assigned?: number[];
    createdAt?: Date;
  } = {},
) {
  const db = integrationDb!;
  const [row] = await db
    .insert(volunteerApplications)
    .values({
      festivalId: call.festivalId,
      fullName: options.fullName ?? "Camila Rojas",
      birthdate: "2000-05-10",
      phone: options.phone ?? "+59151234567",
      email: options.email ?? `camila-${suffix()}@example.test`,
      firstChoiceRoleId: call.roleIds[options.firstChoice ?? 0]!,
      secondChoiceRoleId: call.roleIds[options.secondChoice ?? 1]!,
      motivation: "Quiero ayudar.",
      emergencyContactName: "Ana Rojas",
      emergencyContactPhone: "+59171234567",
      referralSource: "university",
      consentedAt: new Date(),
      privacyNoticeVersion: "test",
      status: options.status ?? "pending",
      assignedRoleId: options.assignedRoleId ?? null,
      adminNotes: options.adminNotes ?? null,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    })
    .returning({ id: volunteerApplications.id });
  const applicationId = row!.id;
  const available = options.available ?? [call.shiftIds[0]!];
  if (available.length > 0) {
    await db.insert(volunteerApplicationAvailableShifts).values(
      available.map((shiftId) => ({
        applicationId,
        shiftId,
        festivalId: call.festivalId,
      })),
    );
  }
  if (options.assigned?.length) {
    await db.insert(volunteerApplicationAssignedShifts).values(
      options.assigned.map((shiftId) => ({
        applicationId,
        shiftId,
        festivalId: call.festivalId,
      })),
    );
  }
  return applicationId;
}

async function storedApplication(applicationId: number) {
  const [row] = await integrationDb!
    .select()
    .from(volunteerApplications)
    .where(eq(volunteerApplications.id, applicationId));
  return row!;
}

async function assignedShiftIds(applicationId: number) {
  const rows = await integrationDb!
    .select({ shiftId: volunteerApplicationAssignedShifts.shiftId })
    .from(volunteerApplicationAssignedShifts)
    .where(eq(volunteerApplicationAssignedShifts.applicationId, applicationId));
  return rows.map((row) => row.shiftId).sort((a, b) => a - b);
}

function filters(
  overrides: Partial<VolunteerApplicationsFilters> = {},
): VolunteerApplicationsFilters {
  return {
    status: "all",
    query: "",
    roleId: undefined,
    shiftId: undefined,
    limit: 25,
    offset: 0,
    ...overrides,
  };
}

describeDatabase("volunteer admin", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    actions = await import("@/app/lib/volunteers/admin-actions");
    queries = await import("@/app/lib/volunteers/admin-queries");

    const result = await pool!.query<{ column: string | null }>(
      "select column_name as column from information_schema.columns where table_name = 'volunteer_applications' and column_name = 'reviewed_by_user_id'",
    );
    if (result.rowCount === 0) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    const [reviewer] = await integrationDb!
      .insert(users)
      .values({
        clerkId: `clerk-volunteer-admin-${suffix()}`,
        email: `volunteer-admin-${suffix()}@example.test`,
        displayName: "Fede Festival",
        role: "festival_admin",
        status: "verified",
      })
      .returning();
    REVIEWER = { id: reviewer!.id, role: "festival_admin" };
  }, 60_000);

  beforeEach(() => {
    requireAdminOrFestivalAdmin.mockReset();
    requireAdminOrFestivalAdmin.mockResolvedValue(REVIEWER);
    revalidatePath.mockReset();
  });

  afterEach(async () => {
    const db = integrationDb!;
    const festivalIds = createdFestivals.splice(0);
    if (festivalIds.length === 0) return;
    // Applications first: their role and shift keys are `no action`.
    await db
      .delete(volunteerApplications)
      .where(inArray(volunteerApplications.festivalId, festivalIds));
    await db.delete(festivals).where(inArray(festivals.id, festivalIds));
  });

  afterAll(async () => {
    if (REVIEWER) {
      await integrationDb!.delete(users).where(eq(users.id, REVIEWER.id));
    }
    await pool?.end();
  });

  /**
   * The detail page's save, accepted with nothing assigned unless given, from
   * a form loaded just now (the stored updatedAt) unless given.
   */
  async function review(
    call: Call,
    applicationId: number,
    overrides: Partial<Parameters<Actions["saveVolunteerReview"]>[0]> = {},
  ) {
    const [row] = await integrationDb!
      .select({ updatedAt: volunteerApplications.updatedAt })
      .from(volunteerApplications)
      .where(eq(volunteerApplications.id, applicationId));
    return actions.saveVolunteerReview({
      festivalId: call.festivalId,
      applicationId,
      status: "accepted",
      roleId: null,
      shiftIds: [],
      adminNotes: "",
      loadedUpdatedAt: (row?.updatedAt ?? new Date()).toISOString(),
      ...overrides,
    });
  }

  async function storedOrder<
    T extends typeof volunteerRoles | typeof volunteerShifts,
  >(table: T, festivalId: number) {
    const rows = await integrationDb!
      .select({ id: table.id, sortOrder: table.sortOrder })
      .from(table as typeof volunteerRoles)
      .where(eq(table.festivalId, festivalId))
      .orderBy(asc(table.sortOrder), asc(table.id));
    return rows;
  }

  describe("who may use it", () => {
    it("refuses anyone but an admin or festival admin, and changes nothing", async () => {
      const call = await createCall();
      const applicationId = await insertApplication(call, {
        status: "accepted",
      });
      requireAdminOrFestivalAdmin.mockResolvedValue(null);
      const { festivalId } = call;

      const results = await Promise.all([
        actions.updateVolunteerApplicationStatus({
          festivalId,
          applicationId,
          status: "rejected",
        }),
        review(call, applicationId, {
          roleId: call.roleIds[0]!,
          shiftIds: [call.shiftIds[0]!],
          adminNotes: "x",
        }),
        actions.updateVolunteerCallSettings({
          festivalId,
          applicationsCloseAt: "2026-12-05T20:00",
          inductionDate: "",
          inductionTime: "",
        }),
        actions.saveVolunteerRole({
          festivalId,
          name: "Nuevo",
          description: "x",
        }),
        actions.moveVolunteerRole({
          festivalId,
          roleId: call.roleIds[1]!,
          direction: "up",
        }),
        actions.setVolunteerRoleActive({
          festivalId,
          id: call.roleIds[0]!,
          isActive: false,
        }),
        actions.saveVolunteerShift({
          festivalId,
          label: "Nuevo",
          date: "2026-12-19",
          startTime: "09:00",
          endTime: "10:00",
          neededHeadcount: 1,
        }),
        actions.setVolunteerShiftActive({
          festivalId,
          id: call.shiftIds[0]!,
          isActive: false,
        }),
      ]);
      for (const result of results) expect(result).toEqual(UNAUTHORIZED);

      expect(await storedApplication(applicationId)).toMatchObject({
        status: "accepted",
        adminNotes: null,
        assignedRoleId: null,
        reviewedByUserId: null,
      });
      expect(await assignedShiftIds(applicationId)).toEqual([]);
      const admin = await queries.fetchVolunteerAdminCall(festivalId);
      expect(admin!.roles.map((role) => role.id)).toEqual(call.roleIds);
      expect(admin!.shifts).toHaveLength(4);
      expect(admin!.roles.every((role) => role.isActive)).toBe(true);
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("status from the list", () => {
    it("changes the status and records who did it", async () => {
      const call = await createCall();
      const applicationId = await insertApplication(call);
      const before = await storedApplication(applicationId);

      const result = await actions.updateVolunteerApplicationStatus({
        festivalId: call.festivalId,
        applicationId,
        status: "accepted",
      });

      expect(result).toEqual({
        success: true,
        message: "Estado actualizado: Aceptada.",
      });
      const after = await storedApplication(applicationId);
      expect(after.status).toBe("accepted");
      expect(after.reviewedByUserId).toBe(REVIEWER.id);
      expect(after.reviewedAt).toBeInstanceOf(Date);
      expect(after.updatedAt.getTime()).toBeGreaterThan(
        before.updatedAt.getTime(),
      );
      expect(revalidatePath).toHaveBeenCalledWith(
        `/dashboard/festivals/${call.festivalId}/volunteers`,
        "layout",
      );
    });

    it("finds nothing through another festival's id", async () => {
      const call = await createCall();
      const other = await createCall();
      const applicationId = await insertApplication(call);

      expect(
        await actions.updateVolunteerApplicationStatus({
          festivalId: other.festivalId,
          applicationId,
          status: "rejected",
        }),
      ).toEqual(NOT_FOUND);
      expect((await storedApplication(applicationId)).status).toBe("pending");
    });

    it("refuses an unknown status with the schema's message", async () => {
      const call = await createCall();
      const applicationId = await insertApplication(call);
      expect(
        await actions.updateVolunteerApplicationStatus({
          festivalId: call.festivalId,
          applicationId,
          status: "approved" as never,
        }),
      ).toEqual({ success: false, message: "Elegí un estado." });
    });
  });

  describe("the review (Decisión y asignación)", () => {
    it("accepts, assigns a role and shifts, keeps the notes and records the reviewer", async () => {
      const call = await createCall();
      const [s0, , , s3] = call.shiftIds as [number, number, number, number];
      const applicationId = await insertApplication(call, { available: [s0] });
      const before = await storedApplication(applicationId);

      // s3 was not marked: allowed (the form only warns).
      expect(
        await review(call, applicationId, {
          roleId: call.roleIds[2]!,
          shiftIds: [s3, s0],
          adminNotes: "  Llamar el lunes  ",
        }),
      ).toEqual(SAVED);

      const after = await storedApplication(applicationId);
      expect(after).toMatchObject({
        status: "accepted",
        assignedRoleId: call.roleIds[2],
        adminNotes: "Llamar el lunes",
        reviewedByUserId: REVIEWER.id,
      });
      expect(after.reviewedAt).toBeInstanceOf(Date);
      expect(after.updatedAt.getTime()).toBeGreaterThan(
        before.updatedAt.getTime(),
      );
      expect(await assignedShiftIds(applicationId)).toEqual(
        [s0, s3].sort((a, b) => a - b),
      );
      expect(revalidatePath).toHaveBeenCalledWith(
        `/dashboard/festivals/${call.festivalId}/volunteers`,
        "layout",
      );
    });

    it("replaces the shifts and clears the role and blank notes", async () => {
      const call = await createCall();
      const applicationId = await insertApplication(call, {
        status: "accepted",
        assignedRoleId: call.roleIds[0]!,
        assigned: [call.shiftIds[0]!, call.shiftIds[3]!],
        adminNotes: "Algo",
      });

      expect(
        await review(call, applicationId, {
          roleId: null,
          shiftIds: [call.shiftIds[1]!],
          adminNotes: "   ",
        }),
      ).toEqual(SAVED);
      expect(await assignedShiftIds(applicationId)).toEqual([
        call.shiftIds[1]!,
      ]);
      expect(await storedApplication(applicationId)).toMatchObject({
        assignedRoleId: null,
        adminNotes: null,
      });
    });

    it("ignores the role and shifts under any other status and keeps the stored assignment", async () => {
      const call = await createCall();
      const other = await createCall();
      const [s0, s1, , s3] = call.shiftIds as [number, number, number, number];
      const assigned = await insertApplication(call, {
        status: "accepted",
        assignedRoleId: call.roleIds[1]!,
        assigned: [s1],
      });
      const coverage = async () =>
        (await queries.fetchVolunteerAdminCall(call.festivalId))!.shifts.find(
          (shift) => shift.id === s1,
        )!.assignedCount;
      expect(await coverage()).toBe(1);

      expect(
        await review(call, assigned, {
          status: "waitlist",
          roleId: call.roleIds[0]!,
          shiftIds: [s0, s3],
          adminNotes: "Si alguien cancela",
        }),
      ).toEqual(SAVED);
      expect(await storedApplication(assigned)).toMatchObject({
        status: "waitlist",
        assignedRoleId: call.roleIds[1],
        adminNotes: "Si alguien cancela",
        reviewedByUserId: REVIEWER.id,
      });
      expect(await assignedShiftIds(assigned)).toEqual([s1]);
      // Kept, but only accepted applications count as covering a shift.
      expect(await coverage()).toBe(0);

      // Not even validated: another festival's role, three shifts a day.
      for (const status of ["pending", "rejected"] as const) {
        const applicationId = await insertApplication(call, { status });
        expect(
          await review(call, applicationId, {
            status,
            roleId: other.roleIds[0]!,
            shiftIds: call.shiftIds.slice(0, 3),
          }),
        ).toEqual(SAVED);
        expect(await storedApplication(applicationId)).toMatchObject({
          status,
          assignedRoleId: null,
        });
        expect(await assignedShiftIds(applicationId)).toEqual([]);
      }
    });

    it("saves more than two shifts on one La Paz day, with a warning", async () => {
      const call = await createCall();
      const applicationId = await insertApplication(call, {
        available: call.shiftIds,
      });

      // The 22:00 shift is the 20th in UTC but the 19th in La Paz.
      const result = await review(call, applicationId, {
        roleId: call.roleIds[0]!,
        shiftIds: call.shiftIds.slice(0, 3),
        adminNotes: "Excepción acordada",
      });

      expect(result).toEqual({
        success: true,
        message: "Cambios guardados.",
        warning:
          "Cambios guardados. Quedó con más de 2 turnos el sábado 19 de diciembre.",
      });
      expect(await storedApplication(applicationId)).toMatchObject({
        status: "accepted",
        assignedRoleId: call.roleIds[0]!,
        adminNotes: "Excepción acordada",
      });
      expect(await assignedShiftIds(applicationId)).toEqual(
        call.shiftIds.slice(0, 3).sort((a, b) => a - b),
      );
      expect(revalidatePath).toHaveBeenCalled();

      // Two that day plus Sunday: no warning.
      expect(
        await review(call, applicationId, {
          shiftIds: [call.shiftIds[0]!, call.shiftIds[2]!, call.shiftIds[3]!],
        }),
      ).toEqual(SAVED);
    });

    it("refuses a shift or role of another festival, and another festival's id", async () => {
      const call = await createCall();
      const other = await createCall();
      const applicationId = await insertApplication(call, {
        status: "accepted",
      });

      expect(
        await review(call, applicationId, {
          shiftIds: [call.shiftIds[0]!, other.shiftIds[1]!],
        }),
      ).toEqual(SHIFT_UNAVAILABLE);
      expect(
        await review(call, applicationId, { roleId: other.roleIds[0]! }),
      ).toEqual(ROLE_UNAVAILABLE);
      expect(
        await actions.saveVolunteerReview({
          festivalId: other.festivalId,
          applicationId,
          status: "rejected",
          roleId: null,
          shiftIds: [],
          adminNotes: "x",
          loadedUpdatedAt: (
            await storedApplication(applicationId)
          ).updatedAt.toISOString(),
        }),
      ).toEqual(NOT_FOUND);
      expect(await storedApplication(applicationId)).toMatchObject({
        status: "accepted",
        assignedRoleId: null,
        adminNotes: null,
      });
      expect(await assignedShiftIds(applicationId)).toEqual([]);
    });

    it("keeps a deactivated role or shift that was already assigned, and refuses new ones", async () => {
      const call = await createCall();
      const applicationId = await insertApplication(call, {
        status: "accepted",
        assignedRoleId: call.roleIds[0]!,
        assigned: [call.shiftIds[0]!],
      });
      const db = integrationDb!;
      await db
        .update(volunteerRoles)
        .set({ isActive: false })
        .where(inArray(volunteerRoles.id, call.roleIds.slice(0, 2)));
      await db
        .update(volunteerShifts)
        .set({ isActive: false })
        .where(inArray(volunteerShifts.id, call.shiftIds.slice(0, 2)));

      expect(
        await review(call, applicationId, {
          roleId: call.roleIds[0]!,
          shiftIds: [call.shiftIds[0]!, call.shiftIds[3]!],
        }),
      ).toEqual(SAVED);
      expect(
        await review(call, applicationId, {
          roleId: call.roleIds[1]!,
          shiftIds: [call.shiftIds[0]!],
        }),
      ).toEqual(ROLE_UNAVAILABLE);
      expect(
        await review(call, applicationId, {
          roleId: call.roleIds[0]!,
          shiftIds: [call.shiftIds[1]!],
        }),
      ).toEqual(SHIFT_UNAVAILABLE);
      expect(await assignedShiftIds(applicationId)).toEqual(
        [call.shiftIds[0]!, call.shiftIds[3]!].sort((a, b) => a - b),
      );
    });

    it("refuses an unknown status or over-long notes with the schema's message", async () => {
      const call = await createCall();
      const applicationId = await insertApplication(call);
      expect(
        await review(call, applicationId, { status: "approved" as never }),
      ).toEqual({ success: false, message: "Elegí un estado." });
      expect(
        await review(call, applicationId, { adminNotes: "a".repeat(2001) }),
      ).toEqual({ success: false, message: "Es demasiado largo" });
    });

    it("refuses a save from a form loaded before another change, and keeps that change", async () => {
      const call = await createCall();
      const [s0, s1] = call.shiftIds as [number, number];
      const applicationId = await insertApplication(call, {
        status: "accepted",
        assignedRoleId: call.roleIds[0]!,
        available: [s0, s1],
        assigned: [s0],
      });
      // Loaded a minute ago, so the next write cannot share its millisecond.
      await integrationDb!
        .update(volunteerApplications)
        .set({ updatedAt: new Date(Date.now() - 60_000) })
        .where(eq(volunteerApplications.id, applicationId));
      const loaded = (await queries.fetchVolunteerApplicationDetail(
        call.festivalId,
        applicationId,
      ))!;
      expect(loaded.assignedShiftIds).toEqual([s0]);

      // Meanwhile, the shift screen adds s1.
      expect(
        await actions.assignVolunteerShift({
          festivalId: call.festivalId,
          shiftId: s1,
          applicationId,
        }),
      ).toMatchObject({ success: true });
      const changed = await storedApplication(applicationId);

      // The stale tab only edits the notes but sends its old shifts.
      expect(
        await review(call, applicationId, {
          roleId: loaded.assignedRoleId,
          shiftIds: loaded.assignedShiftIds,
          adminNotes: "Solo notas",
          loadedUpdatedAt: loaded.updatedAt.toISOString(),
        }),
      ).toEqual({
        success: false,
        message:
          "Alguien más cambió esta postulación. Actualizá la página para ver los cambios.",
      });
      expect(await assignedShiftIds(applicationId)).toEqual(
        [s0, s1].sort((a, b) => a - b),
      );
      expect(await storedApplication(applicationId)).toMatchObject({
        adminNotes: null,
        updatedAt: changed.updatedAt,
      });

      // Reloaded, the same save goes through.
      const reloaded = (await queries.fetchVolunteerApplicationDetail(
        call.festivalId,
        applicationId,
      ))!;
      expect(
        await review(call, applicationId, {
          roleId: reloaded.assignedRoleId,
          shiftIds: reloaded.assignedShiftIds,
          adminNotes: "Solo notas",
          loadedUpdatedAt: reloaded.updatedAt.toISOString(),
        }),
      ).toEqual(SAVED);
      expect(await assignedShiftIds(applicationId)).toEqual(
        [s0, s1].sort((a, b) => a - b),
      );
      expect(await storedApplication(applicationId)).toMatchObject({
        adminNotes: "Solo notas",
      });
    });
  });

  describe("the shift screen (Asignar / Quitar)", () => {
    function assign(call: Call, applicationId: number, shiftId: number) {
      return actions.assignVolunteerShift({
        festivalId: call.festivalId,
        shiftId,
        applicationId,
      });
    }
    function unassign(call: Call, applicationId: number, shiftId: number) {
      return actions.unassignVolunteerShift({
        festivalId: call.festivalId,
        shiftId,
        applicationId,
      });
    }

    it("adds one shift to an accepted application, keeping its role and other shifts, and records the reviewer", async () => {
      const call = await createCall();
      const [s0, , , s3] = call.shiftIds as [number, number, number, number];
      const applicationId = await insertApplication(call, {
        fullName: "Lucía Mamani",
        status: "accepted",
        assignedRoleId: call.roleIds[2]!,
        assigned: [s3],
      });

      expect(await assign(call, applicationId, s0)).toEqual({
        success: true,
        message: "Turno asignado a Lucía Mamani.",
      });
      const stored = await storedApplication(applicationId);
      expect(stored).toMatchObject({
        status: "accepted",
        assignedRoleId: call.roleIds[2]!,
        reviewedByUserId: REVIEWER.id,
      });
      expect(stored.reviewedAt).toBeInstanceOf(Date);
      expect(stored.updatedAt.getTime()).toBe(stored.reviewedAt!.getTime());
      expect(await assignedShiftIds(applicationId)).toEqual(
        [s0, s3].sort((a, b) => a - b),
      );
      expect(revalidatePath).toHaveBeenCalledWith(
        `/dashboard/festivals/${call.festivalId}/volunteers`,
        "layout",
      );
    });

    it("accepts a pending or waitlisted application and gives it its 1st choice, or its 2nd when the 1st is inactive", async () => {
      const call = await createCall();
      const [s0, s1] = call.shiftIds as [number, number];
      const pending = await insertApplication(call, {
        fullName: "Andrés Quispe",
        status: "pending",
        firstChoice: 0,
        secondChoice: 1,
      });
      expect(await assign(call, pending, s0)).toEqual({
        success: true,
        message:
          "Turno asignado a Andrés Quispe. Su postulación pasó a Aceptada.",
      });
      expect(await storedApplication(pending)).toMatchObject({
        status: "accepted",
        assignedRoleId: call.roleIds[0]!,
        reviewedByUserId: REVIEWER.id,
      });

      await integrationDb!
        .update(volunteerRoles)
        .set({ isActive: false })
        .where(eq(volunteerRoles.id, call.roleIds[0]!));
      const waitlisted = await insertApplication(call, {
        status: "waitlist",
        firstChoice: 0,
        secondChoice: 1,
      });
      expect(await assign(call, waitlisted, s1)).toMatchObject({
        success: true,
      });
      expect(await storedApplication(waitlisted)).toMatchObject({
        status: "accepted",
        assignedRoleId: call.roleIds[1]!,
      });

      // Both choices inactive: no role.
      await integrationDb!
        .update(volunteerRoles)
        .set({ isActive: false })
        .where(eq(volunteerRoles.id, call.roleIds[1]!));
      const noRole = await insertApplication(call, {
        status: "accepted",
        firstChoice: 0,
        secondChoice: 1,
      });
      expect(await assign(call, noRole, s1)).toMatchObject({ success: true });
      expect(await storedApplication(noRole)).toMatchObject({
        assignedRoleId: null,
      });
      expect(await assignedShiftIds(noRole)).toEqual([s1]);
    });

    it("refuses a rejected application, an inactive shift and another festival's shift or application", async () => {
      const call = await createCall();
      const other = await createCall();
      const [s0, s1] = call.shiftIds as [number, number];
      const rejected = await insertApplication(call, { status: "rejected" });
      expect(await assign(call, rejected, s0)).toEqual({
        success: false,
        message: "No se puede asignar una postulación no aceptada.",
      });
      expect(await storedApplication(rejected)).toMatchObject({
        status: "rejected",
        reviewedByUserId: null,
      });

      await integrationDb!
        .update(volunteerShifts)
        .set({ isActive: false })
        .where(eq(volunteerShifts.id, s1));
      const accepted = await insertApplication(call, { status: "accepted" });
      expect(await assign(call, accepted, s1)).toEqual({
        success: false,
        message: "Ese turno está desactivado.",
      });
      expect(await assign(call, accepted, other.shiftIds[0]!)).toEqual({
        success: false,
        message: "No encontramos ese turno. Actualizá la página.",
      });
      expect(
        await actions.assignVolunteerShift({
          festivalId: other.festivalId,
          shiftId: other.shiftIds[0]!,
          applicationId: accepted,
        }),
      ).toEqual(NOT_FOUND);
      expect(
        await actions.unassignVolunteerShift({
          festivalId: other.festivalId,
          shiftId: other.shiftIds[0]!,
          applicationId: accepted,
        }),
      ).toEqual(NOT_FOUND);
      expect(await assignedShiftIds(accepted)).toEqual([]);
      expect(await storedApplication(accepted)).toMatchObject({
        reviewedByUserId: null,
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("changes nothing when already assigned, even to a shift deactivated since", async () => {
      const call = await createCall();
      const [s0] = call.shiftIds as [number];
      const applicationId = await insertApplication(call, {
        fullName: "Ana Pérez",
        status: "accepted",
        assigned: [s0],
      });
      await integrationDb!
        .update(volunteerShifts)
        .set({ isActive: false })
        .where(eq(volunteerShifts.id, s0));
      expect(await assign(call, applicationId, s0)).toEqual({
        success: true,
        message: "Ese turno ya estaba asignado a Ana Pérez.",
      });
      expect(await storedApplication(applicationId)).toMatchObject({
        assignedRoleId: null,
        reviewedByUserId: null,
      });
      expect(await assignedShiftIds(applicationId)).toEqual([s0]);
    });

    it("saves a third shift on one La Paz day, with a warning", async () => {
      const call = await createCall();
      const [s0, s1, s2, s3] = call.shiftIds as [
        number,
        number,
        number,
        number,
      ];
      const applicationId = await insertApplication(call, {
        fullName: "Lucía Mamani",
        status: "accepted",
        assigned: [s0, s1, s3],
      });
      // The 22:00 shift is the 20th in UTC but the 19th in La Paz.
      expect(await assign(call, applicationId, s2)).toEqual({
        success: true,
        message: "Turno asignado a Lucía Mamani.",
        warning:
          "Turno asignado a Lucía Mamani. Quedó con más de 2 turnos el sábado 19 de diciembre.",
      });
      expect(await assignedShiftIds(applicationId)).toEqual(
        [s0, s1, s2, s3].sort((a, b) => a - b),
      );

      // Over the limit on Saturday, but Sunday's assignment does not warn.
      const sunday = await insertApplication(call, {
        status: "accepted",
        assigned: [s0, s1, s2],
      });
      expect(await assign(call, sunday, s3)).not.toHaveProperty("warning");
    });

    it("removes only this shift, leaving the status, role and other shifts, and records the reviewer", async () => {
      const call = await createCall();
      const [s0, s1] = call.shiftIds as [number, number];
      const applicationId = await insertApplication(call, {
        fullName: "Andrés Quispe",
        status: "waitlist",
        assignedRoleId: call.roleIds[1]!,
        assigned: [s0, s1],
      });
      expect(await unassign(call, applicationId, s0)).toEqual({
        success: true,
        message: "Quitamos a Andrés Quispe de este turno.",
      });
      const stored = await storedApplication(applicationId);
      expect(stored).toMatchObject({
        status: "waitlist",
        assignedRoleId: call.roleIds[1]!,
        reviewedByUserId: REVIEWER.id,
      });
      expect(stored.reviewedAt).toBeInstanceOf(Date);
      expect(await assignedShiftIds(applicationId)).toEqual([s1]);
      expect(revalidatePath).toHaveBeenCalledTimes(1);

      revalidatePath.mockReset();
      expect(await unassign(call, applicationId, s0)).toEqual({
        success: true,
        message: "Andrés Quispe ya no estaba en este turno.",
      });
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(await assignedShiftIds(applicationId)).toEqual([s1]);
    });

    it("refuses anyone but an admin or festival admin, and bad ids", async () => {
      const call = await createCall();
      const applicationId = await insertApplication(call, {
        status: "accepted",
      });
      requireAdminOrFestivalAdmin.mockResolvedValue(null);
      expect(await assign(call, applicationId, call.shiftIds[0]!)).toEqual(
        UNAUTHORIZED,
      );
      expect(await unassign(call, applicationId, call.shiftIds[0]!)).toEqual(
        UNAUTHORIZED,
      );
      requireAdminOrFestivalAdmin.mockResolvedValue(REVIEWER);
      expect(
        await actions.assignVolunteerShift({
          festivalId: call.festivalId,
          shiftId: 0,
          applicationId,
        }),
      ).toMatchObject({ success: false });
      expect(await assignedShiftIds(applicationId)).toEqual([]);
    });
  });

  describe("the call", () => {
    it("creates the settings the first time and updates them after", async () => {
      const call = await createCall({ withSettings: false });
      expect(
        (await queries.fetchVolunteerAdminCall(call.festivalId))!.settings,
      ).toBeNull();

      expect(
        await actions.updateVolunteerCallSettings({
          festivalId: call.festivalId,
          applicationsCloseAt: "2026-11-30T23:59",
          inductionDate: "",
          inductionTime: "",
        }),
      ).toEqual({ success: true, message: "Convocatoria guardada." });
      expect(
        (await queries.fetchVolunteerAdminCall(call.festivalId))!.settings,
      ).toEqual({
        applicationsCloseAt: new Date("2026-12-01T03:59:00.000Z"),
        inductionDate: null,
        inductionTime: null,
      });
      expect(revalidatePath).toHaveBeenCalledWith("/voluntarios", "layout");

      await actions.updateVolunteerCallSettings({
        festivalId: call.festivalId,
        applicationsCloseAt: "2026-12-05T20:00",
        inductionDate: "2026-12-12",
        inductionTime: "18:00",
      });
      const rows = await integrationDb!
        .select()
        .from(volunteerCallSettings)
        .where(eq(volunteerCallSettings.festivalId, call.festivalId));
      expect(rows).toHaveLength(1);
      expect(
        (await queries.fetchVolunteerAdminCall(call.festivalId))!.settings,
      ).toEqual({
        applicationsCloseAt: new Date("2026-12-06T00:00:00.000Z"),
        inductionDate: "2026-12-12",
        inductionTime: "18:00:00",
      });
    });

    it("refuses settings for a festival that does not exist", async () => {
      expect(
        await actions.updateVolunteerCallSettings({
          festivalId: 2_000_000_000,
          applicationsCloseAt: "2026-11-30T23:59",
          inductionDate: "",
          inductionTime: "",
        }),
      ).toEqual({
        success: false,
        message: "No encontramos ese festival. Actualizá la página.",
      });
    });

    it("creates roles last and renames them in place, refusing a duplicate name", async () => {
      const call = await createCall();
      const other = await createCall();

      expect(
        await actions.saveVolunteerRole({
          festivalId: call.festivalId,
          name: " Logística ",
          description: "Mover cosas",
        }),
      ).toEqual({ success: true, message: "Rol creado." });
      expect(
        await actions.saveVolunteerRole({
          festivalId: call.festivalId,
          name: "Acreditación",
          description: "Otra",
        }),
      ).toEqual({ success: false, message: "Ya hay un rol con ese nombre." });
      expect(
        await actions.saveVolunteerRole({
          festivalId: call.festivalId,
          roleId: call.roleIds[1]!,
          name: "Acreditación",
          description: "Otra",
        }),
      ).toEqual({ success: false, message: "Ya hay un rol con ese nombre." });
      // The same name in another festival is fine.
      expect(
        await actions.saveVolunteerRole({
          festivalId: other.festivalId,
          name: "Logística",
          description: "Mover cosas",
        }),
      ).toMatchObject({ success: true });

      expect(
        await actions.saveVolunteerRole({
          festivalId: call.festivalId,
          roleId: call.roleIds[1]!,
          name: "Orientación al público",
          description: "Guiar",
        }),
      ).toEqual({ success: true, message: "Rol actualizado." });
      expect(
        await actions.saveVolunteerRole({
          festivalId: other.festivalId,
          roleId: call.roleIds[1]!,
          name: "Robado",
          description: "x",
        }),
      ).toEqual({
        success: false,
        message: "No encontramos ese rol. Actualizá la página.",
      });

      const roles = (await queries.fetchVolunteerAdminCall(call.festivalId))!
        .roles;
      expect(roles.map((role) => role.name)).toEqual([
        "Acreditación",
        "Orientación al público",
        "Fotografía",
        "Logística",
      ]);
      // After the highest (2), and the edited one kept its 1.
      expect(roles.map((role) => role.sortOrder)).toEqual([0, 1, 2, 3]);
      expect(roles.at(-1)).toMatchObject({
        isActive: true,
        description: "Mover cosas",
      });

      // An explicit order is still honoured.
      await actions.saveVolunteerRole({
        festivalId: call.festivalId,
        roleId: call.roleIds[0]!,
        name: "Acreditación",
        description: "Recibir",
        sortOrder: 9,
      });
      expect(
        (await queries.fetchVolunteerAdminCall(call.festivalId))!.roles.at(-1)!
          .id,
      ).toBe(call.roleIds[0]);
    });

    it("moves a role up or down and renumbers the festival's roles 1..n", async () => {
      const call = await createCall();
      const other = await createCall();
      const [r0, r1, r2] = call.roleIds as [number, number, number];
      const move = (roleId: number, direction: "up" | "down") =>
        actions.moveVolunteerRole({
          festivalId: call.festivalId,
          roleId,
          direction,
        });

      expect(await move(r2, "up")).toEqual({
        success: true,
        message: "Orden actualizado.",
      });
      expect(await storedOrder(volunteerRoles, call.festivalId)).toEqual([
        { id: r0, sortOrder: 1 },
        { id: r2, sortOrder: 2 },
        { id: r1, sortOrder: 3 },
      ]);
      expect(revalidatePath).toHaveBeenCalledWith("/voluntarios", "layout");

      // At either end nothing moves.
      expect(await move(r0, "up")).toMatchObject({ success: true });
      expect(await move(r1, "down")).toMatchObject({ success: true });
      expect(
        (await storedOrder(volunteerRoles, call.festivalId)).map(
          (role) => role.id,
        ),
      ).toEqual([r0, r2, r1]);

      // Ties (older data) resolve by id, then get unique numbers.
      await integrationDb!
        .update(volunteerRoles)
        .set({ sortOrder: 0 })
        .where(eq(volunteerRoles.festivalId, call.festivalId));
      await move(r0, "down");
      expect(await storedOrder(volunteerRoles, call.festivalId)).toEqual([
        { id: r1, sortOrder: 1 },
        { id: r0, sortOrder: 2 },
        { id: r2, sortOrder: 3 },
      ]);

      // Another festival's role is not found; its own roles are untouched.
      expect(
        await actions.moveVolunteerRole({
          festivalId: other.festivalId,
          roleId: r2,
          direction: "up",
        }),
      ).toEqual({
        success: false,
        message: "No encontramos ese rol. Actualizá la página.",
      });
      expect(await storedOrder(volunteerRoles, other.festivalId)).toEqual(
        other.roleIds.map((id, index) => ({ id, sortOrder: index })),
      );
    });

    it("creates and edits shifts from a day and two times, refusing an end before the start", async () => {
      const call = await createCall();

      expect(
        await actions.saveVolunteerShift({
          festivalId: call.festivalId,
          label: "Desmontaje",
          date: "2026-12-20",
          startTime: "20:00",
          endTime: "19:00",
          neededHeadcount: 3,
        }),
      ).toEqual({
        success: false,
        message: "El fin tiene que ser posterior al inicio.",
      });
      expect(
        await actions.saveVolunteerShift({
          festivalId: call.festivalId,
          label: "Desmontaje",
          date: "2026-12-20",
          startTime: "20:00",
          endTime: "23:00",
          neededHeadcount: "3",
        }),
      ).toEqual({ success: true, message: "Turno creado." });
      expect(
        await actions.saveVolunteerShift({
          festivalId: call.festivalId,
          shiftId: call.shiftIds[0]!,
          label: "Mañana temprano",
          date: "2026-12-19",
          startTime: "08:00",
          endTime: "12:00",
          neededHeadcount: 6,
        }),
      ).toEqual({ success: true, message: "Turno actualizado." });
      expect(
        await actions.saveVolunteerShift({
          festivalId: 2_000_000_000,
          label: "x",
          date: "2026-12-19",
          startTime: "08:00",
          endTime: "12:00",
          neededHeadcount: 1,
        }),
      ).toEqual({
        success: false,
        message: "No encontramos ese festival. Actualizá la página.",
      });

      const shifts = (await queries.fetchVolunteerAdminCall(call.festivalId))!
        .shifts;
      expect(shifts[0]).toMatchObject({
        id: call.shiftIds[0],
        label: "Mañana temprano",
        startsAt: new Date("2026-12-19T12:00:00.000Z"),
        endsAt: new Date("2026-12-19T16:00:00.000Z"),
        neededHeadcount: 6,
      });
      expect(shifts.at(-1)).toMatchObject({
        label: "Desmontaje",
        startsAt: new Date("2026-12-21T00:00:00.000Z"),
        endsAt: new Date("2026-12-21T03:00:00.000Z"),
        neededHeadcount: 3,
        isActive: true,
      });
    });

    it("renumbers the festival's shifts chronologically after every save", async () => {
      const call = await createCall();
      const other = await createCall();
      const [manana, tarde, noche, domingo] = call.shiftIds as [
        number,
        number,
        number,
        number,
      ];

      // A Friday shift, added last, goes first.
      await actions.saveVolunteerShift({
        festivalId: call.festivalId,
        label: "Montaje",
        date: "2026-12-18",
        startTime: "15:00",
        endTime: "19:00",
        neededHeadcount: 6,
      });
      const created = (await queries.fetchVolunteerAdminCall(call.festivalId))!
        .shifts[0]!;
      expect(created.label).toBe("Montaje");
      expect(await storedOrder(volunteerShifts, call.festivalId)).toEqual([
        { id: created.id, sortOrder: 1 },
        { id: manana, sortOrder: 2 },
        { id: tarde, sortOrder: 3 },
        { id: noche, sortOrder: 4 },
        { id: domingo, sortOrder: 5 },
      ]);

      // Moving Sunday's shift to Saturday noon puts it between.
      expect(
        await actions.saveVolunteerShift({
          festivalId: call.festivalId,
          shiftId: domingo,
          label: "Mediodía",
          date: "2026-12-19",
          startTime: "13:00",
          endTime: "14:00",
          neededHeadcount: 4,
        }),
      ).toMatchObject({ success: true });
      expect(
        (await storedOrder(volunteerShifts, call.festivalId)).map(
          (shift) => shift.id,
        ),
      ).toEqual([created.id, manana, domingo, tarde, noche]);

      // Another festival's shifts keep their numbers.
      expect(await storedOrder(volunteerShifts, other.festivalId)).toEqual(
        other.shiftIds.map((id, index) => ({ id, sortOrder: index })),
      );
    });

    it("saves moving a shift onto a day where an assigned volunteer holds too many, with a warning", async () => {
      const call = await createCall();
      const [manana, tarde, , domingo] = call.shiftIds as [
        number,
        number,
        number,
        number,
      ];
      // Assignments outlive "accepted", so a waitlisted one counts too.
      await insertApplication(call, {
        fullName: "Lucía Mamani",
        status: "waitlist",
        assigned: [manana, tarde, domingo],
      });
      // Two Saturday shifts but not the one that moves: unaffected.
      await insertApplication(call, {
        fullName: "Andrés Quispe",
        status: "accepted",
        assigned: [manana, tarde],
      });
      const move = (date: string, startTime: string, endTime: string) =>
        actions.saveVolunteerShift({
          festivalId: call.festivalId,
          shiftId: domingo,
          label: "Domingo",
          date,
          startTime,
          endTime,
          neededHeadcount: 4,
        });

      const stored = async () =>
        (await queries.fetchVolunteerAdminCall(call.festivalId))!.shifts.find(
          (shift) => shift.id === domingo,
        )!.startsAt;
      expect(await stored()).toEqual(laPaz("2026-12-20T09:00"));

      expect(await move("2026-12-19", "19:00", "21:00")).toEqual({
        success: true,
        message: "Turno actualizado.",
        warning:
          "Turno actualizado. Lucía Mamani quedó con más de 2 turnos el sábado 19 de diciembre.",
      });
      expect(await stored()).toEqual(laPaz("2026-12-19T19:00"));

      // Within the same day nobody's count changes: no warning.
      expect(await move("2026-12-19", "20:00", "22:00")).toEqual({
        success: true,
        message: "Turno actualizado.",
      });

      // Back to Sunday, or to a free day, it saves without one.
      expect(await move("2026-12-20", "15:00", "19:00")).toEqual({
        success: true,
        message: "Turno actualizado.",
      });
      expect(await stored()).toEqual(laPaz("2026-12-20T15:00"));
    });

    it("deactivates and reactivates roles and shifts, scoped to the festival", async () => {
      const call = await createCall();
      const other = await createCall();
      const roleId = call.roleIds[2]!;
      const shiftId = call.shiftIds[2]!;
      const state = async () => {
        const admin = (await queries.fetchVolunteerAdminCall(call.festivalId))!;
        return {
          role: admin.roles.find((role) => role.id === roleId)!.isActive,
          shift: admin.shifts.find((shift) => shift.id === shiftId)!.isActive,
        };
      };

      expect(
        await actions.setVolunteerRoleActive({
          festivalId: call.festivalId,
          id: roleId,
          isActive: false,
        }),
      ).toEqual({ success: true, message: "Rol desactivado." });
      expect(
        await actions.setVolunteerShiftActive({
          festivalId: call.festivalId,
          id: shiftId,
          isActive: false,
        }),
      ).toEqual({ success: true, message: "Turno desactivado." });
      expect(await state()).toEqual({ role: false, shift: false });

      expect(
        await actions.setVolunteerRoleActive({
          festivalId: other.festivalId,
          id: roleId,
          isActive: true,
        }),
      ).toEqual({
        success: false,
        message: "No encontramos ese rol. Actualizá la página.",
      });
      expect(
        await actions.setVolunteerShiftActive({
          festivalId: other.festivalId,
          id: shiftId,
          isActive: true,
        }),
      ).toEqual({
        success: false,
        message: "No encontramos ese turno. Actualizá la página.",
      });
      expect(await state()).toEqual({ role: false, shift: false });

      expect(
        await actions.setVolunteerRoleActive({
          festivalId: call.festivalId,
          id: roleId,
          isActive: true,
        }),
      ).toEqual({ success: true, message: "Rol activado." });
      expect(
        await actions.setVolunteerShiftActive({
          festivalId: call.festivalId,
          id: shiftId,
          isActive: true,
        }),
      ).toEqual({ success: true, message: "Turno activado." });
      expect(await state()).toEqual({ role: true, shift: true });
    });
  });

  describe("reads", () => {
    it("is null for a festival that does not exist", async () => {
      expect(await queries.fetchVolunteerAdminCall(2_000_000_000)).toBeNull();
      expect(
        await queries.fetchVolunteerApplicationsForExport(2_000_000_000),
      ).toBeNull();
    });

    it("counts who is available (not rejected), who is assigned (accepted only) and who can still fill it", async () => {
      const call = await createCall();
      const [s0, s1] = call.shiftIds as [number, number];
      await insertApplication(call, { status: "pending", available: [s0] });
      await insertApplication(call, { status: "waitlist", available: [s0] });
      await insertApplication(call, { status: "rejected", available: [s0] });
      await insertApplication(call, {
        status: "accepted",
        available: [s0, s1],
        assigned: [s1],
      });
      await insertApplication(call, {
        status: "waitlist",
        available: [s1],
        assigned: [s1],
      });
      // Assigned without marking it: counts as assigned, not as available.
      await insertApplication(call, {
        status: "accepted",
        available: [],
        assigned: [s0],
      });

      const admin = (await queries.fetchVolunteerAdminCall(call.festivalId))!;
      const byId = new Map(admin.shifts.map((shift) => [shift.id, shift]));
      expect(byId.get(s0)).toMatchObject({
        availableCount: 3,
        assignedCount: 1,
        unassignedAvailableCount: 3,
      });
      // Both who marked it are assigned to it, whatever their status.
      expect(byId.get(s1)).toMatchObject({
        availableCount: 2,
        assignedCount: 1,
        unassignedAvailableCount: 0,
      });
      expect(byId.get(call.shiftIds[3]!)).toMatchObject({
        availableCount: 0,
        assignedCount: 0,
        unassignedAvailableCount: 0,
      });
      expect(admin.shifts.map((shift) => shift.id)).toEqual(call.shiftIds);
    });

    it("reads one shift: its coverage, who is assigned and who could cover it", async () => {
      const call = await createCall();
      const other = await createCall();
      const [s0, s1, s2, s3] = call.shiftIds as [
        number,
        number,
        number,
        number,
      ];
      const assignedAccepted = await insertApplication(call, {
        fullName: "zoe Vargas",
        status: "accepted",
        assignedRoleId: call.roleIds[2]!,
        available: [s0],
        assigned: [s0],
      });
      const assignedWaitlist = await insertApplication(call, {
        fullName: "Álvaro Choque",
        status: "waitlist",
        available: [],
        assigned: [s0],
      });
      const pendingTwoThatDay = await insertApplication(call, {
        fullName: "Beatriz Luna",
        status: "pending",
        firstChoice: 1,
        secondChoice: 2,
        available: [s0, s1, s2],
        // The 22:00 shift is still the 19th in La Paz; Sunday is not.
        assigned: [s1, s2, s3],
      });
      const acceptedNone = await insertApplication(call, {
        fullName: "Mateo Ríos",
        status: "accepted",
        available: [s0],
      });
      const waitlistOne = await insertApplication(call, {
        fullName: "ana Flores",
        status: "waitlist",
        available: [s0],
        assigned: [s1],
      });
      await insertApplication(call, {
        fullName: "Rechazada",
        status: "rejected",
        available: [s0],
      });
      await insertApplication(call, {
        fullName: "Otro turno",
        status: "accepted",
        available: [s1],
      });

      const detail = (await queries.fetchVolunteerShiftDetail(
        call.festivalId,
        s0,
      ))!;
      const admin = (await queries.fetchVolunteerAdminCall(call.festivalId))!;
      expect(detail.festival).toEqual(admin.festival);
      expect(detail.shift).toEqual(admin.shifts.find((s) => s.id === s0));
      expect(detail.shift).toMatchObject({
        label: "Mañana",
        neededHeadcount: 4,
        availableCount: 4,
        assignedCount: 1,
        // The candidates: zoe marked it but is already assigned.
        unassignedAvailableCount: 3,
      });
      expect(detail.assignees).toEqual([
        {
          applicationId: assignedWaitlist,
          fullName: "Álvaro Choque",
          status: "waitlist",
          assignedRoleName: null,
        },
        {
          applicationId: assignedAccepted,
          fullName: "zoe Vargas",
          status: "accepted",
          assignedRoleName: "Fotografía",
        },
      ]);
      expect(detail.candidates).toEqual([
        {
          applicationId: acceptedNone,
          fullName: "Mateo Ríos",
          status: "accepted",
          firstChoiceRoleName: "Acreditación",
          secondChoiceRoleName: "Orientación",
          shiftsThatDay: 0,
        },
        {
          applicationId: pendingTwoThatDay,
          fullName: "Beatriz Luna",
          status: "pending",
          firstChoiceRoleName: "Orientación",
          secondChoiceRoleName: "Fotografía",
          shiftsThatDay: 2,
        },
        {
          applicationId: waitlistOne,
          fullName: "ana Flores",
          status: "waitlist",
          firstChoiceRoleName: "Acreditación",
          secondChoiceRoleName: "Orientación",
          shiftsThatDay: 1,
        },
      ]);

      expect(
        await queries.fetchVolunteerShiftDetail(
          call.festivalId,
          other.shiftIds[0]!,
        ),
      ).toBeNull();
      expect(
        await queries.fetchVolunteerShiftDetail(call.festivalId, 2_000_000_000),
      ).toBeNull();

      // An empty shift.
      const empty = (await queries.fetchVolunteerShiftDetail(
        other.festivalId,
        other.shiftIds[3]!,
      ))!;
      expect(empty).toMatchObject({
        shift: {
          availableCount: 0,
          assignedCount: 0,
          unassignedAvailableCount: 0,
        },
        assignees: [],
        candidates: [],
      });
    });

    it("lists shifts chronologically whatever their stored order", async () => {
      const call = await createCall();
      await integrationDb!
        .update(volunteerShifts)
        .set({ sortOrder: 0 })
        .where(eq(volunteerShifts.id, call.shiftIds[3]!));
      await integrationDb!
        .update(volunteerShifts)
        .set({ sortOrder: 9 })
        .where(eq(volunteerShifts.id, call.shiftIds[0]!));
      const admin = (await queries.fetchVolunteerAdminCall(call.festivalId))!;
      expect(admin.shifts.map((shift) => shift.id)).toEqual(call.shiftIds);
    });

    it("totals applications per status and counts each role's choices", async () => {
      const call = await createCall();
      const other = await createCall();
      const [r0, r1, r2] = call.roleIds as [number, number, number];
      await insertApplication(call, { status: "pending" }); // r0, r1
      await insertApplication(call, { status: "pending" }); // r0, r1
      await insertApplication(call, {
        status: "rejected",
        firstChoice: 1,
        secondChoice: 0,
        assignedRoleId: r2,
      }); // r1, r0; assigned is not a choice
      await insertApplication(call, {
        status: "accepted",
        firstChoice: 2,
        secondChoice: 1,
      }); // r2, r1
      await insertApplication(other, { status: "accepted" });

      const admin = (await queries.fetchVolunteerAdminCall(call.festivalId))!;
      expect(admin.statusTotals).toEqual({
        pending: 2,
        accepted: 1,
        waitlist: 0,
        rejected: 1,
        all: 4,
      });
      expect(
        Object.fromEntries(
          admin.roles.map((role) => [role.id, role.choiceCount]),
        ),
      ).toEqual({ [r0]: 3, [r1]: 4, [r2]: 1 });

      const empty = await createCall();
      const none = (await queries.fetchVolunteerAdminCall(empty.festivalId))!;
      expect(none.statusTotals).toEqual({
        pending: 0,
        accepted: 0,
        waitlist: 0,
        rejected: 0,
        all: 0,
      });
      expect(none.roles.every((role) => role.choiceCount === 0)).toBe(true);
    });

    it("filters the list and counts per status without the status filter", async () => {
      const call = await createCall();
      const [r0, r1, r2] = call.roleIds as [number, number, number];
      const [s0, s1, s2, s3] = call.shiftIds as [
        number,
        number,
        number,
        number,
      ];
      const base = Date.now() - 60 * 60 * 1000;
      const at = (minutes: number) => new Date(base + minutes * 60 * 1000);

      const camila = await insertApplication(call, {
        fullName: "Camila Rojas",
        status: "pending",
        available: [s0],
        createdAt: at(1),
      });
      const lucia = await insertApplication(call, {
        fullName: "Lucía Pérez",
        email: `lucia_100%-${suffix()}@example.test`,
        status: "accepted",
        firstChoice: 1,
        secondChoice: 0,
        assignedRoleId: r2,
        available: [s3, s1],
        assigned: [s2],
        createdAt: at(2),
      });
      const mario = await insertApplication(call, {
        fullName: "Mario Vaca",
        status: "rejected",
        firstChoice: 2,
        secondChoice: 1,
        available: [s1],
        createdAt: at(3),
      });

      const all = await queries.fetchVolunteerApplicationsPage(
        call.festivalId,
        filters(),
      );
      expect(all.items.map((item) => item.id)).toEqual([mario, lucia, camila]);
      expect(all.total).toBe(3);
      expect(all.counts).toEqual({
        pending: 1,
        accepted: 1,
        waitlist: 0,
        rejected: 1,
        all: 3,
      });
      expect(all.items.find((item) => item.id === lucia)).toEqual({
        id: lucia,
        fullName: "Lucía Pérez",
        email: expect.stringMatching(/^lucia_100%-/),
        phone: "+59151234567",
        birthdate: "2000-05-10",
        status: "accepted",
        firstChoiceRoleId: r1,
        secondChoiceRoleId: r0,
        assignedRoleId: r2,
        firstChoiceRoleName: "Orientación",
        secondChoiceRoleName: "Acreditación",
        assignedRoleName: "Fotografía",
        availableShiftIds: [s1, s3].sort((a, b) => a - b),
        assignedShiftIds: [s2],
        createdAt: at(2),
      });
      expect(all.items.find((item) => item.id === camila)).toMatchObject({
        assignedRoleId: null,
        assignedRoleName: null,
        availableShiftIds: [s0],
        assignedShiftIds: [],
      });

      const pending = await queries.fetchVolunteerApplicationsPage(
        call.festivalId,
        filters({ status: "pending" }),
      );
      expect(pending.items.map((item) => item.id)).toEqual([camila]);
      expect(pending.total).toBe(1);
      expect(pending.counts.all).toBe(3);

      const byName = await queries.fetchVolunteerApplicationsPage(
        call.festivalId,
        filters({ query: "lucía" }),
      );
      expect(byName.items.map((item) => item.id)).toEqual([lucia]);
      // Wildcards are literal: "_100%" only matches Lucía's address.
      const byEmail = await queries.fetchVolunteerApplicationsPage(
        call.festivalId,
        filters({ query: "_100%" }),
      );
      expect(byEmail.items.map((item) => item.id)).toEqual([lucia]);
      const wildcard = await queries.fetchVolunteerApplicationsPage(
        call.festivalId,
        filters({ query: "%" }),
      );
      expect(wildcard.items.map((item) => item.id)).toEqual([lucia]);

      // "Rol preferido": 1st or 2nd choice, not the assigned role.
      const byRole = async (roleId: number) =>
        (
          await queries.fetchVolunteerApplicationsPage(
            call.festivalId,
            filters({ roleId }),
          )
        ).items
          .map((item) => item.id)
          .sort((a, b) => a - b);
      expect(await byRole(r0)).toEqual([camila, lucia].sort((a, b) => a - b));
      expect(await byRole(r1)).toEqual(
        [camila, lucia, mario].sort((a, b) => a - b),
      );
      expect(await byRole(r2)).toEqual([mario]);

      // "Turno disponible": marked, not assigned.
      const byShift = async (shiftId: number) =>
        (
          await queries.fetchVolunteerApplicationsPage(
            call.festivalId,
            filters({ shiftId }),
          )
        ).items.map((item) => item.id);
      expect(await byShift(s2)).toEqual([]);
      expect(await byShift(s3)).toEqual([lucia]);
      expect(await byShift(s1)).toEqual([mario, lucia]);
      const byShiftAndStatus = await queries.fetchVolunteerApplicationsPage(
        call.festivalId,
        filters({ shiftId: s1, status: "rejected" }),
      );
      expect(byShiftAndStatus.items.map((item) => item.id)).toEqual([mario]);
      expect(byShiftAndStatus.total).toBe(1);
      expect(byShiftAndStatus.counts).toEqual({
        pending: 0,
        accepted: 1,
        waitlist: 0,
        rejected: 1,
        all: 2,
      });

      // Pagination.
      const secondPage = await queries.fetchVolunteerApplicationsPage(
        call.festivalId,
        filters({ limit: 25, offset: 2 }),
      );
      expect(secondPage.items.map((item) => item.id)).toEqual([camila]);
      expect(secondPage.total).toBe(3);

      // Another festival's applications never show.
      const other = await createCall();
      await insertApplication(other, { fullName: "Camila Rojas" });
      const elsewhere = await queries.fetchVolunteerApplicationsPage(
        call.festivalId,
        filters({ query: "rojas" }),
      );
      expect(elsewhere.items.map((item) => item.id)).toEqual([camila]);
    });

    it("finds a phone by its digits, however it is typed", async () => {
      const call = await createCall();
      const ana = await insertApplication(call, {
        fullName: "Ana Flores",
        email: "ana-flores@example.test",
        phone: "+591 7000-0001",
      });
      await insertApplication(call, {
        fullName: "Beto Paz",
        email: "beto-paz@example.test",
        phone: "+59162223333",
      });
      const search = async (query: string) =>
        (
          await queries.fetchVolunteerApplicationsPage(
            call.festivalId,
            filters({ query }),
          )
        ).items.map((item) => item.id);

      for (const query of [
        "70000001",
        "7000-0001",
        "7000 0001",
        "+591 70000001",
        "(591) 700",
      ]) {
        expect(await search(query)).toEqual([ana]);
      }
      // Fewer than three digits do not search phones.
      expect(await search("01")).toEqual([]);
      expect(await search("70000009")).toEqual([]);
    });

    it("paginates by the limit", async () => {
      const call = await createCall();
      const base = Date.now() - 60 * 60 * 1000;
      const ids: number[] = [];
      for (let index = 0; index < 27; index += 1) {
        ids.push(
          await insertApplication(call, {
            createdAt: new Date(base + index * 1000),
          }),
        );
      }
      const newestFirst = [...ids].reverse();
      const first = await queries.fetchVolunteerApplicationsPage(
        call.festivalId,
        filters({ status: "pending" }),
      );
      expect(first.items.map((item) => item.id)).toEqual(
        newestFirst.slice(0, 25),
      );
      expect(first.total).toBe(27);
      const second = await queries.fetchVolunteerApplicationsPage(
        call.festivalId,
        filters({ status: "pending", offset: 25 }),
      );
      expect(second.items.map((item) => item.id)).toEqual(
        newestFirst.slice(25),
      );
    });

    it("returns one application with its shifts and who reviewed it", async () => {
      const call = await createCall();
      const other = await createCall();
      const applicationId = await insertApplication(call, {
        available: [call.shiftIds[1]!, call.shiftIds[0]!],
      });

      const fresh = await queries.fetchVolunteerApplicationDetail(
        call.festivalId,
        applicationId,
      );
      expect(fresh).toMatchObject({
        id: applicationId,
        festivalId: call.festivalId,
        status: "pending",
        reviewedBy: null,
        reviewedAt: null,
        assignedShiftIds: [],
        availableShiftIds: [call.shiftIds[0], call.shiftIds[1]],
        referralSource: "university",
        imageConsent: false,
      });

      await review(call, applicationId, {
        roleId: call.roleIds[0]!,
        shiftIds: [call.shiftIds[3]!],
      });

      const reviewed = await queries.fetchVolunteerApplicationDetail(
        call.festivalId,
        applicationId,
      );
      expect(reviewed).toMatchObject({
        status: "accepted",
        assignedRoleId: call.roleIds[0],
        assignedShiftIds: [call.shiftIds[3]],
        reviewedBy: { id: REVIEWER.id, displayName: "Fede Festival" },
        reviewedAt: expect.any(Date),
      });

      expect(
        await queries.fetchVolunteerApplicationDetail(
          other.festivalId,
          applicationId,
        ),
      ).toBeNull();
      const stillThere = await integrationDb!
        .select({ id: volunteerApplications.id })
        .from(volunteerApplications)
        .where(
          and(
            eq(volunteerApplications.id, applicationId),
            eq(volunteerApplications.festivalId, call.festivalId),
          ),
        );
      expect(stillThere).toHaveLength(1);
    });

    it("returns every application of the festival for the CSV, newest first", async () => {
      const call = await createCall();
      const other = await createCall();
      const [s0, s1, , s3] = call.shiftIds as [number, number, number, number];
      const base = Date.now() - 60 * 60 * 1000;
      const older = await insertApplication(call, {
        fullName: "Camila Rojas",
        available: [s3, s0],
        createdAt: new Date(base),
      });
      const newer = await insertApplication(call, {
        fullName: "Lucía Pérez",
        status: "accepted",
        firstChoice: 2,
        secondChoice: 0,
        assignedRoleId: call.roleIds[1]!,
        available: [s1],
        assigned: [s1],
        adminNotes: "Trae cámara",
        createdAt: new Date(base + 1000),
      });
      await insertApplication(other);

      const data = (await queries.fetchVolunteerApplicationsForExport(
        call.festivalId,
      ))!;
      expect(data.festival).toEqual({
        id: call.festivalId,
        name: expect.stringMatching(/^Volunteers admin /),
      });
      expect(data.shifts.map((shift) => shift.id)).toEqual(call.shiftIds);
      expect(data.shifts[0]).toEqual({
        id: s0,
        label: "Mañana",
        startsAt: laPaz("2026-12-19T09:00"),
        endsAt: laPaz("2026-12-19T13:00"),
      });
      expect(data.applications.map((row) => row.id)).toEqual([newer, older]);
      expect(data.applications[0]).toEqual({
        id: newer,
        fullName: "Lucía Pérez",
        status: "accepted",
        phone: "+59151234567",
        email: expect.any(String),
        birthdate: "2000-05-10",
        zone: null,
        firstChoiceRoleName: "Fotografía",
        secondChoiceRoleName: "Acreditación",
        assignedRoleName: "Orientación",
        availableShiftIds: [s1],
        assignedShiftIds: [s1],
        experience: [],
        experienceNotes: null,
        portfolio: null,
        motivation: "Quiero ayudar.",
        emergencyContactName: "Ana Rojas",
        emergencyContactPhone: "+59171234567",
        referralSource: "university",
        imageConsent: false,
        adminNotes: "Trae cámara",
        createdAt: new Date(base + 1000),
      });
      expect(data.applications[1]).toMatchObject({
        assignedRoleName: null,
        availableShiftIds: [s0, s3].sort((a, b) => a - b),
        assignedShiftIds: [],
      });
    });
  });
});
