// @vitest-environment node

import { eq, inArray } from "drizzle-orm";
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

import * as schema from "@/db/schema";
import {
  festivals,
  volunteerApplicationAvailableShifts,
  volunteerApplications,
  volunteerCallSettings,
  volunteerRoles,
  volunteerShifts,
} from "@/db/schema";

/**
 * The public volunteer application action against a real database, with the
 * request's network address simulated and Resend replaced.
 */

const requestIp = vi.hoisted(() => ({ value: "203.0.113.1" }));
const afterQueue = vi.hoisted(() => [] as (() => unknown)[]);
const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: (task: () => unknown) => afterQueue.push(task),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ "x-forwarded-for": requestIp.value }),
}));
vi.mock("@/app/vendors/resend", () => ({ sendEmail }));

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

type Actions = typeof import("@/app/lib/volunteers/actions");
let actions: Actions;

const createdFestivals: number[] = [];
const DAY = 24 * 60 * 60 * 1000;

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function createCall(options: { closesAt?: Date } = {}): Promise<{
  festivalId: number;
  roleIds: number[];
  shiftIds: number[];
}> {
  const db = integrationDb!;
  const [festival] = await db
    .insert(festivals)
    .values({
      name: `Volunteers ${suffix()}`,
      status: "published",
      festivalType: "glitter",
    })
    .returning({ id: festivals.id });
  createdFestivals.push(festival!.id);

  await db.insert(volunteerCallSettings).values({
    festivalId: festival!.id,
    applicationsCloseAt: options.closesAt ?? new Date(Date.now() + 7 * DAY),
  });
  const roles = await db
    .insert(volunteerRoles)
    .values(
      [
        "Acreditación",
        "Orientación al público",
        "Fotografía y redes sociales",
      ].map((name, index) => ({
        festivalId: festival!.id,
        name,
        description: `${name}: una línea`,
        sortOrder: index,
      })),
    )
    .returning({ id: volunteerRoles.id });
  const firstShift = Date.now() + 30 * DAY;
  const shifts = await db
    .insert(volunteerShifts)
    .values(
      [0, 1, 2].map((index) => ({
        festivalId: festival!.id,
        label: `Turno ${index + 1}`,
        startsAt: new Date(firstShift + index * DAY),
        endsAt: new Date(firstShift + index * DAY + 4 * 60 * 60 * 1000),
        sortOrder: index,
      })),
    )
    .returning({ id: volunteerShifts.id });

  return {
    festivalId: festival!.id,
    roleIds: roles.map((role) => role.id),
    shiftIds: shifts.map((shift) => shift.id),
  };
}

function application(
  call: { roleIds: number[]; shiftIds: number[] },
  overrides: Record<string, unknown> = {},
) {
  return {
    fullName: "Camila Rojas",
    birthdate: "2000-05-10",
    phone: "+59151234567",
    email: `camila-${suffix()}@example.test`,
    zone: "Equipetrol",
    shiftIds: [call.shiftIds[0], call.shiftIds[1]],
    firstChoiceRoleId: String(call.roleIds[0]),
    secondChoiceRoleId: String(call.roleIds[1]),
    experience: ["events"],
    experienceNotes: "",
    portfolio: "",
    motivation: "Quiero ayudar a que el festival salga increíble.",
    emergencyContactName: "Ana Rojas",
    emergencyContactPhone: "+59171234567",
    referralSource: "university",
    commitmentConsent: true,
    imageConsent: false,
    dataConsent: true,
    website: "",
    ...overrides,
  };
}

async function applicationsFor(festivalId: number) {
  return integrationDb!
    .select()
    .from(volunteerApplications)
    .where(eq(volunteerApplications.festivalId, festivalId));
}

async function runAfterTasks() {
  while (afterQueue.length > 0) await afterQueue.shift()!();
}

