// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray, sql } from "drizzle-orm";
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

import {
  type DistributionListFilterInput,
  DistributionListFilterV1,
} from "@/app/lib/distribution_lists/definitions";
import * as schema from "@/db/schema";
import {
  distributionListMembers,
  distributionLists,
  festivals,
  pendingUserDeletions,
  profileSubcategories,
  reservationParticipants,
  standReservations,
  stands,
  subcategories,
  users,
} from "@/db/schema";

/**
 * Distribution lists against a real database (docs/IMPLEMENTATION-comunicados.md
 * B2, B3, B9, G8). Every assertion is about this file's own fixtures, never a
 * total over the shared database.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Viewer = { id: number; role: "admin" | "festival_admin" | "user" };
const state = vi.hoisted(() => ({
  viewer: null as Viewer | null,
  flagOn: true,
  vercelEnv: "production",
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => state.viewer,
  requireAdmin: async () =>
    state.viewer?.role === "admin" ? state.viewer : null,
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  // Only `comunicados` is switchable: a guard on the wrong flag refuses even
  // with it on, so every admin test below would fail.
  isFeatureEnabled: async (key: string) =>
    key === "comunicados" && state.flagOn,
  isFeatureLaunched: async (key: string) => key === "credits",
  featureFlagGuard: async (key: string) =>
    key === "comunicados" && state.flagOn
      ? null
      : { success: false, message: "Esta funcionalidad no está disponible" },
}));
vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return {
    ...actual,
    serverEnv: new Proxy(actual.serverEnv, {
      get: (target, key) =>
        key === "VERCEL_ENV" ? state.vercelEnv : Reflect.get(target, key),
    }),
  };
});

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

const pool = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl, max: 4 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Actions = typeof import("@/app/lib/distribution_lists/actions");
type Queries = typeof import("@/app/lib/distribution_lists/queries");
type Resolve = typeof import("@/app/lib/distribution_lists/resolve");
type GiftActions = typeof import("@/app/lib/credit_gifts/actions");
type GiftService = typeof import("@/app/lib/credit_gifts/service");
type AppDb = (typeof import("@/db"))["db"];
let actions: Actions;
let queries: Queries;
let resolve: Resolve;
let giftActions: GiftActions;
let giftService: GiftService;
let appDb: AppDb;

const created = {
  users: [] as number[],
  festivals: [] as number[],
  stands: [] as number[],
  reservations: [] as number[],
  subcategories: [] as number[],
  lists: [] as number[],
  deletions: [] as number[],
};

type UserFixture = Partial<typeof users.$inferInsert> & { name?: string };

async function createUser(fixture: UserFixture = {}) {
  const suffix = randomUUID();
  const { name, ...values } = fixture;
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `lists-${suffix}`,
      email: `lists-${suffix}@example.com`,
      displayName: name ?? `Lista ${suffix.slice(0, 8)}`,
      role: "user",
      status: "verified",
      ...values,
    })
    .returning({ id: users.id });
  created.users.push(user!.id);
  return user!.id;
}

async function createFestival(
  values: Partial<typeof festivals.$inferInsert> = {},
) {
  const [festival] = await integrationDb!
    .insert(festivals)
    .values({ name: `Listas ${randomUUID()}`, ...values })
    .returning({ id: festivals.id, name: festivals.name });
  created.festivals.push(festival!.id);
  return festival!;
}

let standNumber = 7000;

/** A reservation at `festivalId`, with its owner and partners as participations. */
async function reserve(
  festivalId: number,
  {
    status = "accepted",
    owner,
    partners = [],
    ownerParticipates = true,
    revealAt = null,
  }: {
    status?: (typeof standReservations.$inferInsert)["status"];
    owner: number | null;
    partners?: number[];
    ownerParticipates?: boolean;
    revealAt?: Date | null;
  },
) {
  const [stand] = await integrationDb!
    .insert(stands)
    .values({ standNumber: standNumber++, festivalId })
    .returning({ id: stands.id });
  created.stands.push(stand!.id);
  const [reservation] = await integrationDb!
    .insert(standReservations)
    .values({
      standId: stand!.id,
      festivalId,
      status,
      ownerUserId: owner,
      revealAt,
    })
    .returning({ id: standReservations.id });
  created.reservations.push(reservation!.id);
  const holders = [
    ...(owner !== null && ownerParticipates ? [owner] : []),
    ...partners,
  ];
  if (holders.length > 0) {
    await integrationDb!
      .insert(reservationParticipants)
      .values(
        holders.map((userId) => ({ userId, reservationId: reservation!.id })),
      );
  }
  return reservation!.id;
}

