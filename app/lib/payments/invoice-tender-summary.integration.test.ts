// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
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
  invoiceCreditAllocations,
  invoices,
  standReservations,
  stands,
  users,
} from "@/db/schema";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const currentProfile = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: vi.fn(async () => currentProfile.value),
}));

/**
 * Forwards every `db.*` access to the real client, which is only available
 * once `beforeAll` has built it. Methods are bound so `db.transaction(...)`
 * keeps its receiver.
 */
const dbHolder = vi.hoisted(() => ({ current: null as never }));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => {
        const value = (dbHolder.current as never as Record<string, unknown>)[
          prop as string
        ];
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
  throw new Error(
    "TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.",
  );
}

const pool = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl, max: 10 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

let creditService: typeof import("@/app/lib/credits/service");
let invoiceActions: typeof import("@/app/data/invoices/actions");
let tenderQueries: typeof import("@/app/lib/payments/tender-queries");

const createdUserIds: number[] = [];
const createdFestivalIds: number[] = [];

async function createUser(role: "user" | "admin" = "user") {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `tender-summary-${suffix}`,
      email: `tender-summary-${suffix}@example.test`,
      displayName: "Tender Summary",
      role,
      status: "verified",
    })
    .returning({ id: users.id });
  createdUserIds.push(user!.id);
  return user!.id;
}

/**
 * A reservation whose invoice is part-covered by credits — the shape a
 * participant produces when they put some balance towards a stand and owe the
 * rest by QR.
 */
async function createCreditedInvoice(input: {
  userId: number;
  invoiceAmount: number;
  creditAmount: number;
}) {
  const db = integrationDb!;
  const [festival] = await db
    .insert(festivals)
    .values({ name: `Tender Summary ${randomUUID()}` })
    .returning({ id: festivals.id });
  createdFestivalIds.push(festival!.id);

  const [stand] = await db
    .insert(stands)
    .values({
      festivalId: festival!.id,
      label: "A",
      standNumber: Math.floor(Math.random() * 100000),
      status: "reserved",
    })
    .returning({ id: stands.id });

  const [reservation] = await db
    .insert(standReservations)
    .values({
      standId: stand!.id,
      festivalId: festival!.id,
      status: "pending",
      ownerUserId: input.userId,
    })
    .returning({ id: standReservations.id });

  const [invoice] = await db
    .insert(invoices)
    .values({
      date: new Date(),
      userId: input.userId,
      reservationId: reservation!.id,
      originalAmount: input.invoiceAmount,
      amount: input.invoiceAmount,
    })
    .returning({ id: invoices.id });

  // Spend the credits the way applyInvoiceCredits does, so the allocation
  // points at a real `spend` entry that a release can reverse.
  const debit = await creditService.debitConfirmedCreditsForInvoiceInTx(
    db as never,
    {
      userId: input.userId,
      amount: input.creditAmount,
      idempotencyKey: randomUUID(),
    },
  );
  if (!debit.ok) throw new Error(`fixture debit failed: ${debit.code}`);

  const [allocation] = await db
    .insert(invoiceCreditAllocations)
    .values({
      invoiceId: invoice!.id,
      userId: input.userId,
      amount: input.creditAmount,
      ledgerEntryId: debit.data.ledgerEntryId,
      idempotencyKey: randomUUID(),
    })
    .returning({ id: invoiceCreditAllocations.id });

  return {
    invoiceId: invoice!.id,
    reservationId: reservation!.id,
    allocationId: allocation!.id,
  };
}

async function grantCredits(userId: number, amount: number) {
  const result = await creditService.adjustCreditAccount({
    userId,
    amount,
    reason: "integration fixture",
    idempotencyKey: randomUUID(),
  });
  if (!result.ok) throw new Error(`fixture grant failed: ${result.code}`);
}

/** The canonical tender, read through the same path the admin screens use. */
async function canonicalTender(invoiceId: number, amount: number) {
  const tenders = await tenderQueries.fetchInvoiceTenders(
    [invoiceId],
    new Map([[invoiceId, amount]]),
  );
  return tenderQueries.tenderFor(tenders, invoiceId);
}

