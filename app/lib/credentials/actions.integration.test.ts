// @vitest-environment node

import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyPrintState,
  batchCountsFor,
  buildHolders,
  resolveRules,
} from "@/app/lib/credentials/calculate";
import * as schema from "@/db/schema";
import {
  festivalCredentialRules,
  festivals,
  reservationParticipants,
  standReservations,
  standReservationStands,
  stands,
  users,
} from "@/db/schema";
import { ImpersonationReadOnlyError } from "@/db/write-guard";

/**
 * The credentials actions against a real database, with the signed-in staff
 * member simulated.
 */

const currentProfile = vi.hoisted(() => ({
  value: null as null | { id: number; role: "admin" | "festival_admin" },
}));
const failNextTransaction = vi.hoisted(() => ({ value: false }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/app/lib/users/helpers", () => ({
  requireAdminOrFestivalAdmin: vi.fn(async () => currentProfile.value),
}));

const dbHolder = vi.hoisted(() => ({ current: null as never }));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "transaction" && failNextTransaction.value) {
          failNextTransaction.value = false;
          return async () => {
            throw new ImpersonationReadOnlyError();
          };
        }
        const value = (dbHolder.current as never as Record<string, unknown>)[prop as string];
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(dbHolder.current)
          : value;
      },
    },
  ),
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    return /(^|[_-])(test|ci)([_-]|$)/i.test(decodeURIComponent(new URL(url).pathname.slice(1)));
  } catch {
    return false;
  }
}

if (testDatabaseUrl && !isSafeTestDatabase(testDatabaseUrl)) {
  throw new Error("TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.");
}

const pool = testDatabaseUrl ? new Pool({ connectionString: testDatabaseUrl, max: 8 }) : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Actions = typeof import("@/app/lib/credentials/actions");
let actions: Actions;
let queries: typeof import("@/app/lib/credentials/queries");

const created = {
  users: [] as number[],
  festivals: [] as number[],
  externals: [] as number[],
  staff: [] as number[],
};

const DEFAULT_FORM = {
  illustration: { quantity: 2, namingMode: "one_per_participant" as const },
  entrepreneurship: { quantity: 2, namingMode: "one_per_participant" as const },
  gastronomy: { quantity: 2, namingMode: "all_named" as const },
  external: { quantity: 2 },
  volunteer: { quantity: 1 },
  staff: { quantity: 1 },
};

async function createFestival() {
  const [festival] = await integrationDb!
    .insert(festivals)
    .values({ name: `Credenciales acciones ${randomUUID()}`, status: "published", festivalType: "glitter" })
    .returning({ id: festivals.id });
  created.festivals.push(festival!.id);
  return festival!.id;
}

async function createUser(displayName: string, role: "user" | "admin" | "festival_admin" = "user") {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `credentials-actions-${suffix}`,
      email: `credentials-actions-${suffix}@example.test`,
      displayName,
      role,
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
    userIds = [],
    standCount = 1,
    status = "accepted",
  }: { userIds?: number[]; standCount?: number; status?: "accepted" | "pending" | "cancelled" },
) {
  const db = integrationDb!;
  const standRows = await db
    .insert(stands)
    .values(
      Array.from({ length: standCount }, () => ({
        festivalId,
        label: "B",
        standNumber: standNumber++,
        standCategory: "illustration" as const,
        status: "reserved" as const,
      })),
    )
    .returning({ id: stands.id });
  const [reservation] = await db
    .insert(standReservations)
    .values({ standId: standRows[0]!.id, festivalId, status, ownerUserId: userIds[0] ?? null })
    .returning({ id: standReservations.id });
  await db.insert(standReservationStands).values(
    standRows.map((stand, position) => ({ reservationId: reservation!.id, standId: stand.id, position })),
  );
  const participations = userIds.length
    ? await db
        .insert(reservationParticipants)
        .values(userIds.map((userId) => ({ userId, reservationId: reservation!.id })))
        .returning({ id: reservationParticipants.id })
    : [];
  return {
    reservationId: reservation!.id,
    standIds: standRows.map((stand) => stand.id),
    participationIds: participations.map((row) => row.id),
  };
}

async function ruleRows(festivalId: number) {
  return integrationDb!
    .select({
      group: festivalCredentialRules.group,
      quantity: festivalCredentialRules.quantity,
      namingMode: festivalCredentialRules.namingMode,
    })
    .from(festivalCredentialRules)
    .where(eq(festivalCredentialRules.festivalId, festivalId));
}

