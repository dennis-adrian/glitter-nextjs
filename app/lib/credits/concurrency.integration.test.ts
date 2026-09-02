// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import {
  creditAccounts,
  creditHolds,
  creditLedgerEntries,
  creditTopUps,
  festivals,
  reservationFeatureActions,
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

type Service = typeof import("@/app/lib/credits/service");
let service: Service;

const createdUserIds: number[] = [];
const createdFestivalIds: number[] = [];

async function createUser() {
  const db = integrationDb!;
  const suffix = randomUUID();
  const [user] = await db
    .insert(users)
    .values({
      clerkId: `credit-concurrency-${suffix}`,
      email: `credit-concurrency-${suffix}@example.com`,
      displayName: "Credit Concurrency",
      role: "user",
      status: "verified",
    })
    .returning({ id: users.id });
  createdUserIds.push(user!.id);
  return user!.id;
}

async function createFestival() {
  const db = integrationDb!;
  const [festival] = await db
    .insert(festivals)
    .values({ name: `Credit Concurrency ${randomUUID()}` })
    .returning({ id: festivals.id });
  createdFestivalIds.push(festival!.id);
  return festival!.id;
}

async function createFeatureAction(userId: number, festivalId: number) {
  const db = integrationDb!;
  const [action] = await db
    .insert(reservationFeatureActions)
    .values({
      festivalId,
      ownerUserId: userId,
      type: "full_table_access",
      featurePriceSnapshot: 10,
    })
    .returning({ id: reservationFeatureActions.id });
  return action!.id;
}

