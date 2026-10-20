// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq, inArray } from "drizzle-orm";
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
  discountCodes,
  discountCodeUsers,
  festivalSectors,
  festivals,
  invoices,
  standReservations,
  stands,
  users,
} from "@/db/schema";

/**
 * Discount codes reserved for several people, against a real database: what
 * the admin actions store and list, who can then apply a code, and the 0297
 * backfill that carries single-user codes over.
 */

const currentProfileMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));
vi.mock("@/app/lib/rate-limit", () => ({
  consumeActionRateLimit: vi.fn().mockResolvedValue(true),
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 5 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Actions = typeof import("@/app/lib/discount_codes/actions");
let actions: Actions;

const created = {
  codes: [] as number[],
  users: [] as number[],
  festivals: [] as number[],
};

function suffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

async function createUser(label: string) {
  const id = suffix();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `dc-${label}-${id}`,
      email: `dc-${label}-${id}@example.test`,
      displayName: `${label} ${id}`,
      status: "verified",
      category: "illustration",
    })
    .returning();
  created.users.push(user.id);
  return user;
}

/** A pending Bs400 invoice on a reservation owned by `ownerId`. */
async function createInvoice(ownerId: number) {
  const db = integrationDb!;
  const id = suffix();
  const [festival] = await db
    .insert(festivals)
    .values({
      name: `Discount ${id}`,
      status: "active",
      festivalType: "glitter",
      reservationsStartDate: new Date(Date.now() - 60_000),
    })
    .returning();
  created.festivals.push(festival.id);
  const [sector] = await db
    .insert(festivalSectors)
    .values({ name: `S ${id}`, festivalId: festival.id, orderInFestival: 1 })
    .returning();
  const [stand] = await db
    .insert(stands)
    .values({
      festivalId: festival.id,
      festivalSectorId: sector.id,
      standNumber: 1,
      standCategory: "illustration",
      status: "reserved",
      price: 400,
      individualPrice: 400,
    })
    .returning();
  const [reservation] = await db
    .insert(standReservations)
    .values({
      festivalId: festival.id,
      standId: stand.id,
      status: "pending",
      source: "admin_assignment",
      ownerUserId: ownerId,
      priceAmountSnapshot: 400,
      individualPriceSnapshot: 400,
    })
    .returning();
  const [invoice] = await db
    .insert(invoices)
    .values({
      originalAmount: 400,
      discountAmount: 0,
      amount: 400,
      date: new Date(),
      status: "pending",
      userId: ownerId,
      reservationId: reservation.id,
    })
    .returning();
  return invoice;
}

function codeInput(
  code: string,
  overrides: Partial<Parameters<Actions["createDiscountCode"]>[0]> = {},
) {
  return {
    code,
    discountUnit: "percentage" as const,
    discountValue: 25,
    maxUses: null,
    festivalId: null,
    audience: "everyone" as const,
    userIds: [] as number[],
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
    isActive: true,
    ...overrides,
  };
}

async function codeId(code: string) {
  const [row] = await integrationDb!
    .select({ id: discountCodes.id })
    .from(discountCodes)
    .where(eq(discountCodes.code, code.toLowerCase()));
  if (row) created.codes.push(row.id);
  return row?.id;
}

async function assignedUserIds(id: number) {
  const rows = await integrationDb!
    .select({ userId: discountCodeUsers.userId })
    .from(discountCodeUsers)
    .where(eq(discountCodeUsers.discountCodeId, id));
  return rows.map((row) => row.userId).sort((a, b) => a - b);
}

afterAll(async () => {
  await pool?.end();
});

describeDatabase("discount codes reserved for several users", () => {
  let admin: { id: number; role: "admin" };

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    const result = await pool!.query(
      "select 1 from information_schema.tables where table_name = 'discount_code_users'",
    );
    if (result.rowCount === 0) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    actions = await import("@/app/lib/discount_codes/actions");
    const adminUser = await createUser("admin");
    admin = { id: adminUser.id, role: "admin" };
  });

  afterEach(() => {
    currentProfileMock.mockReset();
  });

  afterAll(async () => {
    const db = integrationDb!;
    if (created.codes.length > 0) {
      await db
        .delete(discountCodes)
        .where(inArray(discountCodes.id, created.codes));
    }
    for (const festivalId of created.festivals) {
      const reservations = await db
        .select({ id: standReservations.id })
        .from(standReservations)
        .where(eq(standReservations.festivalId, festivalId));
      const reservationIds = reservations.map((row) => row.id);
      if (reservationIds.length > 0) {
        await db
          .delete(invoices)
          .where(inArray(invoices.reservationId, reservationIds));
        await db
          .delete(standReservations)
          .where(inArray(standReservations.id, reservationIds));
      }
      await db.delete(stands).where(eq(stands.festivalId, festivalId));
      await db
        .delete(festivalSectors)
        .where(eq(festivalSectors.festivalId, festivalId));
      await db.delete(festivals).where(eq(festivals.id, festivalId));
    }
    if (created.users.length > 0) {
      await db.delete(users).where(inArray(users.id, created.users));
    }
  });

  it("stores and lists every user a code is reserved for", async () => {
    currentProfileMock.mockResolvedValue(admin);
    const ana = await createUser("ana");
    const beto = await createUser("beto");
    const code = `MULTI-${suffix()}`;

    await expect(
      actions.createDiscountCode(
        codeInput(code, {
          audience: "selected_users",
          userIds: [beto.id, ana.id, ana.id],
        }),
      ),
    ).resolves.toMatchObject({ success: true });

    const id = (await codeId(code))!;
    expect(await assignedUserIds(id)).toEqual(
      [ana.id, beto.id].sort((a, b) => a - b),
    );

    const listed = (await actions.fetchDiscountCodes()).find(
      (row) => row.id === id,
    );
    expect(listed).toMatchObject({
      code: code.toLowerCase(),
      audience: "selected_users",
    });
    // Sorted by name for the list and the form.
    expect(listed!.assignedUsers.map((user) => user.id)).toEqual([
      ana.id,
      beto.id,
    ]);
    expect(listed!.assignedUsers[0]).toEqual({
      id: ana.id,
      displayName: ana.displayName,
      firstName: ana.firstName,
      lastName: ana.lastName,
      email: ana.email,
      imageUrl: ana.imageUrl,
    });
  });

  it("replaces the user set on update, and clears it for everyone", async () => {
    currentProfileMock.mockResolvedValue(admin);
    const ana = await createUser("ana");
    const beto = await createUser("beto");
    const caro = await createUser("caro");
    const code = `SWAP-${suffix()}`;
    await actions.createDiscountCode(
      codeInput(code, {
        audience: "selected_users",
        userIds: [ana.id, beto.id],
      }),
    );
    const id = (await codeId(code))!;

    await expect(
      actions.updateDiscountCode(
        id,
        codeInput(code, {
          audience: "selected_users",
          userIds: [beto.id, caro.id],
        }),
      ),
    ).resolves.toMatchObject({ success: true });
    expect(await assignedUserIds(id)).toEqual(
      [beto.id, caro.id].sort((a, b) => a - b),
    );

    await actions.updateDiscountCode(
      id,
      codeInput(code, { audience: "everyone", userIds: [beto.id] }),
    );
    expect(await assignedUserIds(id)).toEqual([]);
    const [row] = await integrationDb!
      .select({ audience: discountCodes.audience })
      .from(discountCodes)
      .where(eq(discountCodes.id, id));
    expect(row.audience).toBe("everyone");
  });

  it("explains a duplicate code and an unknown user instead of failing vaguely", async () => {
    currentProfileMock.mockResolvedValue(admin);
    const code = `DUP-${suffix()}`;
    await actions.createDiscountCode(codeInput(code));
    await codeId(code);

    await expect(
      actions.createDiscountCode(codeInput(code.toLowerCase())),
    ).resolves.toEqual({
      success: false,
      message: "Ya existe un código de descuento con ese nombre.",
    });
    await expect(
      actions.createDiscountCode(
        codeInput(`GHOST-${suffix()}`, {
          audience: "selected_users",
          userIds: [2_000_000_000],
        }),
      ),
    ).resolves.toEqual({
      success: false,
      message: "El festival o alguno de los usuarios elegidos ya no existe.",
    });
  });

  it("applies a reserved code only to the invoices of people on its list", async () => {
    currentProfileMock.mockResolvedValue(admin);
    const ana = await createUser("ana");
    const beto = await createUser("beto");
    const outsider = await createUser("outsider");
    const code = `PAIR-${suffix()}`;
    await actions.createDiscountCode(
      codeInput(code, {
        audience: "selected_users",
        userIds: [ana.id, beto.id],
      }),
    );
    const id = (await codeId(code))!;

    const outsiderInvoice = await createInvoice(outsider.id);
    currentProfileMock.mockResolvedValue({ id: outsider.id, role: "user" });
    await expect(
      actions.validateAndApplyDiscountCode({
        code,
        invoiceId: outsiderInvoice.id,
      }),
    ).resolves.toMatchObject({ success: false });

    for (const person of [ana, beto]) {
      const invoice = await createInvoice(person.id);
      currentProfileMock.mockResolvedValue({ id: person.id, role: "user" });
      await expect(
        actions.validateAndApplyDiscountCode({
          code: code.toLowerCase(),
          invoiceId: invoice.id,
        }),
      ).resolves.toMatchObject({
        success: true,
        discountAmount: 100,
        newAmount: 300,
      });
    }

    const [row] = await integrationDb!
      .select({ currentUses: discountCodes.currentUses })
      .from(discountCodes)
      .where(eq(discountCodes.id, id));
    expect(row.currentUses).toBe(2);
  });

  it("keeps a code reserved for nobody once its only user is deleted", async () => {
    currentProfileMock.mockResolvedValue(admin);
    const ana = await createUser("ana");
    const beto = await createUser("beto");
    const code = `SOLO-${suffix()}`;
    await actions.createDiscountCode(
      codeInput(code, { audience: "selected_users", userIds: [ana.id] }),
    );
    const id = (await codeId(code))!;

    await integrationDb!.delete(users).where(eq(users.id, ana.id));
    expect(await assignedUserIds(id)).toEqual([]);

    // The old single-user column was set to NULL here, which made the code
    // public.
    const invoice = await createInvoice(beto.id);
    currentProfileMock.mockResolvedValue({ id: beto.id, role: "user" });
    await expect(
      actions.validateAndApplyDiscountCode({ code, invoiceId: invoice.id }),
    ).resolves.toMatchObject({ success: false });
  });

  it("refuses to lower a limit below the uses already counted", async () => {
    currentProfileMock.mockResolvedValue(admin);
    const code = `LIMIT-${suffix()}`;
    await actions.createDiscountCode(codeInput(code, { maxUses: 10 }));
    const id = (await codeId(code))!;
    await integrationDb!
      .update(discountCodes)
      .set({ currentUses: 4 })
      .where(eq(discountCodes.id, id));

    await expect(
      actions.updateDiscountCode(id, codeInput(code, { maxUses: 3 })),
    ).resolves.toMatchObject({ success: false });
    await expect(
      actions.updateDiscountCode(id, codeInput(code, { maxUses: 4 })),
    ).resolves.toMatchObject({ success: true });
  });
});