describeDatabase("credentials actions", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    dbHolder.current = integrationDb as never;
    actions = await import("@/app/lib/credentials/actions");
    queries = await import("@/app/lib/credentials/queries");
  });

  beforeEach(async () => {
    failNextTransaction.value = false;
    currentProfile.value = { id: await createUser("Staff", "festival_admin"), role: "festival_admin" };
  });

  afterAll(async () => {
    const db = integrationDb!;
    if (created.festivals.length) {
      await db.delete(standReservations).where(inArray(standReservations.festivalId, created.festivals));
      await db.delete(stands).where(inArray(stands.festivalId, created.festivals));
      await db.delete(festivals).where(inArray(festivals.id, created.festivals));
    }
    if (created.externals.length) {
      await db.delete(schema.externalParticipants).where(inArray(schema.externalParticipants.id, created.externals));
    }
    if (created.staff.length) {
      await db.delete(schema.staffMembers).where(inArray(schema.staffMembers.id, created.staff));
    }
    if (created.users.length) {
      await db.delete(users).where(inArray(users.id, created.users));
    }
    await pool?.end();
  });

  describe("gates", () => {
    it("refuses callers who are not staff", async () => {
      const festivalId = await createFestival();
      currentProfile.value = null;
      expect(await actions.resetCredentialRules({ festivalId })).toEqual({
        success: false,
        message: "No tenés permiso para hacer esto.",
      });
      expect(
        await actions.saveCredentialRules({ festivalId, rules: DEFAULT_FORM }),
      ).toEqual({ success: false, message: "No tenés permiso para hacer esto." });
    });

    it("surfaces the impersonation read-only refusal", async () => {
      const festivalId = await createFestival();
      failNextTransaction.value = true;
      const result = await actions.resetCredentialRules({ festivalId });
      expect(result.success).toBe(false);
      expect(result.message).toBe(new ImpersonationReadOnlyError().message);
    });

    it("refuses a festival that does not exist", async () => {
      expect(await actions.resetCredentialRules({ festivalId: 2_000_000_000 })).toEqual({
        success: false,
        message: "No encontramos ese festival. Actualizá la página.",
      });
    });
  });

  describe("rules", () => {
    it("upserts only what differs from the default and resets to none", async () => {
      const festivalId = await createFestival();
      expect(
        await actions.saveCredentialRules({
          festivalId,
          rules: {
            ...DEFAULT_FORM,
            gastronomy: { quantity: 3, namingMode: "all_named" },
            volunteer: { quantity: 2 },
          },
        }),
      ).toEqual({ success: true, message: "Reglas guardadas." });
      expect(
        (await ruleRows(festivalId)).sort((a, b) => a.group.localeCompare(b.group)),
      ).toEqual([
        { group: "gastronomy", quantity: 3, namingMode: "all_named" },
        { group: "volunteer", quantity: 2, namingMode: null },
      ]);

      // Back to the default for gastronomy: its row goes; a naming change alone stays.
      await actions.saveCredentialRules({
        festivalId,
        rules: {
          ...DEFAULT_FORM,
          illustration: { quantity: 2, namingMode: "all_named" },
          volunteer: { quantity: 2 },
        },
      });
      expect(
        (await ruleRows(festivalId)).sort((a, b) => a.group.localeCompare(b.group)),
      ).toEqual([
        { group: "illustration", quantity: 2, namingMode: "all_named" },
        { group: "volunteer", quantity: 2, namingMode: null },
      ]);

      expect((await actions.resetCredentialRules({ festivalId })).success).toBe(true);
      expect(await ruleRows(festivalId)).toEqual([]);
    });

    it("keeps one admin's whole rule set when two save at once", async () => {
      const festivalId = await createFestival();
      const first = { ...DEFAULT_FORM, gastronomy: { quantity: 3, namingMode: "all_named" as const } };
      const second = { ...DEFAULT_FORM, volunteer: { quantity: 2 }, staff: { quantity: 3 } };
      for (let round = 0; round < 5; round += 1) {
        await Promise.all([
          actions.saveCredentialRules({ festivalId, rules: first }),
          actions.saveCredentialRules({ festivalId, rules: second }),
          actions.resetCredentialRules({ festivalId }),
        ]);
        const groups = (await ruleRows(festivalId)).map((row) => row.group).sort();
        expect([[], ["gastronomy"], ["staff", "volunteer"]]).toContainEqual(groups);
      }
    });

    it("never touches another festival's rules", async () => {
      const mine = await createFestival();
      const other = await createFestival();
      await actions.saveCredentialRules({
        festivalId: other,
        rules: { ...DEFAULT_FORM, staff: { quantity: 3 } },
      });
      await actions.resetCredentialRules({ festivalId: mine });
      expect(
        await integrationDb!
          .select({ quantity: festivalCredentialRules.quantity })
          .from(festivalCredentialRules)
          .where(
            and(
              eq(festivalCredentialRules.festivalId, other),
              eq(festivalCredentialRules.group, "staff"),
            ),
          ),
      ).toEqual([{ quantity: 3 }]);
    });
  });
  describe("external participants", () => {
    async function externalOn(festivalId: number, standCount: number) {
      const { reservationId } = await createReservation(festivalId, { standCount });
      const [external] = await integrationDb!
        .insert(schema.externalParticipants)
        .values({ displayName: `Externo ${randomUUID()}`, type: "sponsor" })
        .returning({ id: schema.externalParticipants.id });
      created.externals.push(external!.id);
      await integrationDb!
        .insert(schema.reservationExternalParticipants)
        .values({ reservationId, externalParticipantId: external!.id });
      return external!.id;
    }

    it("stores an override with the stands it was saved for, and clears it", async () => {
      const festivalId = await createFestival();
      const externalParticipantId = await externalOn(festivalId, 2);
      expect(
        await actions.setExternalCredentialQuantity({ festivalId, externalParticipantId, quantity: 3 }),
      ).toEqual({ success: true, message: "Cantidad guardada: 3." });
      const overrides = () =>
        integrationDb!
          .select({
            quantity: schema.festivalExternalCredentialOverrides.quantity,
            standsAtOverride: schema.festivalExternalCredentialOverrides.standsAtOverride,
          })
          .from(schema.festivalExternalCredentialOverrides)
          .where(eq(schema.festivalExternalCredentialOverrides.festivalId, festivalId));
      expect(await overrides()).toEqual([{ quantity: 3, standsAtOverride: 2 }]);

      await actions.setExternalCredentialQuantity({ festivalId, externalParticipantId, quantity: 5 });
      expect(await overrides()).toEqual([{ quantity: 5, standsAtOverride: 2 }]);

      await actions.setExternalCredentialQuantity({ festivalId, externalParticipantId, quantity: null });
      expect(await overrides()).toEqual([]);
    });

    it("refuses an external participant without a counted reservation here", async () => {
      const festivalId = await createFestival();
      const other = await createFestival();
      const externalParticipantId = await externalOn(other, 1);
      expect(
        await actions.setExternalCredentialQuantity({ festivalId, externalParticipantId, quantity: 3 }),
      ).toEqual({
        success: false,
        message:
          "Ese participante externo no tiene una reserva que se cuente en este festival. Actualizá la página.",
      });
    });
  });

  describe("the Glitter team and one-off credentials", () => {
    async function staffRow(name: string) {
      const [row] = await integrationDb!
        .select()
        .from(schema.staffMembers)
        .where(eq(schema.staffMembers.fullName, name));
      if (row) created.staff.push(row.id);
      return row!;
    }
    const selection = (festivalId: number) =>
      integrationDb!
        .select({ staffMemberId: schema.festivalStaffMembers.staffMemberId })
        .from(schema.festivalStaffMembers)
        .where(eq(schema.festivalStaffMembers.festivalId, festivalId));

    it("adds to the roster ticked for the festival, edits, archives and restores", async () => {
      const festivalId = await createFestival();
      const name = `Daniela ${randomUUID()}`;
      expect(
        (await actions.createStaffMember({ festivalId, fullName: name, roleLabel: "Dirección" })).success,
      ).toBe(true);
      const member = await staffRow(name);
      expect(await selection(festivalId)).toEqual([{ staffMemberId: member.id }]);

      await actions.updateStaffMember({
        festivalId,
        staffMemberId: member.id,
        fullName: `${name} Arce`,
        roleLabel: "Producción",
      });
      const renamed = await staffRow(`${name} Arce`);
      expect(renamed.roleLabel).toBe("Producción");

      await actions.archiveStaffMember({ festivalId, staffMemberId: member.id });
      expect((await staffRow(`${name} Arce`)).isActive).toBe(false);
      // Archiving keeps them where they are already selected.
      expect(await selection(festivalId)).toEqual([{ staffMemberId: member.id }]);

      // Ticking an archived member elsewhere is refused; unticking always works.
      const other = await createFestival();
      expect(
        await actions.setFestivalStaffMember({ festivalId: other, staffMemberId: member.id, selected: true }),
      ).toEqual({
        success: false,
        message: "Esa persona está archivada. Restaurala antes de sumarla a esta edición.",
      });
      expect(
        (await actions.setFestivalStaffMember({ festivalId, staffMemberId: member.id, selected: false }))
          .success,
      ).toBe(true);
      expect(await selection(festivalId)).toEqual([]);

      await actions.restoreStaffMember({ festivalId, staffMemberId: member.id });
      expect(
        (await actions.setFestivalStaffMember({ festivalId: other, staffMemberId: member.id, selected: true }))
          .success,
      ).toBe(true);
      expect(await selection(other)).toEqual([{ staffMemberId: member.id }]);
    });

    it("keeps a one-off entry's id and name, and its festival", async () => {
      const festivalId = await createFestival();
      await actions.addExtraCredential({
        festivalId,
        extra: { kind: "unnamed", label: "Prensa", quantity: 6 },
      });
      await actions.addExtraCredential({
        festivalId,
        extra: { kind: "named", name: "Marcelo Peredo", label: "Fotografía" },
      });
      const extras = await integrationDb!
        .select()
        .from(schema.festivalExtraCredentials)
        .where(eq(schema.festivalExtraCredentials.festivalId, festivalId))
        .orderBy(schema.festivalExtraCredentials.id);
      const [press, photo] = extras;
      expect(
        (await actions.updateExtraCredential({
          festivalId,
          extraCredentialId: press!.id,
          label: "Prensa",
          quantity: 8,
        })).success,
      ).toBe(true);
      expect(
        await actions.updateExtraCredential({
          festivalId,
          extraCredentialId: photo!.id,
          label: "Foto",
          quantity: 2,
        }),
      ).toEqual({ success: false, message: "Una credencial con nombre es siempre una." });
      const other = await createFestival();
      expect(
        await actions.removeExtraCredential({ festivalId: other, extraCredentialId: press!.id }),
      ).toEqual({ success: false, message: "No encontramos esa credencial. Actualizá la página." });

      const [after] = await integrationDb!
        .select()
        .from(schema.festivalExtraCredentials)
        .where(eq(schema.festivalExtraCredentials.id, press!.id));
      expect(after).toMatchObject({ id: press!.id, quantity: 8 });
      expect((await actions.removeExtraCredential({ festivalId, extraCredentialId: press!.id })).success).toBe(
        true,
      );
    });
  });
  describe("print batches", () => {
    const BATCH_CHANGED =
      "El lote cambió desde que lo abriste (cantidades o nombres). Actualizá la página y revisalo antes de marcarlo.";
    const items = (festivalId: number) =>
      integrationDb!
        .select({
          unitKey: schema.credentialPrintBatchItems.unitKey,
          namedCount: schema.credentialPrintBatchItems.namedCount,
          unnamedCount: schema.credentialPrintBatchItems.unnamedCount,
          isReprint: schema.credentialPrintBatchItems.isReprint,
          printedName: schema.credentialPrintBatchItems.printedName,
        })
        .from(schema.credentialPrintBatchItems)
        .where(eq(schema.credentialPrintBatchItems.festivalId, festivalId))
        .orderBy(schema.credentialPrintBatchItems.id);

    /** What the dialog sends for these holders: their counts as the page shows them now. */
    const shown = async (festivalId: number, keys: string[]) => {
      const data = await queries.fetchCredentialsData(integrationDb! as never, festivalId);
      const holders = data
        ? applyPrintState(buildHolders(data, resolveRules(data.ruleRows)).holders, data.batches)
        : [];
      return keys.map((key) => {
        const holder = holders.find((entry) => entry.key === key && !entry.stale);
        return {
          key,
          name: holder?.name ?? "",
          ...(holder ? batchCountsFor(holder) : { named: 1, unnamed: 0, reprint: false }),
        };
      });
    };
    const send = async (festivalId: number, keys: string[], note?: string) =>
      actions.createCredentialPrintBatch({ festivalId, holders: await shown(festivalId, keys), note });

    it("recomputes the counts on the server and writes deltas for short units", async () => {
      const festivalId = await createFestival();
      const user = await createUser("Diego Quispe");
      const { reservationId, participationIds } = await createReservation(festivalId, {
        userIds: [user],
      });
      const key = `participant:${participationIds[0]}`;
      expect(
        await send(festivalId, [key], "Imprenta Sol"),
      ).toEqual({ success: true, message: "Marcaste 2 credenciales como enviadas a imprenta." });
      expect(await items(festivalId)).toEqual([
        { unitKey: key, namedCount: 1, unnamedCount: 0, isReprint: false, printedName: "Diego Quispe" },
        {
          unitKey: `reservation:${reservationId}`,
          namedCount: 0,
          unnamedCount: 1,
          isReprint: false,
          printedName: null,
        },
      ]);
      const [stored] = await integrationDb!
        .select({ note: schema.credentialPrintBatches.note, rules: schema.credentialPrintBatches.rules })
        .from(schema.credentialPrintBatches)
        .where(eq(schema.credentialPrintBatches.festivalId, festivalId));
      expect(stored!.note).toBe("Imprenta Sol");
      expect(stored!.rules).toMatchObject({ illustration: { quantity: 2 } });

      // A second stand: only the 2 missing unnamed ones go out.
      const [stand] = await integrationDb!
        .insert(stands)
        .values({ festivalId, label: "B", standNumber: standNumber++, standCategory: "illustration" })
        .returning({ id: stands.id });
      await integrationDb!
        .insert(standReservationStands)
        .values({ reservationId, standId: stand!.id, position: 1 });
      expect((await send(festivalId, [key])).message).toBe(
        "Marcaste 2 credenciales como enviadas a imprenta.",
      );
      expect((await items(festivalId)).slice(2)).toEqual([
        {
          unitKey: `reservation:${reservationId}`,
          namedCount: 0,
          unnamedCount: 2,
          isReprint: false,
          printedName: null,
        },
      ]);

      // Fully printed now: adding them again is a reprint of everything.
      await send(festivalId, [key]);
      expect((await items(festivalId)).slice(3).map((item) => [item.namedCount, item.unnamedCount, item.isReprint])).toEqual([
        [1, 0, true],
        [0, 3, true],
      ]);
    });

    it("refuses unknown holders and holders without credentials", async () => {
      const festivalId = await createFestival();
      const titular = await createUser("Titular");
      const partner = await createUser("Socia");
      const { participationIds } = await createReservation(festivalId, { userIds: [titular, partner] });
      await actions.saveCredentialRules({
        festivalId,
        rules: { ...DEFAULT_FORM, illustration: { quantity: 1, namingMode: "one_per_participant" } },
      });
      const refusal = {
        success: false,
        message: "Alguien del lote ya no tiene credencial en este festival. Actualizá la página.",
      };
      expect(
        await send(festivalId, ["participant:2000000000"]),
      ).toEqual(refusal);
      // The partner is left without a credential by the rule.
      expect(
        await send(festivalId, [`participant:${participationIds[1]}`]),
      ).toEqual(refusal);
      // Another festival's holder is not a holder here.
      const other = await createFestival();
      expect(
        await actions.createCredentialPrintBatch({
          festivalId: other,
          holders: await shown(festivalId, [`participant:${participationIds[0]}`]),
        }),
      ).toEqual(refusal);
      expect(await items(festivalId)).toEqual([]);
    });

    it("records one batch and refuses the other when two admins create at once", async () => {
      const festivalId = await createFestival();
      const user = await createUser("Concurrente");
      const { participationIds } = await createReservation(festivalId, { userIds: [user] });
      const key = `participant:${participationIds[0]}`;
      const holders = await shown(festivalId, [key]);
      const results = await Promise.all([
        actions.createCredentialPrintBatch({ festivalId, holders }),
        actions.createCredentialPrintBatch({ festivalId, holders }),
      ]);
      expect(results.filter((result) => result.success)).toHaveLength(1);
      expect(results.find((result) => !result.success)).toEqual({ success: false, message: BATCH_CHANGED });
      const rows = (await items(festivalId)).filter((item) => item.unitKey === key);
      expect(rows).toEqual([expect.objectContaining({ namedCount: 1, isReprint: false })]);
    });

    it("refuses a batch whose counts changed after the dialog showed them", async () => {
      const festivalId = await createFestival();
      const user = await createUser("Pantalla vieja");
      const { reservationId, participationIds } = await createReservation(festivalId, {
        userIds: [user],
      });
      const key = `participant:${participationIds[0]}`;
      const before = await shown(festivalId, [key]);
      // A second stand arrives while the dialog is open: 2 credentials became 4.
      const [stand] = await integrationDb!
        .insert(stands)
        .values({ festivalId, label: "B", standNumber: standNumber++, standCategory: "illustration" })
        .returning({ id: stands.id });
      await integrationDb!
        .insert(standReservationStands)
        .values({ reservationId, standId: stand!.id, position: 1 });
      expect(await actions.createCredentialPrintBatch({ festivalId, holders: before })).toEqual({
        success: false,
        message: BATCH_CHANGED,
      });
      expect(await items(festivalId)).toEqual([]);

      // Once printed, the same counts are a reprint, and only a reprint shown as one is recorded.
      expect((await send(festivalId, [key])).success).toBe(true);
      const again = await shown(festivalId, [key]);
      expect(again[0]!.reprint).toBe(true);
      expect(
        await actions.createCredentialPrintBatch({
          festivalId,
          holders: again.map((holder) => ({ ...holder, reprint: false })),
        }),
      ).toEqual({ success: false, message: BATCH_CHANGED });
      expect((await actions.createCredentialPrintBatch({ festivalId, holders: again })).success).toBe(true);
    });

    it("refuses a batch whose holder was renamed after the dialog showed it", async () => {
      const festivalId = await createFestival();
      const user = await createUser("Nombre viejo");
      const { participationIds } = await createReservation(festivalId, { userIds: [user] });
      const key = `participant:${participationIds[0]}`;
      const before = await shown(festivalId, [key]);
      expect(before[0]!.name).toBe("Nombre viejo");
      await integrationDb!
        .update(users)
        .set({ displayName: "Nombre nuevo" })
        .where(eq(users.id, user));
      expect(await actions.createCredentialPrintBatch({ festivalId, holders: before })).toEqual({
        success: false,
        message: BATCH_CHANGED,
      });
      expect(await items(festivalId)).toEqual([]);
      expect((await send(festivalId, [key])).success).toBe(true);
      expect((await items(festivalId))[0]).toMatchObject({ printedName: "Nombre nuevo" });
    });

    it("never lets an item point at another festival's batch", async () => {
      const mine = await createFestival();
      const other = await createFestival();
      const [theirs] = await integrationDb!
        .insert(schema.credentialPrintBatches)
        .values({ festivalId: other, rules: {} })
        .returning({ id: schema.credentialPrintBatches.id });
      await expect(
        integrationDb!.insert(schema.credentialPrintBatchItems).values({
          batchId: theirs!.id,
          festivalId: mine,
          unitKey: "staff:1",
          group: "staff",
          namedCount: 1,
          unnamedCount: 0,
        }),
      ).rejects.toThrow();
    });

    it("undoes only the latest batch, and only for admins", async () => {
      const festivalId = await createFestival();
      const user = await createUser("Deshacer");
      const { participationIds } = await createReservation(festivalId, { userIds: [user] });
      const key = `participant:${participationIds[0]}`;
      await send(festivalId, [key]);
      await send(festivalId, [key]);
      const batches = await integrationDb!
        .select({ id: schema.credentialPrintBatches.id })
        .from(schema.credentialPrintBatches)
        .where(eq(schema.credentialPrintBatches.festivalId, festivalId))
        .orderBy(schema.credentialPrintBatches.id);
      const [first, latest] = batches;

      expect(await actions.deleteCredentialPrintBatch({ festivalId, batchId: latest!.id })).toEqual({
        success: false,
        message: "Solo un administrador puede hacer esto.",
      });
      currentProfile.value = { id: await createUser("Admin", "admin"), role: "admin" };
      expect(await actions.deleteCredentialPrintBatch({ festivalId, batchId: first!.id })).toEqual({
        success: false,
        message: "Solo se puede deshacer el último lote enviado a imprenta.",
      });
      expect((await actions.deleteCredentialPrintBatch({ festivalId, batchId: latest!.id })).success).toBe(
        true,
      );
      // Its items went with it; the first batch stays.
      expect(await items(festivalId)).toHaveLength(2);
    });
  });
});