/** Posts starting credit without going through a voucher. */
async function grantCredits(userId: number, amount: number) {
  const result = await service.adjustCreditAccount({
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

describeDatabase("credit mutation concurrency", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    service = await import("@/app/lib/credits/service");

    const db = integrationDb!;
    const probe = await db.select({ id: users.id }).from(users).limit(1);
    if (!probe) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
  }, 60_000);

  afterEach(async () => {
    const db = integrationDb!;
    if (createdUserIds.length > 0) {
      await db
        .delete(creditHolds)
        .where(inArray(creditHolds.userId, createdUserIds));
      // The ledger is append-only in production, enforced by a trigger. Test
      // fixtures are the one thing allowed to undo that, and only here: the
      // trigger is dropped for the delete and restored immediately after, so
      // no test can accidentally run against a database without it.
      const client = await pool!.connect();
      try {
        await client.query(
          "ALTER TABLE credit_ledger_entries DISABLE TRIGGER credit_ledger_entries_append_only",
        );
        await client.query(
          `DELETE FROM credit_ledger_entries WHERE user_id = ANY($1::int[])`,
          [createdUserIds],
        );
      } finally {
        await client.query(
          "ALTER TABLE credit_ledger_entries ENABLE TRIGGER credit_ledger_entries_append_only",
        );
        client.release();
      }
      await db
        .delete(creditTopUps)
        .where(inArray(creditTopUps.userId, createdUserIds));
      await db
        .delete(reservationFeatureActions)
        .where(inArray(reservationFeatureActions.ownerUserId, createdUserIds));
      await db
        .delete(creditAccounts)
        .where(inArray(creditAccounts.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
      createdUserIds.length = 0;
    }
    if (createdFestivalIds.length > 0) {
      await db
        .delete(festivals)
        .where(inArray(festivals.id, createdFestivalIds));
      createdFestivalIds.length = 0;
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  /**
   * Verified by mutation on 2026-09-02: removing both the user lock and the
   * credit-account lock from `spendCreditsForFeature` makes all three spends
   * succeed and this test fail. Removing only the account lock changes
   * nothing — the user row lock taken first is what actually serializes
   * credit mutations, so this asserts serialization, not which lock provides
   * it.
   */
  it("never lets concurrent feature spends exceed the spendable balance", async () => {
    const userId = await createUser();
    const festivalId = await createFestival();
    await grantCredits(userId, 100);

    // Three actions, 40 each: the balance funds two, never three.
    const actionIds = await Promise.all([
      createFeatureAction(userId, festivalId),
      createFeatureAction(userId, festivalId),
      createFeatureAction(userId, festivalId),
    ]);

    const results = await Promise.all(
      actionIds.map((featureActionId) =>
        service.spendCreditsForFeature({
          userId,
          featureActionId,
          amount: 40,
          idempotencyKey: randomUUID(),
        }),
      ),
    );

    const succeeded = results.filter((result) => result.ok);
    expect(succeeded).toHaveLength(2);
    for (const failed of results.filter((result) => !result.ok)) {
      expect(failed).toMatchObject({ code: "INSUFFICIENT_CREDITS" });
    }
    expect(await ledgerBalance(userId)).toBe(20);
  }, 30_000);

  it("issues credits once when the same voucher upload lands twice", async () => {
    const userId = await createUser();
    const created = await service.createCreditTopUpForRequirement({
      userId,
      amount: 60,
      intendedUseType: "feature",
      idempotencyKey: randomUUID(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const fileKey = `concurrency-${randomUUID()}`;
    const results = await Promise.all([
      service.submitCreditTopUpVoucher({
        topUpId: created.data.id,
        userId,
        voucherUrl: "https://utfs.io/f/one",
        fileKey,
      }),
      service.submitCreditTopUpVoucher({
        topUpId: created.data.id,
        userId,
        voucherUrl: "https://utfs.io/f/one",
        fileKey,
      }),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(await ledgerBalance(userId)).toBe(60);
    const db = integrationDb!;
    const issues = await db
      .select({ id: creditLedgerEntries.id })
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.userId, userId));
    expect(issues).toHaveLength(1);
  }, 30_000);

  it("reverses a rejected top-up exactly once under concurrent review", async () => {
    const userId = await createUser();
    const reviewerId = await createUser();
    const created = await service.createCreditTopUpForRequirement({
      userId,
      amount: 75,
      intendedUseType: "feature",
      idempotencyKey: randomUUID(),
    });
    if (!created.ok) throw new Error("fixture top-up failed");
    await service.submitCreditTopUpVoucher({
      topUpId: created.data.id,
      userId,
      voucherUrl: "https://utfs.io/f/two",
      fileKey: `concurrency-${randomUUID()}`,
    });
    expect(await ledgerBalance(userId)).toBe(75);

    await Promise.all([
      service.reviewCreditTopUp({
        topUpId: created.data.id,
        reviewerUserId: reviewerId,
        decision: "rejected",
        rejectionReason: "duplicate review a",
      }),
      service.reviewCreditTopUp({
        topUpId: created.data.id,
        reviewerUserId: reviewerId,
        decision: "rejected",
        rejectionReason: "duplicate review b",
      }),
    ]);

    const db = integrationDb!;
    const mine = await db
      .select({
        type: creditLedgerEntries.type,
        amount: creditLedgerEntries.amount,
      })
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.userId, userId));
    // Exactly the issuance and one reversal — never a second reversal.
    expect(mine).toHaveLength(2);
    expect(mine.filter((row) => row.type === "reversal")).toHaveLength(1);
    expect(await ledgerBalance(userId)).toBe(0);
  }, 30_000);

  it("keeps provisional credits out of an invoice while a hold reduces only spendable", async () => {
    const userId = await createUser();
    const festivalId = await createFestival();
    await grantCredits(userId, 100);
    const featureActionId = await createFeatureAction(userId, festivalId);

    const hold = await service.createCreditHoldForFeature({
      userId,
      festivalId,
      featureActionId,
      amount: 30,
      idempotencyKey: randomUUID(),
    });
    expect(hold.ok).toBe(true);
    if (!hold.ok) return;

    expect(hold.data.balances).toMatchObject({
      ledgerBalance: 100,
      activeHolds: 30,
      spendableBalance: 70,
      invoiceEligibleBalance: 70,
    });
    // The hold is an earmark, not a debit: the ledger is untouched.
    expect(await ledgerBalance(userId)).toBe(100);
  }, 30_000);

  it("never credits more than the debt under concurrent resolution", async () => {
    const userId = await createUser();
    const reviewerId = await createUser();
    const festivalId = await createFestival();
    await grantCredits(userId, 50);
    const featureActionId = await createFeatureAction(userId, festivalId);
    await service.spendCreditsForFeature({
      userId,
      featureActionId,
      amount: 50,
      idempotencyKey: randomUUID(),
    });
    // Reverse the grant so the account lands in debt, as a rejection would.
    await service.adjustCreditAccount({
      userId,
      amount: -30,
      reason: "integration fixture reversal",
      idempotencyKey: randomUUID(),
    });
    expect(await ledgerBalance(userId)).toBe(-30);

    const results = await Promise.all([
      service.resolveCreditDebt({
        userId,
        amount: 30,
        resolution: "waive",
        reason: "concurrent a",
        reviewerUserId: reviewerId,
        idempotencyKey: randomUUID(),
      }),
      service.resolveCreditDebt({
        userId,
        amount: 30,
        resolution: "mark_paid",
        reason: "concurrent b",
        reviewerUserId: reviewerId,
        idempotencyKey: randomUUID(),
      }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    // Never positive: the second resolution cannot gift spendable credit.
    expect(await ledgerBalance(userId)).toBe(0);
  }, 30_000);
});
