// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import {
  creditLedgerEntries,
  festivals,
  invoiceCreditAllocations,
  invoices,
  standReservations,
  stands,
  users,
} from "@/db/schema";

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

const pool = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl, max: 10 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type CreditService = typeof import("@/app/lib/credits/service");
let creditService: CreditService;

const createdUserIds: number[] = [];
const createdFestivalIds: number[] = [];

async function createUser() {
  const db = integrationDb!;
  const suffix = randomUUID();
  const [user] = await db
    .insert(users)
    .values({
      clerkId: `credit-settlement-${suffix}`,
      email: `credit-settlement-${suffix}@example.com`,
      displayName: "Credit Settlement",
      role: "user",
      status: "verified",
    })
    .returning({ id: users.id });
  createdUserIds.push(user!.id);
  return user!.id;
}

/**
 * A reservation with an invoice and a credit allocation against it — the shape
 * festival 490 produces when a participant puts part of their balance towards
 * a stand and owes the rest by QR.
 */
async function createCreditedInvoice(input: {
  userId: number;
  invoiceAmount: number;
  creditAmount: number;
}) {
  const db = integrationDb!;
  const [festival] = await db
    .insert(festivals)
    .values({ name: `Credit Settlement ${randomUUID()}` })
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
  // points at a real `spend` entry.
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
    spendLedgerEntryId: debit.data.ledgerEntryId,
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

async function ledgerBalance(userId: number) {
  const db = integrationDb!;
  const rows = await db
    .select({ amount: creditLedgerEntries.amount })
    .from(creditLedgerEntries)
    .where(eq(creditLedgerEntries.userId, userId));
  return rows.reduce((total, row) => total + Number(row.amount), 0);
}

describeDatabase("invoice credit release", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    creditService = await import("@/app/lib/credits/service");

    const db = integrationDb!;
    try {
      await db
        .select({ id: invoiceCreditAllocations.id })
        .from(invoiceCreditAllocations)
        .limit(1);
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("returns the credits to the account and marks the allocation reversed", async () => {
    const db = integrationDb!;
    const userId = await createUser();
    await grantCredits(userId, 100);

    const { invoiceId, allocationId } = await createCreditedInvoice({
      userId,
      invoiceAmount: 370,
      creditAmount: 20,
    });
    expect(await ledgerBalance(userId)).toBe(80);

    const release = await creditService.releaseInvoiceCreditAllocationsInTx(
      db as never,
      { invoiceId, idempotencyKey: randomUUID() },
    );

    expect(release.ok).toBe(true);
    if (!release.ok) return;
    expect(release.released).toHaveLength(1);
    expect(release.released[0]!.allocationId).toBe(allocationId);
    expect(release.released[0]!.amount).toBe(20);
    // The whole point: the participant has their credits back.
    expect(await ledgerBalance(userId)).toBe(100);
  });

  it("refuses a second release rather than refunding twice", async () => {
    const db = integrationDb!;
    const userId = await createUser();
    await grantCredits(userId, 100);
    const { invoiceId } = await createCreditedInvoice({
      userId,
      invoiceAmount: 370,
      creditAmount: 20,
    });

    const first = await creditService.releaseInvoiceCreditAllocationsInTx(
      db as never,
      { invoiceId, idempotencyKey: randomUUID() },
    );
    expect(first.ok).toBe(true);

    // A different key, the way a second click from a stale screen would arrive.
    const second = await creditService.releaseInvoiceCreditAllocationsInTx(
      db as never,
      { invoiceId, idempotencyKey: randomUUID() },
    );

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("CREDITS_ALREADY_RELEASED");
    expect(await ledgerBalance(userId)).toBe(100);
  });

  it("replays the same idempotency key without a second refund", async () => {
    const db = integrationDb!;
    const userId = await createUser();
    await grantCredits(userId, 100);
    const { invoiceId } = await createCreditedInvoice({
      userId,
      invoiceAmount: 370,
      creditAmount: 20,
    });

    const key = randomUUID();
    await creditService.releaseInvoiceCreditAllocationsInTx(db as never, {
      invoiceId,
      idempotencyKey: key,
    });
    const replay = await creditService.releaseInvoiceCreditAllocationsInTx(
      db as never,
      { invoiceId, idempotencyKey: key },
    );

    expect(replay.ok).toBe(false);
    expect(await ledgerBalance(userId)).toBe(100);
  });

  it("reports nothing to release on an invoice with no allocations", async () => {
    const db = integrationDb!;
    const userId = await createUser();
    await grantCredits(userId, 100);
    const { invoiceId } = await createCreditedInvoice({
      userId,
      invoiceAmount: 370,
      creditAmount: 20,
    });

    await db
      .delete(invoiceCreditAllocations)
      .where(eq(invoiceCreditAllocations.invoiceId, invoiceId));

    const result = await creditService.releaseInvoiceCreditAllocationsInTx(
      db as never,
      { invoiceId, idempotencyKey: randomUUID() },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("CREDITS_NOT_RELEASABLE");
  });

  it("excludes a released allocation from the invoice tender", async () => {
    const db = integrationDb!;
    const userId = await createUser();
    await grantCredits(userId, 100);
    const { invoiceId } = await createCreditedInvoice({
      userId,
      invoiceAmount: 370,
      creditAmount: 20,
    });

    const { computeInvoiceTender } = await import("@/app/lib/payments/tender");
    const readAllocations = async () =>
      db
        .select({
          amount: invoiceCreditAllocations.amount,
          reversed: sql<boolean>`EXISTS (
            SELECT 1 FROM ${creditLedgerEntries} r
            WHERE r.reverses_entry_id = ${invoiceCreditAllocations.ledgerEntryId}
          )`,
        })
        .from(invoiceCreditAllocations)
        .where(eq(invoiceCreditAllocations.invoiceId, invoiceId));

    const before = computeInvoiceTender({
      amount: 370,
      allocations: (await readAllocations()).map((row) => ({
        amount: row.amount,
        reversed: Boolean(row.reversed),
      })),
      payments: [],
      submissions: [],
    });
    expect(before.confirmedCreditAmount).toBe(20);
    expect(before.outstandingAmount).toBe(350);

    await creditService.releaseInvoiceCreditAllocationsInTx(db as never, {
      invoiceId,
      idempotencyKey: randomUUID(),
    });

    const after = computeInvoiceTender({
      amount: 370,
      allocations: (await readAllocations()).map((row) => ({
        amount: row.amount,
        reversed: Boolean(row.reversed),
      })),
      payments: [],
      submissions: [],
    });
    expect(after.confirmedCreditAmount).toBe(0);
    expect(after.outstandingAmount).toBe(370);
  });
});
