// @vitest-environment node

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import {
  festivalSectors,
  festivals,
  notificationDeliveries,
  notifications,
  pushSubscriptions,
  scheduledTasks,
  standReservations,
  stands,
  users,
} from "@/db/schema";

const { after, sendEmail } = vi.hoisted(() => ({
  after: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after,
}));
vi.mock("@/app/vendors/resend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/vendors/resend")>()),
  sendEmail,
}));

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

let handlers: typeof import("@/app/lib/profile_tasks/actions");

const KIND = "reservation_payment_reminder";
const HOUR = 60 * 60 * 1000;

const created = { festivals: [] as number[], users: [] as number[] };

function tag() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describeDatabase("reservation payment reminders", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    handlers = await import("@/app/lib/profile_tasks/actions");
  }, 60_000);

  afterEach(async () => {
    after.mockReset();
    sendEmail.mockReset();
    const db = integrationDb!;
    const userIds = created.users.splice(0);
    if (userIds.length > 0) {
      await db
        .delete(scheduledTasks)
        .where(inArray(scheduledTasks.profileId, userIds));
    }
    const festivalIds = created.festivals.splice(0);
    if (festivalIds.length > 0) {
      await db
        .delete(standReservations)
        .where(inArray(standReservations.festivalId, festivalIds));
      await db.delete(stands).where(inArray(stands.festivalId, festivalIds));
      await db
        .delete(festivalSectors)
        .where(inArray(festivalSectors.festivalId, festivalIds));
      await db.delete(festivals).where(inArray(festivals.id, festivalIds));
    }
    if (userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, userIds));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function makeReservation(
    status: (typeof standReservations.$inferInsert)["status"] = "pending",
    { devices = 1 }: { devices?: number } = {},
  ) {
    const db = integrationDb!;
    const t = tag();
    const [user] = await db
      .insert(users)
      .values({
        clerkId: `clerk-payment-reminder-${t}`,
        email: `payment-reminder-${t}@example.test`,
        status: "verified",
        category: "illustration",
      })
      .returning();
    created.users.push(user!.id);
    for (let i = 0; i < devices; i++) {
      await db.insert(pushSubscriptions).values({
        userId: user!.id,
        endpoint: `https://push.example.test/${t}/${i}`,
        p256dh: "p256dh",
        auth: "auth",
        applicationServerKey: "key",
      });
    }
    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Payment reminder ${t}`,
        status: "active",
        festivalType: "glitter",
      })
      .returning();
    created.festivals.push(festival!.id);
    const [sector] = await db
      .insert(festivalSectors)
      .values({ name: "Galería", festivalId: festival!.id })
      .returning();
    const [stand] = await db
      .insert(stands)
      .values({
        standNumber: 48,
        standCategory: "illustration",
        status: "reserved",
        festivalId: festival!.id,
        festivalSectorId: sector!.id,
      })
      .returning();
    const [reservation] = await db
      .insert(standReservations)
      .values({
        standId: stand!.id,
        festivalId: festival!.id,
        status,
        ownerUserId: user!.id,
      })
      .returning();
    const dueDate = new Date(Date.now() + 20 * HOUR);
    const [task] = await db
      .insert(scheduledTasks)
      .values({
        taskType: "stand_reservation",
        profileId: user!.id,
        reservationId: reservation!.id,
        dueDate,
        reminderTime: new Date(Date.now() - HOUR),
      })
      .returning();
    return {
      user: user!,
      festival: festival!,
      reservation: reservation!,
      task: task!,
      dueDate,
    };
  }

  async function itemsFor(userId: number) {
    return integrationDb!
      .select({
        id: notifications.id,
        title: notifications.title,
        body: notifications.body,
        actionPath: notifications.actionPath,
        actionLabel: notifications.actionLabel,
      })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.kind, KIND)),
      );
  }

  it("puts the reminder in Glitter and on the person's devices, next to the email", async () => {
    sendEmail.mockResolvedValue({ data: { id: "email-1" }, error: null });
    const { user, festival, reservation, task } = await makeReservation(
      "pending",
      { devices: 2 },
    );

    const sent = await handlers.handleReservationReminderEmails();
    expect(sent.map((row) => row.id)).toContain(task.id);

    const items = await itemsFor(user.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: `Recordá pagar tu reserva para ${festival.name}`,
      actionPath: `/profiles/${user.id}/festivals/${festival.id}/reservations/${reservation.id}/payments`,
      actionLabel: "Completar el pago",
    });
    expect(items[0]!.body).toMatch(/^Tu reserva del espacio .*48.* vence el /);

    const pushes = await integrationDb!
      .select({ channel: notificationDeliveries.channel })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.notificationId, items[0]!.id));
    expect(pushes).toEqual([{ channel: "push" }, { channel: "push" }]);
    // The pushes go once the run commits.
    expect(after).toHaveBeenCalled();

    const [row] = await integrationDb!
      .select({ reminderSentAt: scheduledTasks.reminderSentAt })
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, task.id));
    expect(row!.reminderSentAt).not.toBeNull();
  });

  it("writes it once while the email is retried, and again for a new deadline", async () => {
    // The email fails: the task stays due and the next run retries it.
    sendEmail.mockResolvedValue({ data: null, error: { name: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { user, task } = await makeReservation();

    await handlers.handleReservationReminderEmails();
    await handlers.handleReservationReminderEmails();
    expect(await itemsFor(user.id)).toHaveLength(1);

    await integrationDb!
      .update(scheduledTasks)
      .set({ dueDate: new Date(Date.now() + 40 * HOUR) })
      .where(eq(scheduledTasks.id, task.id));
    await handlers.handleReservationReminderEmails();
    expect(await itemsFor(user.id)).toHaveLength(2);
  });

  it("does not remind a reservation whose voucher is in", async () => {
    sendEmail.mockResolvedValue({ data: { id: "email-1" }, error: null });
    const { user } = await makeReservation("verification_payment");

    await handlers.handleReservationReminderEmails();
    expect(await itemsFor(user.id)).toEqual([]);
  });
});
