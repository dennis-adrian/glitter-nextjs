// @vitest-environment node

import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { buildView, type CredentialsData } from "@/app/lib/credentials/calculate";
import {
  DEFAULT_CREDENTIAL_RULES,
  type CredentialFilters,
} from "@/app/lib/credentials/definitions";
import * as schema from "@/db/schema";
import {
  externalParticipants,
  festivals,
  festivalStaffMembers,
  reservationExternalParticipants,
  reservationParticipants,
  standReservations,
  standReservationStands,
  stands,
  staffMembers,
  users,
  volunteerApplications,
  volunteerRoles,
} from "@/db/schema";

/**
 * The credentials reads against a real database: membership, statuses and
 * festival scoping.
 */

vi.mock("server-only", () => ({}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

/**
 * Checks the database pg itself would select, not the URL's path: a socket URL
 * keeps its directory in the path (`socket:/run/pg-test?db=prod`) or names the
 * database elsewhere, and a URL without one falls back to PGDATABASE or the
 * user. The constructor only parses; it does not connect.
 */
function isSafeTestDatabase(url: string): boolean {
  try {
    const database = new Client({ connectionString: url }).database;
    return typeof database === "string" && /(^|[_-])(test|ci)([_-]|$)/i.test(database);
  } catch {
    return false;
  }
}

if (testDatabaseUrl && !isSafeTestDatabase(testDatabaseUrl)) {
  throw new Error(
    "TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.",
  );
}

const pool = testDatabaseUrl ? new Pool({ connectionString: testDatabaseUrl, max: 5 }) : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

let queries: typeof import("@/app/lib/credentials/queries");

const created = {
  users: [] as number[],
  festivals: [] as number[],
  externals: [] as number[],
  staff: [] as number[],
};

const ALL: CredentialFilters = {
  statuses: { verification_payment: true, pending: true },
  groups: { external: true, volunteer: true, staff: true },
};

async function createFestival() {
  const [festival] = await integrationDb!
    .insert(festivals)
    .values({ name: `Credenciales ${randomUUID()}`, status: "published", festivalType: "glitter" })
    .returning({ id: festivals.id });
  created.festivals.push(festival!.id);
  return festival!.id;
}

async function createUser(displayName: string) {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `credentials-${suffix}`,
      email: `credentials-${suffix}@example.test`,
      displayName,
      role: "user",
      status: "verified",
    })
    .returning({ id: users.id });
  created.users.push(user!.id);
  return user!.id;
}

let standNumber = 1;

async function createReservation(
  festivalId: number,
  {
    status = "accepted",
    category = "illustration",
    standCount = 1,
    releasedStands = 0,
    userIds = [],
    ownerUserId = userIds[0] ?? null,
  }: {
    status?: "accepted" | "verification_payment" | "pending" | "cancelled" | "rejected" | "released";
    category?: "illustration" | "gastronomy" | "entrepreneurship";
    standCount?: number;
    releasedStands?: number;
    /** Participations are created in this order. */
    userIds?: number[];
    ownerUserId?: number | null;
  },
) {
  const db = integrationDb!;
  const standRows = await db
    .insert(stands)
    .values(
      Array.from({ length: standCount + releasedStands }, () => ({
        festivalId,
        label: "A",
        standNumber: standNumber++,
        standCategory: category,
        status: "reserved" as const,
      })),
    )
    .returning({ id: stands.id });
  const [reservation] = await db
    .insert(standReservations)
    .values({
      standId: standRows[0]!.id,
      festivalId,
      status,
      ownerUserId,
    })
    .returning({ id: standReservations.id });
  await db.insert(standReservationStands).values(
    standRows.map((stand, index) => ({
      reservationId: reservation!.id,
      standId: stand.id,
      position: index,
      releasedAt: index >= standCount ? new Date() : null,
    })),
  );
  if (userIds.length) {
    await db
      .insert(reservationParticipants)
      .values(userIds.map((userId) => ({ userId, reservationId: reservation!.id })));
  }
  return reservation!.id;
}

type Settled<T> = { value: T } | { error: unknown };

/** Never rejects, so a read can be awaited on every exit path. */
function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
}

/**
 * Waits until the read's own connection (found by its application name)
 * queues for a lock on `table`. Only that connection counts: in a full
 * integration run other files query the same tables, and their waits would
 * end this one before the read got there. A read that settles first fails
 * the wait as itself, not as a timeout.
 */