describeDatabase("participant invoice tender summary", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    dbHolder.current = integrationDb as never;

    const probe = await pool!.query<{ table: string | null }>(
      "select to_regclass('public.invoice_credit_allocations')::text as table",
    );
    if (!probe.rows[0]?.table) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    creditService = await import("@/app/lib/credits/service");
    invoiceActions = await import("@/app/data/invoices/actions");
    tenderQueries = await import("@/app/lib/payments/tender-queries");
  }, 60_000);

  beforeEach(() => {
    currentProfile.value = null;
  });

  afterAll(async () => {
    // Every delete is wrapped so `pool.end()` still runs if one throws —
    // otherwise a cleanup failure leaks the pool and the run hangs on exit
    // instead of reporting the failure.
    try {
      const db = integrationDb;
      if (db && createdUserIds.length > 0) {
        // `invoice_credit_allocations.user_id` and `.ledger_entry_id` are both
        // `on delete restrict`, so the allocations go before either the ledger
        // rows they point at or the users that own them. Submissions and
        // payments cascade from the invoice.
        await db
          .delete(invoiceCreditAllocations)
          .where(inArray(invoiceCreditAllocations.userId, createdUserIds));
        await db
          .delete(invoices)
          .where(inArray(invoices.userId, createdUserIds));
      }

      if (db && createdFestivalIds.length > 0) {
        // Reservations before stands: `stand_reservations.stand_id` is
        // `no action`, so a standing reservation blocks its stand.
        await db
          .delete(standReservations)
          .where(inArray(standReservations.festivalId, createdFestivalIds));
        await db
          .delete(stands)
          .where(inArray(stands.festivalId, createdFestivalIds));
        await db
          .delete(festivals)
          .where(inArray(festivals.id, createdFestivalIds));
      }

      if (db && createdUserIds.length > 0) {
        // `credit_ledger_entries.user_id` is `on delete restrict`, so the
        // spends block their users. The ledger is append-only in production,
        // enforced by a trigger; it is dropped only for this delete and
        // restored immediately. One transaction, so the ACCESS EXCLUSIVE lock
        // `ALTER TABLE` takes is held until the trigger is back — outside one
        // the lock drops the moment the disable commits and a concurrent test
        // file could append to an unguarded ledger. A rollback reverts the
        // disable too, so a failed delete cannot leave it off. Reversals go
        // first: they point at the spend under the same restrict rule.
        const client = await pool!.connect();
        try {
          await client.query("BEGIN");
          await client.query(
            "ALTER TABLE credit_ledger_entries DISABLE TRIGGER credit_ledger_entries_append_only",
          );
          await client.query(
            `DELETE FROM credit_ledger_entries
             WHERE user_id = ANY($1::int[]) AND reverses_entry_id IS NOT NULL`,
            [createdUserIds],
          );
          await client.query(
            `DELETE FROM credit_ledger_entries WHERE user_id = ANY($1::int[])`,
            [createdUserIds],
          );
          await client.query(
            "ALTER TABLE credit_ledger_entries ENABLE TRIGGER credit_ledger_entries_append_only",
          );
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }

        // `credit_accounts.user_id` cascades, so the account goes with the user.
        await db.delete(users).where(inArray(users.id, createdUserIds));
      }
    } finally {
      await pool?.end();
    }
  });

  it("agrees with the canonical tender on an invoice with a live allocation", async () => {
    const userId = await createUser();
    await grantCredits(userId, 100);
    const { invoiceId } = await createCreditedInvoice({
      userId,
      invoiceAmount: 370,
      creditAmount: 20,
    });
    currentProfile.value = { id: userId, role: "user" };

    const summary = await invoiceActions.fetchInvoiceTenderSummary(invoiceId);
    const canonical = await canonicalTender(invoiceId, 370);

    expect(summary).not.toBeNull();
    expect(summary!.confirmedCreditAmount).toBe(
      canonical.confirmedCreditAmount,
    );
    expect(summary!.outstandingAmount).toBe(canonical.outstandingAmount);
    expect(summary!.confirmedCreditAmount).toBe(20);
    expect(summary!.outstandingAmount).toBe(350);
  });

  /**
   * The divergence this suite exists for. `fetchInvoiceTenderSummary` used to
   * sum `invoice_credit_allocations.amount` with no reversal filter, so a
   * participant whose credits had been released still saw them counted and was
   * told they owed less than they did.
   */
  it("drops a reversed allocation, exactly as the canonical tender does", async () => {
    const userId = await createUser();
    await grantCredits(userId, 100);
    const { invoiceId } = await createCreditedInvoice({
      userId,
      invoiceAmount: 370,
      creditAmount: 20,
    });

    const release = await creditService.releaseInvoiceCreditAllocationsInTx(
      integrationDb! as never,
      { invoiceId, idempotencyKey: randomUUID() },
    );
    expect(release.ok).toBe(true);

    // The allocation row is still there; only the ledger reversal marks it dead.
    const remaining = await integrationDb!
      .select({ id: invoiceCreditAllocations.id })
      .from(invoiceCreditAllocations)
      .where(eq(invoiceCreditAllocations.invoiceId, invoiceId));
    expect(remaining).toHaveLength(1);

    currentProfile.value = { id: userId, role: "user" };
    const summary = await invoiceActions.fetchInvoiceTenderSummary(invoiceId);
    const canonical = await canonicalTender(invoiceId, 370);

    expect(canonical.confirmedCreditAmount).toBe(0);
    expect(canonical.outstandingAmount).toBe(370);

    expect(summary).not.toBeNull();
    expect(summary!.confirmedCreditAmount).toBe(
      canonical.confirmedCreditAmount,
    );
    // The participant owes the whole bill again, and must be told so.
    expect(summary!.outstandingAmount).toBe(canonical.outstandingAmount);
  });

  it("still refuses a caller who neither owns the invoice nor is an admin", async () => {
    const userId = await createUser();
    await grantCredits(userId, 100);
    const { invoiceId } = await createCreditedInvoice({
      userId,
      invoiceAmount: 370,
      creditAmount: 20,
    });

    currentProfile.value = { id: await createUser(), role: "user" };
    expect(
      await invoiceActions.fetchInvoiceTenderSummary(invoiceId),
    ).toBeNull();

    currentProfile.value = null;
    expect(
      await invoiceActions.fetchInvoiceTenderSummary(invoiceId),
    ).toBeNull();
  });

  it("serves a global admin the same totals as the owner", async () => {
    const userId = await createUser();
    await grantCredits(userId, 100);
    const { invoiceId } = await createCreditedInvoice({
      userId,
      invoiceAmount: 370,
      creditAmount: 20,
    });

    currentProfile.value = { id: userId, role: "user" };
    const asOwner = await invoiceActions.fetchInvoiceTenderSummary(invoiceId);

    currentProfile.value = { id: await createUser("admin"), role: "admin" };
    const asAdmin = await invoiceActions.fetchInvoiceTenderSummary(invoiceId);

    expect(asAdmin).toEqual(asOwner);
  });

  it("returns null for an invoice that does not exist", async () => {
    currentProfile.value = { id: await createUser("admin"), role: "admin" };
    expect(await invoiceActions.fetchInvoiceTenderSummary(-1)).toBeNull();
  });
});
