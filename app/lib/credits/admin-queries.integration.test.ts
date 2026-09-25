// @vitest-environment node

import { randomUUID } from "crypto";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import {
  creditAccounts,
  creditHolds,
  creditLedgerEntries,
  creditTopUps,
  festivals,
  invoiceCreditAllocations,
  invoices,
  reservationFeatureActions,
  standReservations,
  stands,
  users,
} from "@/db/schema";

const currentProfileMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 3 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type AdminQueries = typeof import("@/app/lib/credits/admin-queries");
let queries: AdminQueries;

/** Every fixture email carries it, so a search isolates this file's accounts. */
const tag = `credit-admin-${randomUUID().slice(0, 8)}`;
const created = {
  userIds: [] as number[],
  festivalIds: [] as number[],
  standIds: [] as number[],
  reservationIds: [] as number[],
  invoiceIds: [] as number[],
};

async function createUser(name: string, role: "user" | "admin" = "user") {
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `${tag}-${name}`,
      email: `${tag}-${name}@example.com`,
      displayName: `${name} ${tag}`,
      role,
      status: "verified",
    })
    .returning({ id: users.id });
  created.userIds.push(user!.id);
  return user!.id;
}

async function post(
  values: Omit<typeof creditLedgerEntries.$inferInsert, "idempotencyKey">,
) {
  const [entry] = await integrationDb!
    .insert(creditLedgerEntries)
    .values({ ...values, idempotencyKey: randomUUID() })
    .returning({ id: creditLedgerEntries.id });
  return entry!.id;
}

async function topUp(
  userId: number,
  amount: number,
  status: "under_review" | "approved" | "rejected" | "awaiting_voucher",
  reviewedByUserId?: number,
  purpose: Pick<
    typeof creditTopUps.$inferInsert,
    "intendedUseType" | "intendedUseId" | "intendedFeatureType"
  > = { intendedUseType: "debt" },
) {
  const now = new Date();
  const [row] = await integrationDb!
    .insert(creditTopUps)
    .values({
      userId,
      amount,
      status,
      ...purpose,
      uploadDeadlineAt: new Date(now.getTime() + 10 * 60 * 1000),
      voucherUrl: status === "awaiting_voucher" ? null : "https://x/v.png",
      submittedAt: status === "awaiting_voucher" ? null : now,
      reviewedAt: reviewedByUserId ? now : null,
      reviewedByUserId: reviewedByUserId ?? null,
      idempotencyKey: randomUUID(),
    })
    .returning({ id: creditTopUps.id });
  return row!.id;
}

async function featureAction(
  userId: number,
  festivalId: number,
  type: "full_table_access" | "late_partner",
  reservationId?: number,
) {
  const [row] = await integrationDb!
    .insert(reservationFeatureActions)
    .values({
      festivalId,
      ownerUserId: userId,
      type,
      featurePriceSnapshot: 10,
      reservationId: reservationId ?? null,
    })
    .returning({ id: reservationFeatureActions.id });
  return row!.id;
}

async function setCachedBalance(userId: number, cachedBalance: number) {
  await integrationDb!.insert(creditAccounts).values({ userId, cachedBalance });
}

const ids = {} as {
  admin: number;
  ana: number;
  beto: number;
  caro: number;
  dani: number;
  festival: number;
  reservation: number;
  invoice: number;
  anaTopUp: number;
  anaPendingTopUp: number;
  caroFeatureTopUp: number;
  anaInvoiceSpend: number;
  anaRefund: number;
  anaFeatureSpend: number;
  anaGrant: number;
  betoReversal: number;
  betoResolution: number;
  caroDeduction: number;
  caroRevert: number;
};

let overviewBefore: NonNullable<
  Awaited<ReturnType<AdminQueries["fetchCreditOverview"]>>
>;

/**
 * The admin credit reads (dashboard/credits).
 *
 * The fixture is inserted directly rather than through the services: what is
 * under test is how existing ledger rows are classified and totalled, and
 * each account below covers kinds the services only produce after long flows.
 */