async function waitForLock(
  table: string,
  applicationName: string,
  reading: Promise<Settled<unknown>>,
) {
  const state: { settled?: Settled<unknown> } = {};
  void reading.then((settled) => {
    state.settled = settled;
  });
  for (let attempt = 0; ; attempt += 1) {
    if (state.settled) {
      throw "error" in state.settled
        ? state.settled.error
        : new Error(`The read finished without waiting for ${table}.`);
    }
    const { rows } = await pool!.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting
       FROM pg_locks l JOIN pg_stat_activity a USING (pid)
       WHERE l.locktype = 'relation' AND NOT l.granted
         AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
         AND l.relation = $1::regclass
         AND a.application_name = $2`,
      [table, applicationName],
    );
    if (rows[0]!.waiting > 0) return;
    if (attempt > 250) throw new Error(`Nothing waited for ${table}.`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describeDatabase("credentials queries", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    queries = await import("@/app/lib/credentials/queries");
  });

  afterAll(async () => {
    const db = integrationDb!;
    if (created.festivals.length) {
      await db
        .delete(standReservations)
        .where(inArray(standReservations.festivalId, created.festivals));
      await db.delete(stands).where(inArray(stands.festivalId, created.festivals));
      await db.delete(festivals).where(inArray(festivals.id, created.festivals));
    }
    if (created.externals.length) {
      await db
        .delete(externalParticipants)
        .where(inArray(externalParticipants.id, created.externals));
    }
    if (created.staff.length) {
      await db.delete(staffMembers).where(inArray(staffMembers.id, created.staff));
    }
    if (created.users.length) {
      await db.delete(users).where(inArray(users.id, created.users));
    }
    await pool?.end();
  });

  it("returns null for a festival that does not exist", async () => {
    expect(await queries.fetchCredentialsData(integrationDb!, 2_000_000_000)).toBeNull();
  });

  it("counts active members only, all three statuses and nothing else", async () => {
    const festivalId = await createFestival();
    const solo = await createUser("Solo");
    const full = await createUser("Mesa completa");
    const released = await createUser("Con un espacio liberado");
    const verifying = await createUser("En verificación");
    const pending = await createUser("Pendiente");
    const cancelled = await createUser("Cancelada");
    const rejected = await createUser("Rechazada");
    const gone = await createUser("Liberada");

    await createReservation(festivalId, { userIds: [solo] });
    const fullId = await createReservation(festivalId, { userIds: [full], standCount: 2 });
    await createReservation(festivalId, {
      userIds: [released],
      standCount: 1,
      releasedStands: 1,
    });
    await createReservation(festivalId, {
      userIds: [verifying],
      status: "verification_payment",
    });
    await createReservation(festivalId, { userIds: [pending], status: "pending" });
    await createReservation(festivalId, { userIds: [cancelled], status: "cancelled" });
    await createReservation(festivalId, { userIds: [rejected], status: "rejected" });
    await createReservation(festivalId, { userIds: [gone], status: "released" });

    const data = (await queries.fetchCredentialsData(integrationDb!, festivalId))!;
    expect(data.reservations.map((reservation) => reservation.status).sort()).toEqual([
      "accepted",
      "accepted",
      "accepted",
      "pending",
      "verification_payment",
    ]);
    expect(data.reservations.find((reservation) => reservation.id === fullId)!.stands).toHaveLength(2);

    const view = buildView(data, DEFAULT_CREDENTIAL_RULES, ALL);
    const byName = Object.fromEntries(
      view.holders.map((holder) => [holder.name, [holder.named, holder.unnamed]]),
    );
    expect(byName).toEqual({
      Solo: [1, 1],
      "Mesa completa": [1, 3],
      // The released half is ignored: one stand, 2 credentials.
      "Con un espacio liberado": [1, 1],
      "En verificación": [1, 1],
      Pendiente: [1, 1],
    });
  });

  it("keeps a reservation with every member released, so it can be warned about", async () => {
    const festivalId = await createFestival();
    const user = await createUser("Sin espacio");
    await createReservation(festivalId, { userIds: [user], standCount: 0, releasedStands: 1 });
    const data = (await queries.fetchCredentialsData(integrationDb!, festivalId))!;
    expect(data.reservations).toHaveLength(1);
    expect(data.reservations[0]!.stands).toEqual([]);
    const view = buildView(data, DEFAULT_CREDENTIAL_RULES, ALL);
    expect(view.holders).toEqual([]);
    expect(view.warnings.map((warning) => warning.kind)).toEqual(["no_stands"]);
  });

  it("never leaks another festival's data", async () => {
    const mine = await createFestival();
    const other = await createFestival();
    const user = await createUser("De otro festival");
    await createReservation(other, { userIds: [user] });

    const [role] = await integrationDb!
      .insert(volunteerRoles)
      .values({ festivalId: other, name: "Acreditación", description: "Una línea" })
      .returning({ id: volunteerRoles.id });
    const [second] = await integrationDb!
      .insert(volunteerRoles)
      .values({ festivalId: other, name: "Orientación", description: "Una línea" })
      .returning({ id: volunteerRoles.id });
    await integrationDb!.insert(volunteerApplications).values({
      festivalId: other,
      fullName: "Voluntaria ajena",
      birthdate: "2000-01-01",
      phone: "+59170000000",
      email: `vol-${randomUUID()}@example.test`,
      firstChoiceRoleId: role!.id,
      secondChoiceRoleId: second!.id,
      motivation: "Ayudar",
      emergencyContactName: "Ana",
      emergencyContactPhone: "+59170000001",
      referralSource: "friends",
      consentedAt: new Date(),
      privacyNoticeVersion: "test",
      status: "accepted",
      assignedRoleId: role!.id,
    });

    const data = (await queries.fetchCredentialsData(integrationDb!, mine))!;
    expect(data.reservations).toEqual([]);
    expect(data.participants).toEqual([]);
    expect(data.volunteers).toEqual([]);
    expect(data.volunteerCounts.accepted).toBe(0);

    const theirs = (await queries.fetchCredentialsData(integrationDb!, other))!;
    expect(theirs.volunteers).toEqual([
      expect.objectContaining({ fullName: "Voluntaria ajena", roleName: "Acreditación" }),
    ]);
  });

  it("lists archived members not selected here apart from the roster", async () => {
    const festivalId = await createFestival();
    const other = await createFestival();
    const tag = randomUUID();
    const rows = await integrationDb!
      .insert(staffMembers)
      .values([
        { fullName: `Activa ${tag}`, roleLabel: "Producción", isActive: true },
        { fullName: `Archivada marcada ${tag}`, roleLabel: "Diseño", isActive: false },
        { fullName: `Archivada sin marcar ${tag}`, roleLabel: "Sonido", isActive: false },
      ])
      .returning({ id: staffMembers.id });
    const [active, archivedSelected, archivedUnselected] = rows.map((row) => row.id);
    created.staff.push(...rows.map((row) => row.id));
    await integrationDb!.insert(festivalStaffMembers).values([
      { festivalId, staffMemberId: archivedSelected! },
      // Selected elsewhere only: still restorable from this festival.
      { festivalId: other, staffMemberId: archivedUnselected! },
    ]);

    const data = (await queries.fetchCredentialsData(integrationDb!, festivalId))!;
    const staffIds = data.staff.map((member) => member.id);
    expect(staffIds).toEqual(expect.arrayContaining([active, archivedSelected]));
    expect(staffIds).not.toContain(archivedUnselected);
    expect(data.staff.find((member) => member.id === archivedSelected)).toMatchObject({
      isActive: false,
      selected: true,
    });
    const archivedIds = data.archivedStaff.map((member) => member.id);
    expect(archivedIds).not.toContain(active);
    expect(archivedIds).not.toContain(archivedSelected);
    expect(data.archivedStaff.find((member) => member.id === archivedUnselected)).toEqual({
      id: archivedUnselected,
      fullName: `Archivada sin marcar ${tag}`,
      roleLabel: "Sonido",
    });

    // Where she is selected, she stays in the roster instead.
    const theirs = (await queries.fetchCredentialsData(integrationDb!, other))!;
    expect(theirs.staff.map((member) => member.id)).toContain(archivedUnselected);
    expect(theirs.archivedStaff.map((member) => member.id)).not.toContain(archivedUnselected);
  });

  it("reads external participants and labels them, also on a transaction", async () => {
    const festivalId = await createFestival();
    const reservationId = await createReservation(festivalId, { standCount: 2 });
    const [external] = await integrationDb!
      .insert(externalParticipants)
      .values({ displayName: "Refugio Huellitas", type: "social_organization" })
      .returning({ id: externalParticipants.id });
    created.externals.push(external!.id);
    await integrationDb!
      .insert(reservationExternalParticipants)
      .values({ reservationId, externalParticipantId: external!.id });

    const data = await integrationDb!.transaction((tx) =>
      queries.fetchCredentialsData(tx, festivalId, { concurrency: 1 }),
    );
    expect(data!.externals).toEqual([
      {
        reservationId,
        externalParticipantId: external!.id,
        displayName: "Refugio Huellitas",
        categoryLabel: "Organización social",
      },
    ]);
    const view = buildView(data!, DEFAULT_CREDENTIAL_RULES, ALL);
    expect(view.holders).toEqual([
      expect.objectContaining({ key: `external:${external!.id}`, named: 4 }),
    ]);
  });

  it("reads the owner with the people, so a transfer committed mid-read keeps the unnamed ones on the owner", async () => {
    const festivalId = await createFestival();
    const owner = await createUser("Titular");
    const partner = await createUser("Socia");
    // The same person's new account: the transfer changes no name, so the
    // screen before and after it is the same.
    const newAccount = await createUser("Titular");
    // The partner's participation is the older one: only the owner puts the
    // owner first, with the 2 unnamed credentials.
    const reservationId = await createReservation(festivalId, {
      userIds: [partner, owner],
      ownerUserId: owner,
      standCount: 2,
    });
    const [participation] = await integrationDb!
      .select({ id: reservationParticipants.id })
      .from(reservationParticipants)
      .where(
        and(
          eq(reservationParticipants.reservationId, reservationId),
          eq(reservationParticipants.userId, owner),
        ),
      );
    const byName = (data: CredentialsData) =>
      Object.fromEntries(
        buildView(data, DEFAULT_CREDENTIAL_RULES, ALL).holders.map((holder) => [
          holder.name,
          [holder.named, holder.unnamed],
        ]),
      );
    const screen = { Titular: [1, 2], Socia: [1, 0] };
    expect(byName((await queries.fetchCredentialsData(integrationDb!, festivalId))!)).toEqual(
      screen,
    );

    // A participant transfer moves the participation and the owner in one
    // commit. Locking the people's table holds the read's people statement
    // until that commit, after its reservations statement has run: the
    // transfer lands between the two.
    const applicationName = `credentials-read-${randomUUID()}`;
    const readPool = new Pool({
      connectionString: testDatabaseUrl,
      max: 1,
      application_name: applicationName,
    });
    const transfer: PoolClient = await pool!.connect();
    let reading: Promise<Settled<CredentialsData | null>> | null = null;
    try {
      await transfer.query("BEGIN");
      await transfer.query("LOCK TABLE participations IN ACCESS EXCLUSIVE MODE");
      await transfer.query("UPDATE participations SET user_id = $1 WHERE id = $2", [
        newAccount,
        participation!.id,
      ]);
      await transfer.query("UPDATE stand_reservations SET owner_user_id = $1 WHERE id = $2", [
        newAccount,
        reservationId,
      ]);
      reading = settle(
        drizzle(readPool, { schema }).transaction((tx) =>
          queries.fetchCredentialsData(tx, festivalId, { concurrency: 1 }),
        ),
      );
      await waitForLock("participations", applicationName, reading);
      await transfer.query("COMMIT");
    } finally {
      await transfer.query("ROLLBACK").catch(() => undefined);
      transfer.release();
      await reading;
      await readPool.end();
    }

    const read = (await reading)!;
    if ("error" in read) throw read.error;
    const data = read.value!;
    // The people statement saw the transfer, which committed while it waited.
    expect(new Set(data.participants.map((participant) => participant.user.id))).toEqual(
      new Set([partner, newAccount]),
    );
    expect(byName(data)).toEqual(screen);
  });

  it("reads the page on one snapshot, even when a reservation stops counting mid-read", async () => {
    const festivalId = await createFestival();
    const reservationId = await createReservation(festivalId, {
      userIds: [await createUser("Instantánea")],
    });

    // The read gets its own named connection, so the wait below is its own.
    const applicationName = `credentials-snapshot-${randomUUID()}`;
    const readerPool = new Pool({ connectionString: testDatabaseUrl, max: 1, application_name: applicationName });
    const blocker = await pool!.connect();
    let reading: Promise<Settled<CredentialsData | null>> | null = null;
    try {
      // Pause the read on its participants statement, after its reservations
      // statement, and reject the reservation meanwhile.
      await blocker.query("BEGIN");
      await blocker.query("LOCK TABLE participations IN ACCESS EXCLUSIVE MODE");
      reading = settle(
        queries.fetchCredentialsSnapshot(drizzle(readerPool, { schema }) as never, festivalId),
      );
      await waitForLock("participations", applicationName, reading);
      await integrationDb!
        .update(standReservations)
        .set({ status: "rejected" })
        .where(eq(standReservations.id, reservationId));
      await blocker.query("COMMIT");

      // Read from before the rejection: the reservation keeps its participant,
      // rather than turning up without people.
      const read = await reading;
      if ("error" in read) throw read.error;
      const data = read.value;
      expect(data!.reservations.map((reservation) => reservation.id)).toEqual([reservationId]);
      expect(data!.participants).toEqual([expect.objectContaining({ reservationId })]);
      expect(buildView(data!, DEFAULT_CREDENTIAL_RULES, ALL).warnings).toEqual([]);
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
      await reading;
      await readerPool.end();
    }

    expect((await queries.fetchCredentialsSnapshot(integrationDb!, festivalId))!.reservations).toEqual([]);
    expect(await queries.fetchCredentialsSnapshot(integrationDb!, 2_000_000_000)).toBeNull();
  });
});
