// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import {
  creditLedgerEntries,
  creditTopUps,
  discountCodes,
  festivals,
  financeFestivalSettings,
  invoiceCreditAllocations,
  invoiceSettlementSubmissions,
  invoices,
  payments,
  reservationFeatureActions,
  standReservations,
  stands,
  users,
} from "@/db/schema";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const currentProfile = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/app/lib/users/helpers", () => ({
  requireAdmin: vi.fn(async () => {
    const profile = currentProfile.value as { role?: string } | null;
    return profile?.role === "admin" ? profile : null;
  }),
}));

const dbHolder = vi.hoisted(() => ({ current: null as never }));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => {
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
    return /(^|[_-])(test|ci)([_-]|$)/i.test(
      decodeURIComponent(new URL(url).pathname.slice(1)),
    );
  } catch {
    return false;
  }
}

if (testDatabaseUrl && !isSafeTestDatabase(testDatabaseUrl)) {
  throw new Error("TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.");
}

const pool = testDatabaseUrl ? new Pool({ connectionString: testDatabaseUrl, max: 5 }) : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

let queries: typeof import("@/app/lib/festivals/finance/queries");
let actions: typeof import("@/app/lib/festivals/finance/actions");

const created = {
  users: [] as number[],
  festivals: [] as number[],
  codes: [] as number[],
};
let festivalId = 0;
let adminId = 0;

const at = (iso: string) => new Date(iso);

async function createUser(role: "user" | "admin" = "user") {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `finance-${suffix}`,
      email: `finance-${suffix}@example.test`,
      displayName: "Finance Fixture",
      role,
      status: "verified",
    })
    .returning({ id: users.id });
  created.users.push(user!.id);
  return user!.id;
}

async function createReservation(input: { userId: number; price: number; status?: "pending" | "accepted" }) {
  const db = integrationDb!;
  const [stand] = await db
    .insert(stands)
    .values({
      festivalId,
      label: `F-${Math.floor(Math.random() * 100000)}`,
      standNumber: Math.floor(Math.random() * 100000),
      status: "reserved",
    })
    .returning({ id: stands.id });
  const [reservation] = await db
    .insert(standReservations)
    .values({
      standId: stand!.id,
      festivalId,
      status: input.status ?? "accepted",
      ownerUserId: input.userId,
      priceAmountSnapshot: input.price,
    })
    .returning({ id: standReservations.id });
  return reservation!.id;
}

async function purchase(userId: number, amount: number, when: string) {
  const db = integrationDb!;
  const [topUp] = await db
    .insert(creditTopUps)
    .values({
      userId,
      amount,
      status: "approved",
      intendedUseType: "debt",
      uploadDeadlineAt: at("2030-01-01T00:00:00Z"),
      submittedAt: at(when),
      reviewedAt: at(when),
      idempotencyKey: randomUUID(),
      createdAt: at(when),
    })
    .returning({ id: creditTopUps.id });
  await db.insert(creditLedgerEntries).values({
    userId,
    amount,
    type: "top_up",
    topUpId: topUp!.id,
    idempotencyKey: randomUUID(),
    createdAt: at(when),
  });
}

async function spend(userId: number, amount: number, when: string, featureActionId?: number) {
  const [entry] = await integrationDb!
    .insert(creditLedgerEntries)
    .values({
      userId,
      amount: -amount,
      type: "spend",
      featureActionId: featureActionId ?? null,
      idempotencyKey: randomUUID(),
      createdAt: at(when),
    })
    .returning({ id: creditLedgerEntries.id });
  return entry!.id;
}