describeDatabase("0297 discount code users backfill", () => {
  const migration = readFileSync(
    join(process.cwd(), "drizzle/0297_discount_code_users.sql"),
    "utf8",
  );
  // The hand-added statements: everything that touches existing rows.
  const backfill = migration
    .split("--> statement-breakpoint")
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(
      (statement) =>
        statement.startsWith('INSERT INTO "discount_code_users"') ||
        statement.startsWith('UPDATE "discount_codes"'),
    );

  it("finds both statements in the migration", () => {
    expect(backfill).toHaveLength(2);
  });

  it("carries single-user codes over and leaves public ones public", async () => {
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      // Puts back the column 0298 drops, as the database had it when 0297 ran.
      await client.query(
        `ALTER TABLE "discount_codes" ADD COLUMN "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL`,
      );
      const id = suffix();
      const user = await client.query<{ id: number }>(
        `INSERT INTO "users" ("clerk_id", "email") VALUES ($1, $2) RETURNING id`,
        [`bf-${id}`, `bf-${id}@example.test`],
      );
      const codes = await client.query<{ id: number }>(
        `INSERT INTO "discount_codes" ("code", "discount_value", "expires_at", "user_id")
         VALUES ($1, 10, now() + interval '1 day', $3), ($2, 10, now() + interval '1 day', NULL)
         RETURNING id`,
        [`bf-one-${id}`, `bf-all-${id}`, user.rows[0].id],
      );
      const [single, open] = codes.rows.map((row) => row.id);

      for (const statement of backfill) await client.query(statement);

      const assigned = await client.query(
        `SELECT "discount_code_id", "user_id" FROM "discount_code_users"
         WHERE "discount_code_id" = ANY($1::int[])`,
        [[single, open]],
      );
      expect(assigned.rows).toEqual([
        { discount_code_id: single, user_id: user.rows[0].id },
      ]);
      const audiences = await client.query(
        `SELECT id, audience FROM "discount_codes" WHERE id = ANY($1::int[]) ORDER BY id`,
        [[single, open]],
      );
      expect(audiences.rows).toEqual([
        { id: single, audience: "selected_users" },
        { id: open, audience: "everyone" },
      ]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