describeDatabase("submitVolunteerApplication", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    actions = await import("@/app/lib/volunteers/actions");

    const result = await pool!.query<{ table: string | null }>(
      "select to_regclass('public.volunteer_applications')::text as table",
    );
    if (!result.rows[0]?.table) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
  }, 60_000);

  beforeEach(() => {
    afterQueue.length = 0;
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ data: { id: "email" }, error: null });
    // Each test its own address, so rate limits never carry over.
    requestIp.value = `198.51.100.${Math.floor(Math.random() * 250) + 1}-${suffix()}`;
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
    await pool?.end();
  });

  it("stores an application with its shifts and mails the applicant once", async () => {
    const call = await createCall();
    const input = application(call, {
      email: "  Camila.Rojas+v@Example.TEST ",
    });
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await expect(
        actions.submitVolunteerApplication(call.festivalId, input),
      ).resolves.toEqual({ success: true });
      await runAfterTasks();

      // The query log carries no applicant data (db/index.ts).
      const logged = JSON.stringify(consoleLog.mock.calls);
      expect(logged).toContain("[REDACTED_VOLUNTEER]");
      expect(logged).not.toMatch(
        /camila|rojas|59151234567|59171234567|Equipetrol/i,
      );
    } finally {
      consoleLog.mockRestore();
    }

    const [stored] = await applicationsFor(call.festivalId);
    expect(stored).toMatchObject({
      email: "camila.rojas+v@example.test",
      status: "pending",
      firstChoiceRoleId: call.roleIds[0],
      secondChoiceRoleId: call.roleIds[1],
      assignedRoleId: null,
      privacyNoticeVersion: expect.any(String),
      imageConsent: false,
    });
    const shifts = await integrationDb!
      .select({ shiftId: volunteerApplicationAvailableShifts.shiftId })
      .from(volunteerApplicationAvailableShifts)
      .where(eq(volunteerApplicationAvailableShifts.applicationId, stored!.id));
    expect(shifts.map((row) => row.shiftId).sort()).toEqual(
      [call.shiftIds[0], call.shiftIds[1]].sort(),
    );

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]![0]).toMatchObject({
      to: ["camila.rojas+v@example.test"],
    });
    expect(sendEmail.mock.calls[0]![0].subject).not.toMatch(
      /aceptad|confirmad/i,
    );
  });

  it("answers a second application from the same email like the first, storing and sending nothing", async () => {
    const call = await createCall();
    const email = `dup-${suffix()}@example.test`;

    await actions.submitVolunteerApplication(
      call.festivalId,
      application(call, { email }),
    );
    await runAfterTasks();
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const second = await actions.submitVolunteerApplication(
      call.festivalId,
      application(call, {
        email: `  ${email.toUpperCase()}`,
        fullName: "Otra Persona",
        shiftIds: [call.shiftIds[2]],
      }),
    );
    await runAfterTasks();

    expect(second).toEqual({ success: true });
    const stored = await applicationsFor(call.festivalId);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.fullName).toBe("Camila Rojas");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects an inactive shift", async () => {
    const call = await createCall();
    await integrationDb!
      .update(volunteerShifts)
      .set({ isActive: false })
      .where(eq(volunteerShifts.id, call.shiftIds[1]!));

    const result = await actions.submitVolunteerApplication(
      call.festivalId,
      application(call),
    );

    expect(result).toEqual({
      success: false,
      message: "Uno de los turnos ya no está disponible. Recarga la página.",
    });
    expect(await applicationsFor(call.festivalId)).toHaveLength(0);
    await runAfterTasks();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rejects an inactive role", async () => {
    const call = await createCall();
    await integrationDb!
      .update(volunteerRoles)
      .set({ isActive: false })
      .where(eq(volunteerRoles.id, call.roleIds[1]!));

    const result = await actions.submitVolunteerApplication(
      call.festivalId,
      application(call),
    );

    expect(result).toEqual({
      success: false,
      message: "Ese rol ya no está disponible. Recarga la página.",
    });
    expect(await applicationsFor(call.festivalId)).toHaveLength(0);
  });

  it("rejects a shift or role that belongs to another festival", async () => {
    const call = await createCall();
    const other = await createCall();

    const withForeignShift = await actions.submitVolunteerApplication(
      call.festivalId,
      application(call, { shiftIds: [other.shiftIds[0]] }),
    );
    const withForeignRole = await actions.submitVolunteerApplication(
      call.festivalId,
      application(call, { secondChoiceRoleId: String(other.roleIds[2]) }),
    );

    expect(withForeignShift).toEqual({
      success: false,
      message: "Uno de los turnos ya no está disponible. Recarga la página.",
    });
    expect(withForeignRole).toEqual({
      success: false,
      message: "Ese rol ya no está disponible. Recarga la página.",
    });
    expect(await applicationsFor(call.festivalId)).toHaveLength(0);
  });

  it("refuses applications after the closing date", async () => {
    const call = await createCall({ closesAt: new Date(Date.now() - 60_000) });

    const result = await actions.submitVolunteerApplication(
      call.festivalId,
      application(call),
    );

    expect(result).toMatchObject({ success: false, closed: true });
    expect(await applicationsFor(call.festivalId)).toHaveLength(0);
  });

  it("stores the optional image authorization when given", async () => {
    const call = await createCall();

    await expect(
      actions.submitVolunteerApplication(
        call.festivalId,
        application(call, { imageConsent: true }),
      ),
    ).resolves.toEqual({ success: true });

    const [stored] = await applicationsFor(call.festivalId);
    expect(stored!.imageConsent).toBe(true);
  });

  it("answers a filled honeypot with the normal success and stores nothing", async () => {
    const call = await createCall();

    const result = await actions.submitVolunteerApplication(
      call.festivalId,
      application(call, { website: "https://spam.example" }),
    );
    await runAfterTasks();

    expect(result).toEqual({ success: true });
    expect(await applicationsFor(call.festivalId)).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