describeDatabase("festival finance", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    dbHolder.current = integrationDb as never;

    const probe = await pool!.query<{ table: string | null }>(
      "select to_regclass('public.finance_festival_settings')::text as table",
    );
    if (!probe.rows[0]?.table) {
      throw new Error("TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.");
    }

    queries = await import("@/app/lib/festivals/finance/queries");
    actions = await import("@/app/lib/festivals/finance/actions");

    const db = integrationDb!;
    adminId = await createUser("admin");
    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Finance ${randomUUID()}`,
        // 6 October, 10:00 in La Paz.
        reservationsStartDate: at("2026-10-06T14:00:00Z"),
      })
      .returning({ id: festivals.id });
    festivalId = festival!.id;
    created.festivals.push(festivalId);

    const [code] = await db
      .insert(discountCodes)
      .values({
        code: `FIN${Math.floor(Math.random() * 1e6)}`,
        discountUnit: "percentage",
        discountValue: 10,
        festivalId,
        expiresAt: at("2030-01-01T00:00:00Z"),
      })
      .returning({ id: discountCodes.id });
    created.codes.push(code!.id);

    // Participant A: a gift in January, a purchase in March, one inside the
    // window, then a reservation paid with credits and a voucher, and a full
    // table bought with credits.
    const a = await createUser();
    await db.insert(creditLedgerEntries).values({
      userId: a,
      amount: 50,
      type: "admin_grant",
      idempotencyKey: randomUUID(),
      createdAt: at("2026-01-10T12:00:00Z"),
    });
    await purchase(a, 100, "2026-03-01T12:00:00Z");
    await purchase(a, 200, "2026-10-03T12:00:00Z");

    const reservationA = await createReservation({ userId: a, price: 400 });
    const [invoiceA] = await db
      .insert(invoices)
      .values({
        date: at("2026-10-04T12:00:00Z"),
        userId: a,
        reservationId: reservationA,
        originalAmount: 400,
        discountAmount: 40,
        amount: 360,
        discountCodeId: code!.id,
        status: "paid",
      })
      .returning({ id: invoices.id });
    const spendA = await spend(a, 300, "2026-10-04T12:00:00Z");
    await db.insert(invoiceCreditAllocations).values({
      invoiceId: invoiceA!.id,
      userId: a,
      amount: 300,
      ledgerEntryId: spendA,
      idempotencyKey: randomUUID(),
    });
    const [payment] = await db
      .insert(payments)
      .values({ amount: 60, date: at("2026-10-05T12:00:00Z"), invoiceId: invoiceA!.id, voucherUrl: "https://example.test/v.png" })
      .returning({ id: payments.id });
    await db.insert(invoiceSettlementSubmissions).values({
      invoiceId: invoiceA!.id,
      paymentId: payment!.id,
      kind: "payment_proof",
      status: "approved",
    });

    const [action] = await db
      .insert(reservationFeatureActions)
      .values({
        festivalId,
        reservationId: reservationA,
        ownerUserId: a,
        type: "full_table_access",
        status: "fulfilled",
        featurePriceSnapshot: 50,
      })
      .returning({ id: reservationFeatureActions.id });
    await spend(a, 50, "2026-10-05T12:00:00Z", action!.id);

    // Participant B: an unpaid reservation past its due date.
    const b = await createUser();
    const reservationB = await createReservation({ userId: b, price: 300, status: "pending" });
    await db.insert(invoices).values({
      date: at("2026-10-07T12:00:00Z"),
      dueAt: at("2026-10-20T12:00:00Z"),
      userId: b,
      reservationId: reservationB,
      originalAmount: 300,
      amount: 300,
    });

    // A space given away: a live reservation with no cobro at all.
    await createReservation({ userId: adminId, price: 250 });
  }, 60_000);

  afterAll(async () => {
    try {
      const db = integrationDb;
      if (!db) return;
      if (created.users.length > 0) {
        await db.delete(invoiceCreditAllocations).where(inArray(invoiceCreditAllocations.userId, created.users));
        await db.delete(invoices).where(inArray(invoices.userId, created.users));
      }
      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        await client.query("ALTER TABLE credit_ledger_entries DISABLE TRIGGER credit_ledger_entries_append_only");
        await client.query(
          "DELETE FROM credit_ledger_entries WHERE user_id = ANY($1::int[]) AND reverses_entry_id IS NOT NULL",
          [created.users],
        );
        await client.query("DELETE FROM credit_ledger_entries WHERE user_id = ANY($1::int[])", [created.users]);
        await client.query("ALTER TABLE credit_ledger_entries ENABLE TRIGGER credit_ledger_entries_append_only");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      if (created.festivals.length > 0) {
        await db.delete(reservationFeatureActions).where(inArray(reservationFeatureActions.festivalId, created.festivals));
        await db.delete(standReservations).where(inArray(standReservations.festivalId, created.festivals));
        await db.delete(stands).where(inArray(stands.festivalId, created.festivals));
      }
      if (created.codes.length > 0) {
        await db.delete(discountCodes).where(inArray(discountCodes.id, created.codes));
      }
      if (created.festivals.length > 0) {
        await db.delete(festivals).where(inArray(festivals.id, created.festivals));
      }
      if (created.users.length > 0) {
        await db.delete(creditTopUps).where(inArray(creditTopUps.userId, created.users));
        await db.delete(users).where(inArray(users.id, created.users));
      }
    } finally {
      await pool?.end();
    }
  });

  it("adds up the festival and splits the credits oldest first", async () => {
    const finance = await queries.fetchFestivalFinance(festivalId);
    expect(finance).not.toBeNull();
    const s = finance!.summary;

    expect(finance!.leadDays).toBe(5);
    expect(finance!.leadDaysCustom).toBe(false);
    expect(finance!.windowStart.toISOString()).toBe("2026-10-01T04:00:00.000Z");

    expect(s).toMatchObject({
      reservations: 2,
      gross: 700,
      discounts: 40,
      writeOffs: 0,
      net: 660,
      invoiceCollected: 360,
      outstanding: 300,
      directPayment: 60,
      invoiceCredits: 300,
      featureCredits: 50,
      creditsTotal: 350,
      collected: 410,
      // The 300 spend takes the gift, the March purchase, then 150 of the
      // October one; the full table takes the last 50 of it.
      credits: { gifted: 50, earlier: 100, festival: 200, inReview: 0, unpaid: 0 },
      newMoney: 260,
      extras: [{ type: "full_table_access", count: 1, amount: 50 }],
      pending: [{ key: "overdue", reservations: 1, amount: 300 }],
      free: { count: 1, value: 250 },
    });
    expect(s.discountRows).toEqual([
      expect.objectContaining({ label: "10%", uses: 1, amount: 40 }),
    ]);
    expect(finance!.rows).toHaveLength(2);
  });

  it("lets only an admin change the lead days, and the split follows", async () => {
    currentProfile.value = { id: 1, role: "festival_admin" };
    expect(await actions.updateCreditLeadDays({ festivalId, leadDays: 0 })).toMatchObject({ success: false });

    currentProfile.value = { id: adminId, role: "admin" };
    expect(await actions.updateCreditLeadDays({ festivalId, leadDays: 31 })).toMatchObject({ success: false });
    expect(await actions.updateCreditLeadDays({ festivalId, leadDays: 0 })).toEqual({ success: true });

    const [row] = await integrationDb!
      .select()
      .from(financeFestivalSettings)
      .where(eq(financeFestivalSettings.festivalId, festivalId));
    expect(row).toMatchObject({ creditLeadDays: 0, updatedByUserId: adminId });

    // With no lead, the 3 October purchase predates reservations opening.
    const finance = await queries.fetchFestivalFinance(festivalId);
    expect(finance!.leadDaysCustom).toBe(true);
    expect(finance!.summary.credits).toMatchObject({ festival: 0, earlier: 300, gifted: 50 });
    expect(finance!.summary.newMoney).toBe(60);
  });
});