describeDatabase("admin credit queries", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    queries = await import("@/app/lib/credits/admin-queries");

    const db = integrationDb!;
    ids.admin = await createUser("admin", "admin");
    currentProfileMock.mockResolvedValue({ id: ids.admin, role: "admin" });
    overviewBefore = (await queries.fetchCreditOverview())!;

    ids.ana = await createUser("ana");
    ids.beto = await createUser("beto");
    ids.caro = await createUser("caro");
    ids.dani = await createUser("dani");

    const [festival] = await db
      .insert(festivals)
      .values({ name: `Festival ${tag}` })
      .returning({ id: festivals.id });
    ids.festival = festival!.id;
    created.festivalIds.push(ids.festival);
    const [stand] = await db
      .insert(stands)
      .values({ standNumber: 1 })
      .returning({ id: stands.id });
    created.standIds.push(stand!.id);
    const [reservation] = await db
      .insert(standReservations)
      .values({ standId: stand!.id, festivalId: ids.festival })
      .returning({ id: standReservations.id });
    ids.reservation = reservation!.id;
    created.reservationIds.push(ids.reservation);
    const [invoice] = await db
      .insert(invoices)
      .values({
        amount: 200,
        date: new Date(),
        userId: ids.ana,
        reservationId: ids.reservation,
      })
      .returning({ id: invoices.id });
    ids.invoice = invoice!.id;
    created.invoiceIds.push(ids.invoice);

    // Ana: bought 100, paid 40 on an invoice that was later cancelled and
    // refunded, spent 30 on a partner, was granted 20, and holds 10.
    // Balance 90, spendable 80. A second voucher, for 30 towards the
    // invoice, is still under review and arrived before any of her spends.
    ids.anaPendingTopUp = await topUp(ids.ana, 30, "under_review", undefined, {
      intendedUseType: "invoice",
      intendedUseId: ids.invoice,
    });
    const anaTopUp = await topUp(ids.ana, 100, "approved", ids.admin);
    ids.anaTopUp = await post({
      userId: ids.ana,
      amount: 100,
      type: "top_up",
      topUpId: anaTopUp,
      createdAt: new Date("2026-01-10T15:00:00Z"),
    });
    ids.anaInvoiceSpend = await post({
      userId: ids.ana,
      amount: -40,
      type: "spend",
    });
    await db.insert(invoiceCreditAllocations).values({
      invoiceId: ids.invoice,
      userId: ids.ana,
      amount: 40,
      ledgerEntryId: ids.anaInvoiceSpend,
      idempotencyKey: randomUUID(),
    });
    ids.anaRefund = await post({
      userId: ids.ana,
      amount: 40,
      type: "admin_adjustment",
      reversesEntryId: ids.anaInvoiceSpend,
    });
    const partner = await featureAction(
      ids.ana,
      ids.festival,
      "late_partner",
      ids.reservation,
    );
    ids.anaFeatureSpend = await post({
      userId: ids.ana,
      amount: -30,
      type: "spend",
      featureActionId: partner,
    });
    ids.anaGrant = await post({
      userId: ids.ana,
      amount: 20,
      type: "admin_grant",
      metadata: { reason: "compensación", adminUserId: String(ids.admin) },
    });
    const table = await featureAction(
      ids.ana,
      ids.festival,
      "full_table_access",
    );
    await db.insert(creditHolds).values({
      userId: ids.ana,
      festivalId: ids.festival,
      amount: 10,
      purpose: "full_table_access",
      featureActionId: table,
      idempotencyKey: randomUUID(),
    });
    await setCachedBalance(ids.ana, 90);

    // Beto: a rejected voucher after spending 20 of it, then 5 waived.
    // Balance -15.
    const betoTopUp = await topUp(ids.beto, 50, "rejected", ids.admin);
    await post({
      userId: ids.beto,
      amount: 50,
      type: "top_up",
      topUpId: betoTopUp,
    });
    await post({
      userId: ids.beto,
      amount: -20,
      type: "spend",
      featureActionId: await featureAction(
        ids.beto,
        ids.festival,
        "late_partner",
      ),
    });
    ids.betoReversal = await post({
      userId: ids.beto,
      amount: -50,
      type: "reversal",
      topUpId: betoTopUp,
      metadata: { reason: "comprobante ilegible" },
    });
    ids.betoResolution = await post({
      userId: ids.beto,
      amount: 5,
      type: "admin_adjustment",
      metadata: {
        reason: "acordado",
        resolution: "waive",
        reviewerUserId: String(ids.admin),
      },
    });
    await setCachedBalance(ids.beto, -15);

    // Caro: 25 still under review, and a discount that was undone. The
    // projection is deliberately wrong. Balance 25.
    const caroTopUp = await topUp(ids.caro, 25, "under_review");
    await post({
      userId: ids.caro,
      amount: 25,
      type: "top_up",
      topUpId: caroTopUp,
    });
    ids.caroDeduction = await post({
      userId: ids.caro,
      amount: -5,
      type: "admin_adjustment",
      metadata: { reason: "error", adminUserId: String(ids.admin) },
    });
    ids.caroRevert = await post({
      userId: ids.caro,
      amount: 5,
      type: "admin_grant",
      reversesEntryId: ids.caroDeduction,
      metadata: { reason: `Reversión del movimiento #${ids.caroDeduction}` },
    });
    await setCachedBalance(ids.caro, 999);
    // An approved purchase for a feature at the festival, which reaches the
    // festival through the purchase rather than a reservation.
    ids.caroFeatureTopUp = await topUp(ids.caro, 40, "approved", ids.admin, {
      intendedUseType: "feature",
      intendedUseId: ids.festival,
      intendedFeatureType: "late_partner",
    });

    // Dani: opened a purchase and has not paid it. No ledger entry at all.
    await topUp(ids.dani, 15, "awaiting_voucher");
  }, 60_000);

  afterAll(async () => {
    const db = integrationDb!;
    try {
      if (created.userIds.length > 0) {
        await db
          .delete(invoiceCreditAllocations)
          .where(inArray(invoiceCreditAllocations.userId, created.userIds));
        await db
          .delete(creditHolds)
          .where(inArray(creditHolds.userId, created.userIds));
        // The ledger is append-only, enforced by a trigger. Fixtures are the
        // one thing allowed to undo that: dropped for the delete and restored
        // straight after, as the other credit suites do.
        const client = await pool!.connect();
        try {
          await client.query(
            "ALTER TABLE credit_ledger_entries DISABLE TRIGGER credit_ledger_entries_append_only",
          );
          // Reversals first: `reverses_entry_id` is a restricting self-reference.
          await client.query(
            `DELETE FROM credit_ledger_entries WHERE user_id = ANY($1::int[]) AND reverses_entry_id IS NOT NULL`,
            [created.userIds],
          );
          await client.query(
            `DELETE FROM credit_ledger_entries WHERE user_id = ANY($1::int[])`,
            [created.userIds],
          );
        } finally {
          await client.query(
            "ALTER TABLE credit_ledger_entries ENABLE TRIGGER credit_ledger_entries_append_only",
          );
          client.release();
        }
        await db
          .delete(creditTopUps)
          .where(inArray(creditTopUps.userId, created.userIds));
        await db
          .delete(reservationFeatureActions)
          .where(
            inArray(reservationFeatureActions.ownerUserId, created.userIds),
          );
        await db
          .delete(creditAccounts)
          .where(inArray(creditAccounts.userId, created.userIds));
      }
      if (created.invoiceIds.length > 0) {
        await db
          .delete(invoices)
          .where(inArray(invoices.id, created.invoiceIds));
      }
      if (created.reservationIds.length > 0) {
        await db
          .delete(standReservations)
          .where(inArray(standReservations.id, created.reservationIds));
      }
      if (created.standIds.length > 0) {
        await db.delete(stands).where(inArray(stands.id, created.standIds));
      }
      if (created.userIds.length > 0) {
        await db.delete(users).where(inArray(users.id, created.userIds));
      }
      if (created.festivalIds.length > 0) {
        await db
          .delete(festivals)
          .where(inArray(festivals.id, created.festivalIds));
      }
    } finally {
      await pool?.end();
    }
  });

  it("refuses anyone who is not an admin", async () => {
    currentProfileMock.mockResolvedValueOnce({ id: ids.ana, role: "user" });
    await expect(queries.fetchCreditAccounts({ query: tag })).resolves.toBe(
      null,
    );
    currentProfileMock.mockResolvedValueOnce({ id: ids.ana, role: "user" });
    await expect(queries.fetchCreditLedger({ query: tag })).resolves.toBe(null);
  });

  it("lists every account that touched credits, with balances and lifetime flows", async () => {
    const page = (await queries.fetchCreditAccounts({ query: tag }))!;

    // The admin never touched credits, so has no account row.
    expect(page.total).toBe(4);
    expect(page.balanceTotal).toBe(100);
    expect(page.rows.map((row) => row.user.id)).toEqual([
      ids.ana,
      ids.caro,
      ids.dani,
      ids.beto,
    ]);

    const byUser = new Map(page.rows.map((row) => [row.user.id, row]));
    expect(byUser.get(ids.ana)).toMatchObject({
      balances: {
        ledgerBalance: 90,
        activeHolds: 10,
        spendableBalance: 80,
        underReviewIssuance: 30,
      },
      underReviewCount: 1,
      purchased: 100,
      reversed: 0,
      // Net of the 40 handed back when the invoice was cancelled.
      spent: 30,
      adminNet: 20,
      hasDrift: false,
    });
    expect(byUser.get(ids.beto)).toMatchObject({
      balances: { ledgerBalance: -15 },
      purchased: 50,
      reversed: -50,
      spent: 20,
      adminNet: 5,
      hasDrift: false,
    });
    expect(byUser.get(ids.caro)).toMatchObject({
      balances: { ledgerBalance: 25, underReviewIssuance: 25 },
      underReviewCount: 1,
      cachedBalance: 999,
      hasDrift: true,
    });
    expect(byUser.get(ids.dani)).toMatchObject({
      balances: { ledgerBalance: 0 },
      cachedBalance: null,
      hasDrift: false,
    });
    expect(byUser.get(ids.dani)!.lastActivityAt).toBeInstanceOf(Date);

    for (const row of page.rows) {
      expect(
        row.purchased + row.reversed - row.spent + row.adminNet,
      ).toBeCloseTo(row.balances.ledgerBalance, 2);
    }
  });

  it.each([
    ["positive", () => [ids.ana, ids.caro]],
    ["debt", () => [ids.beto]],
    ["zero", () => [ids.dani]],
    ["holds", () => [ids.ana]],
    ["review", () => [ids.ana, ids.caro]],
    ["drift", () => [ids.caro]],
  ] as const)("filters accounts by %s", async (filter, expected) => {
    const page = (await queries.fetchCreditAccounts({ query: tag, filter }))!;
    expect(page.rows.map((row) => row.user.id).sort()).toEqual(
      [...expected()].sort(),
    );
    expect(page.total).toBe(expected().length);
  });

  it("sorts and paginates accounts", async () => {
    const ascending = (await queries.fetchCreditAccounts({
      query: tag,
      sort: "balance",
      direction: "asc",
      limit: 2,
      offset: 1,
    }))!;
    expect(ascending.rows.map((row) => row.user.id)).toEqual([
      ids.dani,
      ids.caro,
    ]);
    expect(ascending.total).toBe(4);

    const bySpent = (await queries.fetchCreditAccounts({
      query: tag,
      sort: "spent",
    }))!;
    expect(bySpent.rows[0]!.user.id).toBe(ids.ana);
  });

  it("finds an account by user id", async () => {
    const detail = (await queries.fetchCreditAccountDetail(ids.beto))!;
    expect(detail.subject.email).toBe(`${tag}-beto@example.com`);
    expect(detail.account?.balances.ledgerBalance).toBe(-15);

    const stranger = (await queries.fetchCreditAccountDetail(ids.admin))!;
    expect(stranger.account).toBeNull();
  });

  it("labels every entry by what it means", async () => {
    const page = (await queries.fetchCreditLedger({ query: tag, limit: 100 }))!;
    const byId = new Map(page.rows.map((row) => [row.id, row]));

    expect(page.total).toBe(12);
    expect(page.creditsIn).toBe(245);
    expect(page.creditsOut).toBe(-145);

    expect(byId.get(ids.anaTopUp)).toMatchObject({
      kind: "purchase",
      topUp: { status: "approved", voucherUrl: "https://x/v.png" },
    });
    expect(byId.get(ids.anaInvoiceSpend)).toMatchObject({
      kind: "spend",
      invoice: { id: ids.invoice, reservationId: ids.reservation },
      festival: { id: ids.festival },
    });
    // The refund carries no allocation; its invoice comes from the spend.
    expect(byId.get(ids.anaRefund)).toMatchObject({
      kind: "refund",
      invoice: { id: ids.invoice },
      festival: { id: ids.festival },
      reversesEntryId: ids.anaInvoiceSpend,
    });
    expect(byId.get(ids.anaInvoiceSpend)!.isReverted).toBe(true);
    expect(byId.get(ids.anaFeatureSpend)).toMatchObject({
      kind: "spend",
      featureAction: { type: "late_partner", reservationId: ids.reservation },
      festival: { id: ids.festival },
      actor: null,
    });
    expect(byId.get(ids.anaGrant)).toMatchObject({
      kind: "grant",
      reason: "compensación",
      actor: { id: ids.admin },
    });
    expect(byId.get(ids.betoReversal)).toMatchObject({
      kind: "voucher_reversal",
      reason: "comprobante ilegible",
      topUp: { status: "rejected" },
      actor: { id: ids.admin },
    });
    expect(byId.get(ids.betoResolution)).toMatchObject({
      kind: "debt_resolution",
      resolution: "waive",
      actor: { id: ids.admin },
    });
    expect(byId.get(ids.caroDeduction)).toMatchObject({
      kind: "deduction",
      isReverted: true,
    });
    expect(byId.get(ids.caroRevert)).toMatchObject({
      kind: "revert",
      reversesEntryId: ids.caroDeduction,
      isReverted: false,
    });
  });

  it("filters the ledger by kind, person, festival and Bolivian calendar day", async () => {
    const spends = (await queries.fetchCreditLedger({
      query: tag,
      kinds: ["spend", "refund"],
    }))!;
    expect(spends.total).toBe(4);
    expect(spends.creditsOut).toBe(-90);
    expect(spends.creditsIn).toBe(40);

    const beto = (await queries.fetchCreditLedger({ userId: ids.beto }))!;
    expect(beto.total).toBe(4);
    expect(beto.rows.every((row) => row.user.id === ids.beto)).toBe(true);

    const atFestival = (await queries.fetchCreditLedger({
      festivalId: ids.festival,
    }))!;
    expect(atFestival.rows.map((row) => row.id).sort()).toEqual(
      [ids.anaInvoiceSpend, ids.anaRefund, ids.anaFeatureSpend]
        .concat(
          beto.rows.filter((row) => row.kind === "spend").map((row) => row.id),
        )
        .sort(),
    );

    // 15:00 UTC on 10 January is 11:00 in La Paz, inside that local day.
    const onTheDay = (await queries.fetchCreditLedger({
      userId: ids.ana,
      from: "2026-01-10",
      to: "2026-01-10",
    }))!;
    expect(onTheDay.rows.map((row) => row.id)).toEqual([ids.anaTopUp]);
    const dayAfter = (await queries.fetchCreditLedger({
      userId: ids.ana,
      from: "2026-01-11",
      to: "2026-01-11",
    }))!;
    expect(dayAfter.total).toBe(0);
  });

  it("totals the overview across every account", async () => {
    const after = (await queries.fetchCreditOverview())!;
    const delta = (pick: (o: typeof after) => number) =>
      Math.round((pick(after) - pick(overviewBefore)) * 100) / 100;

    expect(delta((o) => o.outstanding)).toBe(115);
    expect(delta((o) => o.holderCount)).toBe(2);
    expect(delta((o) => o.debtTotal)).toBe(15);
    expect(delta((o) => o.debtorCount)).toBe(1);
    expect(delta((o) => o.activeHolds.amount)).toBe(10);
    expect(delta((o) => o.underReview.amount)).toBe(55);
    expect(delta((o) => o.underReview.count)).toBe(2);
    expect(delta((o) => o.awaitingVoucherCount)).toBe(1);
    expect(delta((o) => o.driftCount)).toBe(1);
    expect(delta((o) => o.lifetime.purchase.amount)).toBe(175);
    expect(delta((o) => o.lifetime.spend.amount)).toBe(-90);
    expect(delta((o) => o.lifetime.refund.amount)).toBe(40);
    expect(delta((o) => o.lifetime.grant.amount)).toBe(20);
    expect(delta((o) => o.lifetime.voucher_reversal.amount)).toBe(-50);
    expect(delta((o) => o.lifetime.debt_resolution.amount)).toBe(5);
    expect(delta((o) => o.lifetime.deduction.amount)).toBe(-5);
    expect(delta((o) => o.lifetime.revert.amount)).toBe(5);
    // Ana's purchase is dated January, outside the recent window.
    expect(delta((o) => o.recent.purchase.amount)).toBe(75);

    const attention = await queries.fetchCreditAttentionCounts();
    expect(attention.pendingReviews).toBeGreaterThanOrEqual(1);
    expect(attention.debtAccounts).toBeGreaterThanOrEqual(1);
  });

  it("lists every purchase one account opened, paid or not", async () => {
    const beto = (await queries.fetchCreditPurchases({
      userId: ids.beto,
      status: "all",
    }))!;
    expect(beto.rows).toHaveLength(1);
    expect(beto.rows[0]).toMatchObject({
      status: "rejected",
      amount: 50,
      reviewerName: `admin ${tag}`,
    });

    const dani = (await queries.fetchCreditPurchases({
      userId: ids.dani,
      status: "all",
    }))!;
    expect(dani.rows.map((row) => row.status)).toEqual(["awaiting_voucher"]);
    const later = new Date(Date.now() + 60 * 60 * 1000);
    const expired = (await queries.fetchCreditPurchases(
      { userId: ids.dani, status: "all" },
      later,
    ))!;
    expect(expired.rows.map((row) => row.status)).toEqual(["expired"]);
  });

  it("queues vouchers oldest first, with what rejecting each would cost", async () => {
    const page = (await queries.fetchCreditPurchases({ query: tag }))!;

    expect(page.rows.map((row) => row.id)).toEqual([
      ids.anaPendingTopUp,
      page.rows[1]!.id,
    ]);
    expect(page.rows[1]!.user.id).toBe(ids.caro);
    expect(page.total).toBe(2);
    expect(page.totalAmount).toBe(55);
    expect(page.counts).toEqual({
      under_review: 2,
      awaiting_voucher: 1,
      approved: 2,
      rejected: 1,
      expired: 0,
      all: 6,
    });

    // Ana spent 70 after this voucher arrived; the 40 handed back later is a
    // refund, not a spend, and does not reduce what she used.
    expect(page.rows[0]).toMatchObject({
      status: "under_review",
      intendedUseType: "invoice",
      invoice: { id: ids.invoice, reservationId: ids.reservation },
      festival: { id: ids.festival },
      review: {
        ledgerBalance: 90,
        balanceAfterReversal: 60,
        spentSinceSubmission: 70,
      },
    });
    expect(page.rows[1]!.review).toEqual({
      ledgerBalance: 25,
      balanceAfterReversal: 0,
      spentSinceSubmission: 0,
    });
  });

  it("reads decided purchases newest first, with who decided", async () => {
    const approved = (await queries.fetchCreditPurchases({
      query: tag,
      status: "approved",
    }))!;
    expect(approved.rows).toHaveLength(2);
    for (const row of approved.rows) {
      expect(row.reviewerName).toBe(`admin ${tag}`);
      expect(row.review).toBeNull();
    }
    expect(
      approved.rows.find((row) => row.id === ids.caroFeatureTopUp),
    ).toMatchObject({
      intendedUseType: "feature",
      featureType: "late_partner",
      festival: { id: ids.festival },
      invoice: null,
    });

    const rejected = (await queries.fetchCreditPurchases({
      query: tag,
      status: "rejected",
    }))!;
    expect(rejected.rows.map((row) => row.user.id)).toEqual([ids.beto]);
  });

  it("filters purchases by purpose, festival, number and arrival day", async () => {
    const byPurpose = (await queries.fetchCreditPurchases({
      query: tag,
      status: "all",
      purpose: "invoice",
    }))!;
    expect(byPurpose.rows.map((row) => row.id)).toEqual([ids.anaPendingTopUp]);

    const atFestival = (await queries.fetchCreditPurchases({
      status: "all",
      festivalId: ids.festival,
    }))!;
    expect(atFestival.rows.map((row) => row.id).sort()).toEqual(
      [ids.anaPendingTopUp, ids.caroFeatureTopUp].sort(),
    );

    const byNumber = (await queries.fetchCreditPurchases({
      status: "all",
      query: `#${ids.caroFeatureTopUp}`,
    }))!;
    expect(byNumber.rows.map((row) => row.id)).toContain(ids.caroFeatureTopUp);

    const longAgo = (await queries.fetchCreditPurchases({
      query: tag,
      status: "all",
      from: "2020-01-01",
      to: "2020-01-31",
    }))!;
    expect(longAgo.total).toBe(0);
    expect(longAgo.counts.all).toBe(0);
  });

  it("treats an unpaid purchase past its window as expired", async () => {
    const later = new Date(Date.now() + 60 * 60 * 1000);
    const page = (await queries.fetchCreditPurchases(
      { query: tag, status: "expired" },
      later,
    ))!;
    expect(page.rows.map((row) => row.user.id)).toEqual([ids.dani]);
    expect(page.counts.awaiting_voucher).toBe(0);
    expect(page.counts.expired).toBe(1);
  });

  it("refuses the purchase list to a participant", async () => {
    currentProfileMock.mockResolvedValueOnce({ id: ids.ana, role: "user" });
    await expect(queries.fetchCreditPurchases({ query: tag })).resolves.toBe(
      null,
    );
  });
});