async function createSubcategory() {
  const [row] = await integrationDb!
    .insert(subcategories)
    .values({ label: `Listas ${randomUUID()}`, category: "illustration" })
    .returning({ id: subcategories.id });
  created.subcategories.push(row!.id);
  return row!.id;
}

async function tag(userIds: number[], subcategoryId: number) {
  await integrationDb!
    .insert(profileSubcategories)
    .values(userIds.map((profileId) => ({ profileId, subcategoryId })));
}

async function membersOf(
  sqlFragment: ReturnType<Resolve["filterMemberIdsSql"]>,
) {
  return (await resolve.classifyMembers(appDb, sqlFragment)).map(
    (member) => member.userId,
  );
}

async function signInAs(role: Viewer["role"]) {
  state.viewer = { id: await createUser({ role }), role };
  return state.viewer;
}

describeDatabase("distribution lists", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    actions = await import("@/app/lib/distribution_lists/actions");
    queries = await import("@/app/lib/distribution_lists/queries");
    resolve = await import("@/app/lib/distribution_lists/resolve");
    giftActions = await import("@/app/lib/credit_gifts/actions");
    giftService = await import("@/app/lib/credit_gifts/service");
    appDb = (await import("@/db")).db;

    try {
      await integrationDb!
        .select({ id: distributionLists.id })
        .from(distributionLists)
        .limit(1);
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  afterEach(() => {
    state.viewer = null;
    state.flagOn = true;
    state.vercelEnv = "production";
  });

  afterAll(async () => {
    const db = integrationDb;
    if (db) {
      if (created.lists.length > 0) {
        await db
          .delete(distributionLists)
          .where(inArray(distributionLists.id, created.lists));
      }
      if (created.deletions.length > 0) {
        await db
          .delete(pendingUserDeletions)
          .where(inArray(pendingUserDeletions.id, created.deletions));
      }
      if (created.reservations.length > 0) {
        await db
          .delete(standReservations)
          .where(inArray(standReservations.id, created.reservations));
      }
      if (created.stands.length > 0) {
        await db.delete(stands).where(inArray(stands.id, created.stands));
      }
      if (created.subcategories.length > 0) {
        await db
          .delete(subcategories)
          .where(inArray(subcategories.id, created.subcategories));
      }
      if (created.users.length > 0) {
        await db.delete(users).where(inArray(users.id, created.users));
      }
      if (created.festivals.length > 0) {
        await db
          .delete(festivals)
          .where(inArray(festivals.id, created.festivals));
      }
    }
    await pool?.end();
  });

  describe("Confirmados · <festival>", () => {
    it("holds owners and partners of accepted reservations only, once each", async () => {
      const festival = await createFestival();
      const owner = await createUser();
      const partner = await createUser();
      const twice = await createUser();
      const legacyOwner = await createUser();
      const pending = await createUser();
      const verifying = await createUser();
      const released = await createUser();
      const rejected = await createUser();

      await reserve(festival.id, { owner, partners: [partner, twice] });
      await reserve(festival.id, { owner: twice });
      // Legacy: the owner has no participations row.
      await reserve(festival.id, {
        owner: legacyOwner,
        ownerParticipates: false,
      });
      await reserve(festival.id, { status: "pending", owner: pending });
      await reserve(festival.id, {
        status: "verification_payment",
        owner: verifying,
      });
      await reserve(festival.id, { status: "released", owner: released });
      await reserve(festival.id, { status: "rejected", owner: rejected });

      const members = await membersOf(
        resolve.confirmadosMemberIdsSql([festival.id]),
      );
      expect(members.sort((a, b) => a - b)).toEqual(
        [owner, partner, twice, legacyOwner].sort((a, b) => a - b),
      );

      state.viewer = { id: await createUser({ role: "admin" }), role: "admin" };
      const page = await queries.fetchConfirmadosMembers(festival.id, 1);
      expect(page.total).toBe(4);
      const byId = new Map(page.rows.map((row) => [row.userId, row]));
      expect(byId.get(owner)).toMatchObject({
        isOwner: true,
        isPartner: false,
      });
      expect(byId.get(partner)).toMatchObject({
        isOwner: false,
        isPartner: true,
      });
      // Partner on one reservation, owner of another.
      expect(byId.get(twice)).toMatchObject({ isOwner: true, isPartner: true });
      expect(byId.get(legacyOwner)).toMatchObject({ isOwner: true });
    });

    it("includes past festivals and reservations not revealed yet", async () => {
      const past = await createFestival({
        status: "archived",
        startDate: new Date("2023-12-01T15:00:00Z"),
        endDate: new Date("2023-12-02T23:00:00Z"),
      });
      const veteran = await createUser();
      const hidden = await createUser();
      await reserve(past.id, { owner: veteran });
      await reserve(past.id, {
        owner: hidden,
        revealAt: new Date(Date.now() + 7 * 24 * 3600_000),
      });

      expect(
        (await membersOf(resolve.confirmadosMemberIdsSql([past.id]))).sort(
          (a, b) => a - b,
        ),
      ).toEqual([veteran, hidden].sort((a, b) => a - b));
    });

    it("keeps members who cannot receive it, with their reason, and counts them apart", async () => {
      const festival = await createFestival();
      const ok = await createUser({ name: "Ana Puede" });
      const paused = await createUser({ status: "paused" });
      const banned = await createUser({
        status: "banned",
        name: "Beto Suspendido",
      });
      const pendingProfile = await createUser({ status: "pending" });
      const adminOwner = await createUser({ role: "admin" });
      const deleting = await createUser();
      const [deletion] = await integrationDb!
        .insert(pendingUserDeletions)
        .values({ userId: deleting, clerkId: `lists-del-${randomUUID()}` })
        .returning({ id: pendingUserDeletions.id });
      created.deletions.push(deletion!.id);

      await reserve(festival.id, { owner: ok, partners: [paused] });
      await reserve(festival.id, { owner: banned, partners: [pendingProfile] });
      await reserve(festival.id, { owner: adminOwner, partners: [deleting] });

      expect(
        await resolve.countAudience(
          appDb,
          resolve.confirmadosMemberIdsSql([festival.id]),
        ),
      ).toEqual({ eligible: 2, skipped: 4 });

      await signInAs("admin");
      const page = await queries.fetchConfirmadosMembers(festival.id, 1);
      const reasons = new Map(
        page.rows.map((row) => [row.userId, row.skipReason]),
      );
      expect(reasons.get(ok)).toBeNull();
      expect(reasons.get(paused)).toBeNull();
      expect(reasons.get(banned)).toBe("Cuenta suspendida");
      expect(reasons.get(pendingProfile)).toBe("Perfil no verificado");
      expect(reasons.get(adminOwner)).toBe("No es participante");
      expect(reasons.get(deleting)).toBe("Cuenta en eliminación");

      // The lists page shows the same numbers as the resolver.
      const row = (await queries.fetchFestivalLists()).find(
        (festivalRow) => festivalRow.festivalId === festival.id,
      );
      expect(row?.count).toEqual({ eligible: 2, skipped: 4 });
      expect(
        (await queries.fetchConfirmadosFestival(festival.id))?.count,
      ).toEqual({ eligible: 2, skipped: 4 });
    });

    it("lists a festival without accepted reservations at zero", async () => {
      const festival = await createFestival();
      await reserve(festival.id, {
        status: "pending",
        owner: await createUser(),
      });
      await signInAs("admin");
      const row = (await queries.fetchFestivalLists()).find(
        (festivalRow) => festivalRow.festivalId === festival.id,
      );
      expect(row?.count).toEqual({ eligible: 0, skipped: 0 });
    });
  });

  describe("saved filter lists", () => {
    it("ANDs attributes and ORs the values within one", async () => {
      const sub = await createSubcategory();
      const otherSub = await createSubcategory();
      const laPazIllustrator = await createUser({
        category: "illustration",
        state: "La Paz",
      });
      const laPazNewArtist = await createUser({
        category: "new_artist",
        state: "La Paz",
      });
      const oruroCook = await createUser({
        category: "gastronomy",
        state: "Oruro",
      });
      const cbbaCook = await createUser({
        category: "gastronomy",
        state: "Cochabamba",
      });
      const otherSubOnly = await createUser({
        category: "illustration",
        state: "La Paz",
      });
      await tag([laPazIllustrator, laPazNewArtist, oruroCook, cbbaCook], sub);
      await tag([otherSubOnly], otherSub);

      const filter = (value: Partial<DistributionListFilterInput>) =>
        resolve.filterMemberIdsSql(
          DistributionListFilterV1.parse({ v: 1, ...value }),
        );
      const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);

      // One subcategory: everyone tagged with it.
      expect(
        sorted(await membersOf(filter({ subcategoryIds: [sub] }))),
      ).toEqual(
        sorted([laPazIllustrator, laPazNewArtist, oruroCook, cbbaCook]),
      );
      // Either subcategory.
      expect(
        sorted(await membersOf(filter({ subcategoryIds: [sub, otherSub] }))),
      ).toEqual(
        sorted([
          laPazIllustrator,
          laPazNewArtist,
          oruroCook,
          cbbaCook,
          otherSubOnly,
        ]),
      );
      // AND an area; illustration also matches new_artist.
      expect(
        sorted(
          await membersOf(
            filter({ subcategoryIds: [sub], areas: ["illustration"] }),
          ),
        ),
      ).toEqual(sorted([laPazIllustrator, laPazNewArtist]));
      // AND either of two departamentos.
      expect(
        sorted(
          await membersOf(
            filter({ subcategoryIds: [sub], states: ["Oruro", "Cochabamba"] }),
          ),
        ),
      ).toEqual(sorted([oruroCook, cbbaCook]));
      // Area AND departamento.
      expect(
        await membersOf(
          filter({
            subcategoryIds: [sub],
            areas: ["gastronomy"],
            states: ["Oruro"],
          }),
        ),
      ).toEqual([oruroCook]);
    });

    it("selects by festivals confirmed at, and not at", async () => {
      const sub = await createSubcategory();
      const a = await createFestival();
      const b = await createFestival();
      const atA = await createUser();
      const atB = await createUser();
      const atBoth = await createUser();
      const pendingAtA = await createUser();
      const neither = await createUser();
      await tag([atA, atB, atBoth, pendingAtA, neither], sub);
      await reserve(a.id, { owner: atA });
      await reserve(b.id, { owner: null, partners: [atB] });
      await reserve(a.id, { owner: atBoth });
      await reserve(b.id, { owner: atBoth });
      await reserve(a.id, { status: "pending", owner: pendingAtA });
      // A legacy owner, with no participations row: on Confirmados · B, so
      // the filter must count them as confirmed there too.
      const legacyAtB = await createUser();
      await tag([legacyAtB], sub);
      await reserve(b.id, { owner: legacyAtB, ownerParticipates: false });

      const base = {
        v: 1 as const,
        areas: [],
        states: [],
        includePaused: true,
        subcategoryIds: [sub],
      };
      const sorted = (ids: number[]) => [...ids].sort((x, y) => x - y);
      expect(
        sorted(
          await membersOf(
            resolve.filterMemberIdsSql({
              ...base,
              confirmedAtFestivalIds: [a.id, b.id],
              notConfirmedAtFestivalIds: [],
            }),
          ),
        ),
      ).toEqual(sorted([atA, atB, atBoth, legacyAtB]));
      expect(
        sorted(
          await membersOf(
            resolve.filterMemberIdsSql({
              ...base,
              confirmedAtFestivalIds: [a.id],
              notConfirmedAtFestivalIds: [b.id],
            }),
          ),
        ),
      ).toEqual([atA]);
      expect(
        sorted(
          await membersOf(
            resolve.filterMemberIdsSql({
              ...base,
              confirmedAtFestivalIds: [],
              notConfirmedAtFestivalIds: [a.id],
            }),
          ),
        ),
      ).toEqual(sorted([atB, pendingAtA, neither, legacyAtB]));
      expect(
        await membersOf(
          resolve.filterMemberIdsSql({
            ...base,
            confirmedAtFestivalIds: [],
            notConfirmedAtFestivalIds: [b.id],
          }),
        ),
      ).not.toContain(legacyAtB);
    });

    it("holds participants only, verified or (when asked) paused", async () => {
      const sub = await createSubcategory();
      const verified = await createUser();
      const paused = await createUser({ status: "paused" });
      const pending = await createUser({ status: "pending" });
      const banned = await createUser({ status: "banned" });
      const admin = await createUser({ role: "admin" });
      const festivalAdmin = await createUser({ role: "festival_admin" });
      const artist = await createUser({ role: "artist" });
      await tag(
        [verified, paused, pending, banned, admin, festivalAdmin, artist],
        sub,
      );

      const base = {
        v: 1 as const,
        areas: [],
        states: [],
        subcategoryIds: [sub],
        confirmedAtFestivalIds: [],
        notConfirmedAtFestivalIds: [],
      };
      const sorted = (ids: number[]) => [...ids].sort((x, y) => x - y);
      expect(
        sorted(
          await membersOf(
            resolve.filterMemberIdsSql({ ...base, includePaused: true }),
          ),
        ),
      ).toEqual(sorted([verified, paused]));
      expect(
        await membersOf(
          resolve.filterMemberIdsSql({ ...base, includePaused: false }),
        ),
      ).toEqual([verified]);
    });

    it("counts on the lists page as the resolver does, and refuses a filter that no longer parses", async () => {
      const admin = await signInAs("admin");
      const sub = await createSubcategory();
      const one = await createUser();
      const two = await createUser({ status: "paused" });
      const deleting = await createUser();
      await tag([one, two, deleting], sub);
      const [deletion] = await integrationDb!
        .insert(pendingUserDeletions)
        .values({ userId: deleting, clerkId: `lists-del-${randomUUID()}` })
        .returning({ id: pendingUserDeletions.id });
      created.deletions.push(deletion!.id);

      const result = await actions.createDistributionListAction({
        kind: "filter",
        name: `Filtro ${randomUUID().slice(0, 8)}`,
        filter: { v: 1, subcategoryIds: [sub] },
      });
      expect(result).toMatchObject({ success: true });
      const listId = (result as { listId: number }).listId;
      created.lists.push(listId);

      const [stored] = await integrationDb!
        .select()
        .from(distributionLists)
        .where(eq(distributionLists.id, listId));
      expect(stored).toMatchObject({
        kind: "filter",
        createdByUserId: admin.id,
        filter: expect.objectContaining({ v: 1, subcategoryIds: [sub] }),
      });

      const summary = (await queries.fetchSavedLists()).find(
        (list) => list.id === listId,
      );
      expect(summary?.count).toEqual({ eligible: 2, skipped: 1 });
      expect(
        await resolve.countAudience(
          appDb,
          resolve.listMemberIdsSql({ ...stored!, filter: stored!.filter }),
        ),
      ).toEqual({ eligible: 2, skipped: 1 });

      const preview = await actions.previewDistributionListFilterAction({
        v: 1,
        subcategoryIds: [sub],
      });
      expect(preview).toMatchObject({
        success: true,
        count: { eligible: 2, skipped: 1 },
      });
      expect(
        (preview as { names: { userId: number }[] }).names
          .map((n) => n.userId)
          .sort(),
      ).toEqual([one, two].sort());

      // A filter written by a later version (or by hand) is never "everyone".
      await integrationDb!
        .update(distributionLists)
        .set({ filter: { v: 1, subcategoryIds: [sub], gender: "female" } })
        .where(eq(distributionLists.id, listId));
      expect(
        (await queries.fetchSavedLists()).find((list) => list.id === listId)
          ?.count,
      ).toBeNull();
      expect(() =>
        resolve.listMemberIdsSql({
          id: listId,
          name: "Rota",
          kind: "filter",
          filter: { v: 1, gender: "female" },
        }),
      ).toThrow(
        "La lista «Rota» tiene un filtro que ya no se puede leer; editala.",
      );
      expect(
        await queries.resolveListSourceMembers({ kind: "list", listId }),
      ).toMatchObject({
        ok: false,
        message: expect.stringContaining("ya no se puede leer"),
      });
    });
  });

  describe("saved fixed lists", () => {
    it("adds participants only, up to the cap, and drops a deleted user", async () => {
      await signInAs("admin");
      const ana = await createUser();
      const beto = await createUser({ status: "banned" });
      const admin = await createUser({ role: "admin" });

      const result = await actions.createDistributionListAction({
        kind: "fixed",
        name: `Fija ${randomUUID().slice(0, 8)}`,
        memberIds: [ana, admin],
      });
      expect(result).toMatchObject({ success: true });
      const listId = (result as { listId: number }).listId;
      created.lists.push(listId);

      const added = await actions.addDistributionListMembersAction({
        listId,
        userIds: [ana, beto],
      });
      expect(added).toMatchObject({
        success: true,
        added: 1,
        message: "Agregamos 1 persona · 1 ya estaba.",
      });

      const page = await queries.fetchFixedListMembers(listId, 1);
      expect(page.rows.map((row) => row.userId).sort()).toEqual(
        [ana, beto].sort(),
      );
      expect(page.rows.find((row) => row.userId === beto)?.skipReason).toBe(
        "Cuenta suspendida",
      );
      expect(
        (await queries.fetchSavedLists()).find((list) => list.id === listId)
          ?.count,
      ).toEqual({ eligible: 1, skipped: 1 });

      // A filter list cannot take members, and a fixed one cannot take a filter.
      expect(
        await actions.updateDistributionListAction({
          listId,
          name: "Fija renombrada",
          filter: { v: 1 },
        }),
      ).toMatchObject({ success: false });

      // Deleting the user removes the membership.
      await integrationDb!.delete(users).where(eq(users.id, ana));
      created.users.splice(created.users.indexOf(ana), 1);
      const remaining = await integrationDb!
        .select({ userId: distributionListMembers.userId })
        .from(distributionListMembers)
        .where(eq(distributionListMembers.listId, listId));
      expect(remaining.map((row) => row.userId)).toEqual([beto]);
    });

    it("keeps a description an update leaves out, and pages past the end show the last page", async () => {
      await signInAs("admin");
      const name = `Descripta ${randomUUID().slice(0, 8)}`;
      const result = await actions.createDistributionListAction({
        kind: "fixed",
        name,
        description: "Para el armado",
      });
      const listId = (result as { listId: number }).listId;
      created.lists.push(listId);

      expect(
        await actions.updateDistributionListAction({ listId, name }),
      ).toMatchObject({ success: true });
      expect((await queries.fetchDistributionList(listId))?.description).toBe(
        "Para el armado",
      );
      await actions.updateDistributionListAction({
        listId,
        name,
        description: "  ",
      });
      expect(
        (await queries.fetchDistributionList(listId))?.description,
      ).toBeNull();

      const { rows } = await pool!.query<{ id: number }>(
        `INSERT INTO users (clerk_id, email, display_name, role, status)
         SELECT 'lists-page-' || $1 || '-' || g, 'lists-page-' || $1 || '-' || g || '@example.com',
                'Página ' || g, 'user', 'verified'
         FROM generate_series(1, 51) g
         RETURNING id`,
        [randomUUID()],
      );
      created.users.push(...rows.map((row) => row.id));
      await pool!.query(
        `INSERT INTO distribution_list_members (list_id, user_id)
         SELECT $1, unnest($2::int[])`,
        [listId, rows.map((row) => row.id)],
      );
      const second = await queries.fetchFixedListMembers(listId, 2);
      expect(second).toMatchObject({ page: 2, pageCount: 2, total: 51 });
      expect(second.rows).toHaveLength(1);
      // As after "Quitar" empties the last page: the last real page instead.
      const beyond = await queries.fetchFixedListMembers(listId, 7);
      expect(beyond).toMatchObject({ page: 2, pageCount: 2, total: 51 });
      expect(beyond.rows).toHaveLength(1);
    });

    it("saves a filter list's new criteria and removes a fixed list's member", async () => {
      await signInAs("admin");
      const first = await createSubcategory();
      const second = await createSubcategory();
      const inFirst = await createUser();
      const inSecond = await createUser();
      await tag([inFirst], first);
      await tag([inSecond], second);

      const name = `Cambia ${randomUUID().slice(0, 8)}`;
      const created_ = await actions.createDistributionListAction({
        kind: "filter",
        name,
        filter: { v: 1, subcategoryIds: [first] },
      });
      const filterListId = (created_ as { listId: number }).listId;
      created.lists.push(filterListId);
      expect(
        await queries.resolveListSourceMembers({
          kind: "list",
          listId: filterListId,
        }),
      ).toMatchObject({ ok: true, members: [{ userId: inFirst }] });

      expect(
        await actions.updateDistributionListAction({
          listId: filterListId,
          name,
          filter: { v: 1, subcategoryIds: [second] },
        }),
      ).toMatchObject({ success: true });
      expect(
        await queries.resolveListSourceMembers({
          kind: "list",
          listId: filterListId,
        }),
      ).toMatchObject({ ok: true, members: [{ userId: inSecond }] });

      const fixed = await actions.createDistributionListAction({
        kind: "fixed",
        name: `Quitar ${randomUUID().slice(0, 8)}`,
        memberIds: [inFirst, inSecond],
      });
      const fixedListId = (fixed as { listId: number }).listId;
      created.lists.push(fixedListId);
      expect(
        await actions.removeDistributionListMemberAction({
          listId: fixedListId,
          userIds: [inFirst],
        }),
      ).toMatchObject({ success: true });
      expect(
        (await queries.fetchFixedListMembers(fixedListId, 1)).rows.map(
          (row) => row.userId,
        ),
      ).toEqual([inSecond]);
    });

    it("takes the 3,000th member and refuses the next", async () => {
      await signInAs("admin");
      const result = await actions.createDistributionListAction({
        kind: "fixed",
        name: `Llena ${randomUUID().slice(0, 8)}`,
      });
      const listId = (result as { listId: number }).listId;
      created.lists.push(listId);
      // 2,999 members in two statements: the cap counts rows.
      const { rows } = await pool!.query<{ id: number }>(
        `INSERT INTO users (clerk_id, email, display_name, role, status)
         SELECT 'lists-bulk-' || $1 || '-' || g, 'lists-bulk-' || $1 || '-' || g || '@example.com',
                'Lista ' || g, 'user', 'verified'
         FROM generate_series(1, 2999) g
         RETURNING id`,
        [randomUUID()],
      );
      created.users.push(...rows.map((row) => row.id));
      await pool!.query(
        `INSERT INTO distribution_list_members (list_id, user_id)
         SELECT $1, unnest($2::int[])`,
        [listId, rows.map((row) => row.id)],
      );
      expect(
        await actions.addDistributionListMembersAction({
          listId,
          userIds: [await createUser()],
        }),
      ).toMatchObject({ success: true, added: 1 });
      const someone = await createUser();

      const over = await actions.addDistributionListMembersAction({
        listId,
        userIds: [someone],
      });
      expect(over).toMatchObject({
        success: false,
        message: expect.stringContaining("3.000 personas como máximo"),
      });
    }, 60_000);
  });

  describe("names and archiving", () => {
    it("keeps names unique among live lists, ignoring case and spaces; archiving frees the name", async () => {
      await signInAs("admin");
      const name = `Ilustradores ${randomUUID().slice(0, 8)}`;
      const first = await actions.createDistributionListAction({
        kind: "fixed",
        name,
      });
      expect(first).toMatchObject({ success: true });
      const firstId = (first as { listId: number }).listId;
      created.lists.push(firstId);

      expect(
        await actions.createDistributionListAction({
          kind: "filter",
          name: `  ${name.toUpperCase()} `,
          filter: { v: 1 },
        }),
      ).toEqual({
        success: false,
        message: "Ya hay una lista con ese nombre. Elegí otro.",
      });

      expect(
        await actions.archiveDistributionListAction(firstId),
      ).toMatchObject({
        success: true,
      });
      expect(
        (await queries.fetchSavedLists()).some((list) => list.id === firstId),
      ).toBe(false);
      // Archived lists stay readable by id, and cannot be changed.
      expect(
        (await queries.fetchDistributionList(firstId))?.archivedAt,
      ).not.toBeNull();
      expect(
        await actions.addDistributionListMembersAction({
          listId: firstId,
          userIds: [await createUser()],
        }),
      ).toMatchObject({
        success: false,
        message: expect.stringContaining("archivada"),
      });

      const second = await actions.createDistributionListAction({
        kind: "fixed",
        name,
      });
      expect(second).toMatchObject({ success: true });
      created.lists.push((second as { listId: number }).listId);
    });

    it("keeps the Confirmados prefix for festival lists", async () => {
      await signInAs("admin");
      expect(
        await actions.createDistributionListAction({
          kind: "fixed",
          name: "Confirmados · Algo",
        }),
      ).toMatchObject({ success: false });
    });
  });

  describe("who may use them", () => {
    it("refuses every action to a festival admin, a participant, and an admin without the flag", async () => {
      const list = await integrationDb!
        .insert(distributionLists)
        .values({ name: `Ajena ${randomUUID().slice(0, 8)}`, kind: "fixed" })
        .returning({ id: distributionLists.id });
      const listId = list[0]!.id;
      created.lists.push(listId);
      const someone = await createUser();

      const attempts = () => [
        actions.createDistributionListAction({
          kind: "fixed",
          name: `X ${randomUUID()}`,
        }),
        actions.updateDistributionListAction({ listId, name: "Cambiada" }),
        actions.archiveDistributionListAction(listId),
        actions.addDistributionListMembersAction({
          listId,
          userIds: [someone],
        }),
        actions.removeDistributionListMemberAction({
          listId,
          userIds: [someone],
        }),
        actions.previewDistributionListFilterAction({ v: 1 }),
        giftActions.expandListForCreditGiftAction({
          source: { kind: "list", listId },
          chosenIds: [],
        }),
      ];

      for (const role of ["festival_admin", "user"] as const) {
        await signInAs(role);
        for (const result of await Promise.all(attempts())) {
          expect(result).toMatchObject({ success: false });
        }
        expect(
          await actions.searchDistributionListCandidatesAction({
            query: "Lista",
          }),
        ).toEqual([]);
        expect(await queries.fetchSavedLists()).toEqual([]);
        expect(await queries.fetchFestivalLists()).toEqual([]);
      }

      await signInAs("admin");
      state.flagOn = false;
      for (const result of await Promise.all(attempts())) {
        expect(result).toMatchObject({ success: false });
      }
      expect(
        await actions.searchDistributionListCandidatesAction({
          query: "Lista",
        }),
      ).toEqual([]);

      const [after] = await integrationDb!
        .select({
          name: distributionLists.name,
          archivedAt: distributionLists.archivedAt,
        })
        .from(distributionLists)
        .where(eq(distributionLists.id, listId));
      expect(after!.name).not.toBe("Cambiada");
      expect(after!.archivedAt).toBeNull();
      const members = await integrationDb!
        .select({ n: sql<number>`count(*)::int` })
        .from(distributionListMembers)
        .where(eq(distributionListMembers.listId, listId));
      expect(members[0]!.n).toBe(0);
    });
  });

  describe("«Agregar una lista» in a credit gift", () => {
    it("adds the eligible members and classifies like the gift does", async () => {
      await signInAs("admin");
      const festival = await createFestival();
      const ok = await createUser();
      const paused = await createUser({ status: "paused" });
      const banned = await createUser({ status: "banned" });
      const adminOwner = await createUser({ role: "admin" });
      const chosen = await createUser();
      await reserve(festival.id, { owner: ok, partners: [paused, banned] });
      await reserve(festival.id, { owner: adminOwner, partners: [chosen] });

      const result = await giftActions.expandListForCreditGiftAction({
        source: { kind: "festival", festivalId: festival.id },
        chosenIds: [chosen],
      });
      expect(result).toMatchObject({ success: true });
      const { recipients, message } = result as {
        recipients: { id: number; skipReason: string | null }[];
        message: string;
      };
      expect(recipients.map((r) => r.id).sort()).toEqual([ok, paused].sort());
      expect(recipients.every((r) => r.skipReason === null)).toBe(true);
      expect(message).toBe(
        `Agregamos 2 personas de «Confirmados · ${festival.name}» (1 ya estaba). 2 no pueden recibir regalos.`,
      );

      // The same verdict the gift would reach for each member.
      const resolved = await queries.resolveListSourceMembers({
        kind: "festival",
        festivalId: festival.id,
      });
      const gift = await giftService.classifyCreditGiftRecipients([
        ok,
        paused,
        banned,
        adminOwner,
        chosen,
      ]);
      expect(resolved.ok).toBe(true);
      for (const member of (
        resolved as { members: { userId: number; reason: string | null }[] }
      ).members) {
        expect(member.reason).toBe(gift.get(member.userId) ?? null);
      }
    });

    it("adds nothing when the gift would pass 100 people", async () => {
      await signInAs("admin");
      const festival = await createFestival();
      const a = await createUser();
      const b = await createUser();
      await reserve(festival.id, { owner: a, partners: [b] });
      const chosenIds = Array.from({ length: 99 }, (_, i) => 2_000_000_000 + i);

      expect(
        await giftActions.expandListForCreditGiftAction({
          source: { kind: "festival", festivalId: festival.id },
          chosenIds,
        }),
      ).toEqual({
        success: false,
        message: `Con «Confirmados · ${festival.name}» serían 101 personas y un regalo llega a 100 como máximo. Elegí una lista más chica o agregá personas una por una.`,
      });
      // One already chosen makes it exactly 100, which fits.
      expect(
        await giftActions.expandListForCreditGiftAction({
          source: { kind: "festival", festivalId: festival.id },
          chosenIds: [...chosenIds.slice(1), a],
        }),
      ).toMatchObject({
        success: true,
        recipients: [expect.objectContaining({ id: b })],
      });
    });

    it("is refused outside production and for an archived list", async () => {
      await signInAs("admin");
      const festival = await createFestival();
      state.vercelEnv = "preview";
      expect(
        await giftActions.expandListForCreditGiftAction({
          source: { kind: "festival", festivalId: festival.id },
          chosenIds: [],
        }),
      ).toEqual({
        success: false,
        message:
          "En el entorno de prueba no se pueden agregar listas a un regalo: agregá a las personas por nombre.",
      });
      state.vercelEnv = "production";

      const [list] = await integrationDb!
        .insert(distributionLists)
        .values({
          name: `Archivada ${randomUUID().slice(0, 8)}`,
          kind: "fixed",
          archivedAt: new Date(),
        })
        .returning({ id: distributionLists.id });
      created.lists.push(list!.id);
      expect(
        await giftActions.expandListForCreditGiftAction({
          source: { kind: "list", listId: list!.id },
          chosenIds: [],
        }),
      ).toEqual({
        success: false,
        message: "Esa lista ya no está disponible.",
      });
    });
  });
});
