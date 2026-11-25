// @vitest-environment node

import { randomUUID } from "crypto";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { buildView } from "@/app/lib/credentials/calculate";
import {
  DEFAULT_CREDENTIAL_RULES,
  type CredentialFilters,
} from "@/app/lib/credentials/definitions";
import * as schema from "@/db/schema";
import {
  externalParticipants,
  festivals,
  reservationExternalParticipants,
  reservationParticipants,
  standReservations,
  standReservationStands,
  stands,
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

function isSafeTestDatabase(url: string): boolean {
  try {
    return /(^|[_-])(test|ci)([_-]|$)/i.test(
      decodeURIComponent(new URL(url).pathname.slice(1)),
    );
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

const created = { users: [] as number[], festivals: [] as number[], externals: [] as number[] };

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
  }: {
    status?: "accepted" | "verification_payment" | "pending" | "cancelled" | "rejected" | "released";
    category?: "illustration" | "gastronomy" | "entrepreneurship";
    standCount?: number;
    releasedStands?: number;
    userIds?: number[];
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
      ownerUserId: userIds[0] ?? null,
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
});
