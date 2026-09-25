import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias, type PgSelect } from "drizzle-orm/pg-core";
import { DateTime } from "luxon";

import type {
  CreditAccountFilter,
  CreditAccountSort,
  CreditLedgerKind,
} from "@/app/lib/credits/admin-definitions";
import {
  calculateCreditBalances,
  type CreditBalances,
} from "@/app/lib/credits/balances";
import type { CreditTopUpDisplayStatus } from "@/app/lib/credits/queries";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { roundMoney } from "@/app/lib/reservations/money";
import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { getUserName } from "@/app/lib/users/utils";
import { db } from "@/db";
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
  users,
} from "@/db/schema";

/**
 * Admin reads for the credits section of the dashboard: the totals, every
 * account's balance, and the full ledger across participants.
 *
 * Plain reads, like the wallet: the ledger is append-only and nothing here
 * expires, posts or corrects anything. Every exported fetch checks the viewer
 * itself, so a page that forgets its own guard still leaks nothing.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back the overview's "recent" figures reach. */
export const CREDIT_OVERVIEW_RECENT_DAYS = 30;

const reversedEntry = alias(creditLedgerEntries, "reversed_entry");

/**
 * The entry's kind, as `CreditLedgerKind`. Needs `reversedEntry` joined on
 * `reverses_entry_id`.
 *
 * Order matters. A refund and an undone adjustment are both linked to the
 * entry they reverse and differ only in what that entry was. A debt
 * resolution is recognised by the resolution `resolveCreditDebt` records. What
 * is left of `admin_adjustment` is a manual discount, which
 * `adjustCreditAccount` only ever posts negative; the positive fallback exists
 * so an entry from some other path still gets a truthful label.
 */
const ledgerKindSql = sql<CreditLedgerKind>`case
  when ${creditLedgerEntries.type} = 'top_up' then 'purchase'
  when ${creditLedgerEntries.type} = 'spend' then 'spend'
  when ${creditLedgerEntries.type} = 'reversal' then 'voucher_reversal'
  when ${reversedEntry.type} = 'spend' then 'refund'
  when ${reversedEntry.id} is not null then 'revert'
  when ${creditLedgerEntries.metadata} ->> 'resolution' is not null then 'debt_resolution'
  when ${creditLedgerEntries.type} = 'admin_grant' then 'grant'
  when ${creditLedgerEntries.amount} < 0 then 'deduction'
  else 'adjustment'
end`;

async function canViewCredits() {
  const actor = await getCurrentUserProfile();
  return canViewAdminReservationData(actor);
}

function money(value: unknown): number {
  return roundMoney(Number(value ?? 0));
}

function count(value: unknown): number {
  return Number(value ?? 0);
}

/** Timestamp columns are stored in UTC wall time; compare against ISO strings. */
function isoParam(date: Date): string {
  return date.toISOString();
}

/**
 * A timestamp computed in SQL, like `greatest(...)`. Drizzle only maps the
 * columns it knows; a raw expression comes back as the driver's string, in the
 * same UTC wall time the columns hold, so it is read the way drizzle reads them.
 */
function parseTimestamp(value: Date | string | null): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const date = new Date(`${value}+0000`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `YYYY-MM-DD` read as a Bolivian calendar day, which is how admins think of dates. */
function startOfLocalDay(value: string): Date | null {
  const date = DateTime.fromISO(value, { zone: STORE_TIMEZONE }).startOf("day");
  return date.isValid ? date.toJSDate() : null;
}

/** An inclusive `from`–`to` range of Bolivian calendar days, as UTC bounds. */
function localDayBounds(fromDay?: string, toDay?: string) {
  const from = fromDay ? startOfLocalDay(fromDay) : null;
  const toStart = toDay ? startOfLocalDay(toDay) : null;
  const toExclusive = toStart
    ? new Date(
        DateTime.fromJSDate(toStart, { zone: STORE_TIMEZONE })
          .plus({ days: 1 })
          .toMillis(),
      )
    : null;
  return { from, toExclusive };
}

type UserSummary = {
  id: number;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
};

function userSearchCondition(query: string): SQL | undefined {
  const term = query.trim();
  if (!term) return undefined;
  const pattern = `%${term}%`;
  const conditions: SQL[] = [
    ilike(users.displayName, pattern),
    ilike(users.firstName, pattern),
    ilike(users.lastName, pattern),
    ilike(users.email, pattern),
    sql`concat_ws(' ', ${users.firstName}, ${users.lastName}) ilike ${pattern}`,
  ];
  // An id is what the rest of the dashboard shows next to a person, so it is
  // worth finding someone by it.
  const id = Number(term.replace(/^#/, ""));
  if (Number.isInteger(id) && id > 0 && id <= 2_147_483_647) {
    conditions.push(eq(users.id, id));
  }
  return or(...conditions);
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/**
 * One account's balances and lifetime flows.
 *
 * `spent` is net of credits handed back when an invoice they paid was
 * cancelled, and `adminNet` is every admin movement other than those refunds,
 * so `purchased + reversed - spent + adminNet` is the ledger balance.
 */
export type CreditAccountRow = {
  user: UserSummary & { imageUrl: string | null };
  balances: CreditBalances;
  underReviewCount: number;
  /** Null when no projection row exists yet. */
  cachedBalance: number | null;
  /** The cached projection disagrees with the ledger; the ledger wins. */
  hasDrift: boolean;
  purchased: number;
  /** Negative: credits taken back after a rejected voucher. */
  reversed: number;
  spent: number;
  adminNet: number;
  lastActivityAt: Date | null;
};

export type CreditAccountsPage = {
  rows: CreditAccountRow[];
  /** Every account matching the filter, not just this page. */
  total: number;
  /** Sum of ledger balances across every matching account. */
  balanceTotal: number;
};

type AccountsQueryInput = {
  query?: string;
  /** An account matching any of them; none means every account. */
  filters?: readonly CreditAccountFilter[];
  sort?: CreditAccountSort;
  direction?: "asc" | "desc";
  userId?: number;
  limit?: number;
  offset?: number;
};

function accountSources() {
  const ledger = db
    .select({
      userId: creditLedgerEntries.userId,
      balance: sql<string>`sum(${creditLedgerEntries.amount})`.as("balance"),
      purchased:
        sql<string>`coalesce(sum(${creditLedgerEntries.amount}) filter (where ${creditLedgerEntries.type} = 'top_up'), 0)`.as(
          "purchased",
        ),
      reversed:
        sql<string>`coalesce(sum(${creditLedgerEntries.amount}) filter (where ${creditLedgerEntries.type} = 'reversal'), 0)`.as(
          "reversed",
        ),
      spent:
        sql<string>`coalesce(-(sum(${creditLedgerEntries.amount}) filter (where ${creditLedgerEntries.type} = 'spend' or ${reversedEntry.type} = 'spend')), 0)`.as(
          "spent",
        ),
      adminNet:
        sql<string>`coalesce(sum(${creditLedgerEntries.amount}) filter (where ${creditLedgerEntries.type} in ('admin_grant', 'admin_adjustment') and ${reversedEntry.type} is distinct from 'spend'), 0)`.as(
          "admin_net",
        ),
      lastEntryAt: sql<Date>`max(${creditLedgerEntries.createdAt})`.as(
        "last_entry_at",
      ),
    })
    .from(creditLedgerEntries)
    .leftJoin(
      reversedEntry,
      eq(reversedEntry.id, creditLedgerEntries.reversesEntryId),
    )
    .groupBy(creditLedgerEntries.userId)
    .as("account_ledger");

  const holds = db
    .select({
      userId: creditHolds.userId,
      activeHolds:
        sql<string>`coalesce(sum(${creditHolds.amount}) filter (where ${creditHolds.status} = 'active'), 0)`.as(
          "active_holds",
        ),
      lastHoldAt: sql<Date>`max(${creditHolds.updatedAt})`.as("last_hold_at"),
    })
    .from(creditHolds)
    .groupBy(creditHolds.userId)
    .as("account_holds");

  const topUps = db
    .select({
      userId: creditTopUps.userId,
      underReview:
        sql<string>`coalesce(sum(${creditTopUps.amount}) filter (where ${creditTopUps.status} = 'under_review'), 0)`.as(
          "under_review",
        ),
      underReviewCount:
        sql<string>`count(*) filter (where ${creditTopUps.status} = 'under_review')`.as(
          "under_review_count",
        ),
      lastTopUpAt:
        sql<Date>`max(greatest(${creditTopUps.createdAt}, ${creditTopUps.submittedAt}, ${creditTopUps.reviewedAt}))`.as(
          "last_top_up_at",
        ),
    })
    .from(creditTopUps)
    .groupBy(creditTopUps.userId)
    .as("account_top_ups");

  const balance = sql`coalesce(${ledger.balance}, 0)`;
  const activeHolds = sql`coalesce(${holds.activeHolds}, 0)`;
  const expressions = {
    balance,
    activeHolds,
    spendable: sql`(${balance} - ${activeHolds})`,
    underReviewCount: sql`coalesce(${topUps.underReviewCount}, 0)`,
    purchased: sql`coalesce(${ledger.purchased}, 0)`,
    spent: sql`coalesce(${ledger.spent}, 0)`,
    drift: sql`coalesce(${creditAccounts.cachedBalance}, 0) <> ${balance}`,
    // `greatest` skips nulls, so an account with only a purchase still sorts.
    lastActivity: sql`greatest(${ledger.lastEntryAt}, ${holds.lastHoldAt}, ${topUps.lastTopUpAt})`,
    name: sql`lower(coalesce(nullif(${users.displayName}, ''), nullif(concat_ws(' ', ${users.firstName}, ${users.lastName}), ''), ${users.email}))`,
  };

  // Anyone who has ever touched credits has a row, even at zero: an account
  // emptied by spending is still one an admin may need to explain.
  const hasActivity = or(
    isNotNull(creditAccounts.userId),
    isNotNull(ledger.userId),
    isNotNull(holds.userId),
    isNotNull(topUps.userId),
  )!;

  // Dynamic, so the page and its totals share one join chain. Joins do not
  // widen a dynamic query's types, so callers null-check the joined fields.
  function joinAccounts<Q extends PgSelect>(qb: Q) {
    return qb
      .leftJoin(creditAccounts, eq(creditAccounts.userId, users.id))
      .leftJoin(ledger, eq(ledger.userId, users.id))
      .leftJoin(holds, eq(holds.userId, users.id))
      .leftJoin(topUps, eq(topUps.userId, users.id));
  }

  return { ledger, holds, topUps, expressions, hasActivity, joinAccounts };
}

function accountFilterCondition(
  filter: CreditAccountFilter,
  expressions: ReturnType<typeof accountSources>["expressions"],
): SQL {
  switch (filter) {
    case "positive":
      return sql`${expressions.balance} > 0`;
    case "debt":
      return sql`${expressions.balance} < 0`;
    case "zero":
      return sql`${expressions.balance} = 0`;
    case "holds":
      return sql`${expressions.activeHolds} > 0`;
    case "review":
      return sql`${expressions.underReviewCount} > 0`;
    case "drift":
      return expressions.drift;
  }
}

/** Unguarded; callers check the viewer. */
async function queryCreditAccounts(
  input: AccountsQueryInput,
): Promise<CreditAccountsPage> {
  const {
    query = "",
    filters = [],
    sort = "balance",
    direction = "desc",
    userId,
    limit = 25,
    offset = 0,
  } = input;
  const { ledger, holds, topUps, expressions, hasActivity, joinAccounts } =
    accountSources();

  const where = and(
    hasActivity,
    userId != null ? eq(users.id, userId) : undefined,
    userSearchCondition(query),
    or(...filters.map((filter) => accountFilterCondition(filter, expressions))),
  );

  const sortExpression = {
    balance: expressions.balance,
    spendable: expressions.spendable,
    purchased: expressions.purchased,
    spent: expressions.spent,
    lastActivity: expressions.lastActivity,
    name: expressions.name,
  }[sort];
  const order = sql`${sortExpression} ${sql.raw(direction === "asc" ? "asc" : "desc")} nulls last`;

  const [rows, totals] = await Promise.all([
    joinAccounts(
      db
        .select({
          userId: users.id,
          displayName: users.displayName,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          imageUrl: users.imageUrl,
          cachedBalance: creditAccounts.cachedBalance,
          balance: ledger.balance,
          purchased: ledger.purchased,
          reversed: ledger.reversed,
          spent: ledger.spent,
          adminNet: ledger.adminNet,
          activeHolds: holds.activeHolds,
          underReview: topUps.underReview,
          underReviewCount: topUps.underReviewCount,
          lastActivityAt: sql<
            Date | string | null
          >`${expressions.lastActivity}`,
        })
        .from(users)
        .$dynamic(),
    )
      .where(where)
      .orderBy(order, asc(users.id))
      .limit(limit)
      .offset(offset),
    joinAccounts(
      db
        .select({
          total: sql<string>`count(*)`,
          balanceTotal: sql<string>`coalesce(sum(${expressions.balance}), 0)`,
        })
        .from(users)
        .$dynamic(),
    ).where(where),
  ]);

  return {
    rows: rows.map((row) => {
      const ledgerBalance = money(row.balance);
      const cachedBalance =
        row.cachedBalance == null ? null : money(row.cachedBalance);
      return {
        user: {
          id: row.userId,
          displayName: row.displayName,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          imageUrl: row.imageUrl,
        },
        balances: calculateCreditBalances({
          ledgerBalance,
          activeHolds: money(row.activeHolds),
          underReviewIssuance: money(row.underReview),
        }),
        underReviewCount: count(row.underReviewCount),
        cachedBalance,
        hasDrift: (cachedBalance ?? 0) !== ledgerBalance,
        purchased: money(row.purchased),
        reversed: money(row.reversed),
        spent: money(row.spent),
        adminNet: money(row.adminNet),
        lastActivityAt: parseTimestamp(row.lastActivityAt),
      };
    }),
    total: count(totals[0]?.total),
    balanceTotal: money(totals[0]?.balanceTotal),
  };
}

/** Every account that has ever held, bought or spent credits. */
export async function fetchCreditAccounts(
  input: AccountsQueryInput,
): Promise<CreditAccountsPage | null> {
  if (!(await canViewCredits())) return null;
  return queryCreditAccounts(input);
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export type CreditFlowTotals = Record<
  CreditLedgerKind,
  { amount: number; count: number }
>;

export type CreditOverview = {
  /** Credits participants hold: the sum of every positive ledger balance. */
  outstanding: number;
  holderCount: number;
  /** Owed by participants, as a positive number. */
  debtTotal: number;
  debtorCount: number;
  activeHolds: { amount: number; count: number };
  underReview: { amount: number; count: number };
  /** Purchases still inside their upload window. */
  awaitingVoucherCount: number;
  driftCount: number;
  lifetime: CreditFlowTotals;
  recent: CreditFlowTotals;
  recentSince: Date;
  topHolders: CreditAccountRow[];
};

function emptyFlows(): CreditFlowTotals {
  return {
    purchase: { amount: 0, count: 0 },
    spend: { amount: 0, count: 0 },
    voucher_reversal: { amount: 0, count: 0 },
    refund: { amount: 0, count: 0 },
    grant: { amount: 0, count: 0 },
    deduction: { amount: 0, count: 0 },
    adjustment: { amount: 0, count: 0 },
    debt_resolution: { amount: 0, count: 0 },
    revert: { amount: 0, count: 0 },
  };
}

export async function fetchCreditOverview(
  now = new Date(),
): Promise<CreditOverview | null> {
  if (!(await canViewCredits())) return null;

  const recentSince = new Date(
    now.getTime() - CREDIT_OVERVIEW_RECENT_DAYS * DAY_MS,
  );
  const balanceByUser = db
    .select({
      userId: creditLedgerEntries.userId,
      balance: sql<string>`sum(${creditLedgerEntries.amount})`.as("balance"),
    })
    .from(creditLedgerEntries)
    .groupBy(creditLedgerEntries.userId)
    .as("balance_by_user");

  const [balanceRows, flowRows, holdRows, topUpRows, drift, topHolders] =
    await Promise.all([
      db
        .select({
          outstanding: sql<string>`coalesce(sum(${balanceByUser.balance}) filter (where ${balanceByUser.balance} > 0), 0)`,
          holderCount: sql<string>`count(*) filter (where ${balanceByUser.balance} > 0)`,
          debtTotal: sql<string>`coalesce(-(sum(${balanceByUser.balance}) filter (where ${balanceByUser.balance} < 0)), 0)`,
          debtorCount: sql<string>`count(*) filter (where ${balanceByUser.balance} < 0)`,
        })
        .from(balanceByUser),
      db
        .select({
          kind: ledgerKindSql,
          amount: sql<string>`sum(${creditLedgerEntries.amount})`,
          count: sql<string>`count(*)`,
          recentAmount: sql<string>`coalesce(sum(${creditLedgerEntries.amount}) filter (where ${creditLedgerEntries.createdAt} >= ${isoParam(recentSince)}), 0)`,
          recentCount: sql<string>`count(*) filter (where ${creditLedgerEntries.createdAt} >= ${isoParam(recentSince)})`,
        })
        .from(creditLedgerEntries)
        .leftJoin(
          reversedEntry,
          eq(reversedEntry.id, creditLedgerEntries.reversesEntryId),
        )
        .groupBy(ledgerKindSql),
      db
        .select({
          amount: sql<string>`coalesce(sum(${creditHolds.amount}), 0)`,
          count: sql<string>`count(*)`,
        })
        .from(creditHolds)
        .where(eq(creditHolds.status, "active")),
      db
        .select({
          underReviewAmount: sql<string>`coalesce(sum(${creditTopUps.amount}) filter (where ${creditTopUps.status} = 'under_review'), 0)`,
          underReviewCount: sql<string>`count(*) filter (where ${creditTopUps.status} = 'under_review')`,
          awaitingCount: sql<string>`count(*) filter (where ${creditTopUps.status} = 'awaiting_voucher' and ${creditTopUps.uploadDeadlineAt} > ${isoParam(now)})`,
        })
        .from(creditTopUps),
      queryCreditAccounts({ filters: ["drift"], limit: 1 }),
      queryCreditAccounts({
        filters: ["positive"],
        sort: "balance",
        direction: "desc",
        limit: 5,
      }),
    ]);

  const lifetime = emptyFlows();
  const recent = emptyFlows();
  for (const row of flowRows) {
    if (!(row.kind in lifetime)) continue;
    lifetime[row.kind] = { amount: money(row.amount), count: count(row.count) };
    recent[row.kind] = {
      amount: money(row.recentAmount),
      count: count(row.recentCount),
    };
  }

  const balances = balanceRows[0];
  const holds = holdRows[0];
  const topUps = topUpRows[0];
  return {
    outstanding: money(balances?.outstanding),
    holderCount: count(balances?.holderCount),
    debtTotal: money(balances?.debtTotal),
    debtorCount: count(balances?.debtorCount),
    activeHolds: { amount: money(holds?.amount), count: count(holds?.count) },
    underReview: {
      amount: money(topUps?.underReviewAmount),
      count: count(topUps?.underReviewCount),
    },
    awaitingVoucherCount: count(topUps?.awaitingCount),
    driftCount: drift.total,
    lifetime,
    recent,
    recentSince,
    topHolders: topHolders.rows,
  };
}

/** Counts for the section's navigation badges. */
export async function fetchCreditAttentionCounts(): Promise<{
  pendingReviews: number;
  debtAccounts: number;
}> {
  if (!(await canViewCredits())) return { pendingReviews: 0, debtAccounts: 0 };

  const debtors = db
    .select({ userId: creditLedgerEntries.userId })
    .from(creditLedgerEntries)
    .groupBy(creditLedgerEntries.userId)
    .having(sql`sum(${creditLedgerEntries.amount}) < 0`)
    .as("debtors");

  const [reviews, debts] = await Promise.all([
    db
      .select({ total: sql<string>`count(*)` })
      .from(creditTopUps)
      .where(eq(creditTopUps.status, "under_review")),
    db.select({ total: sql<string>`count(*)` }).from(debtors),
  ]);
  return {
    pendingReviews: count(reviews[0]?.total),
    debtAccounts: count(debts[0]?.total),
  };
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export type CreditLedgerRow = {
  id: number;
  createdAt: Date;
  amount: number;
  kind: CreditLedgerKind;
  reason: string | null;
  user: UserSummary;
  /** The purchase an issuance or a voucher reversal belongs to. */
  topUp: {
    id: number;
    status: CreditTopUpDisplayStatus;
    voucherUrl: string | null;
  } | null;
  /** The invoice a spend paid, or a refund came back from. */
  invoice: { id: number; reservationId: number } | null;
  /** The optional feature a spend paid for. */
  featureAction: {
    id: number;
    type: "full_table_access" | "late_partner" | "reservation_release";
    reservationId: number | null;
  } | null;
  festival: { id: number; name: string } | null;
  /** The reservation a stand-change refund came from. */
  standChangeReservationId: number | null;
  resolution: string | null;
  reversesEntryId: number | null;
  isReverted: boolean;
  /**
   * The admin behind the movement: who granted, discounted or resolved it, or
   * who rejected the voucher a reversal claws back. Null for a participant's
   * own purchase or spend, and for admin entries from before this was kept.
   */
  actor: { id: number; name: string } | null;
};

export type CreditLedgerPage = {
  rows: CreditLedgerRow[];
  total: number;
  /** Sum of positive amounts across every matching entry. */
  creditsIn: number;
  /** Sum of negative amounts across every matching entry, as a negative number. */
  creditsOut: number;
};

export type CreditLedgerQueryInput = {
  query?: string;
  userId?: number;
  festivalId?: number;
  kinds?: readonly CreditLedgerKind[];
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

const entryAllocation = alias(invoiceCreditAllocations, "entry_allocation");
const reversedAllocation = alias(
  invoiceCreditAllocations,
  "reversed_allocation",
);

function joinLedger<Q extends PgSelect>(qb: Q) {
  return (
    qb
      .innerJoin(users, eq(users.id, creditLedgerEntries.userId))
      .leftJoin(
        reversedEntry,
        eq(reversedEntry.id, creditLedgerEntries.reversesEntryId),
      )
      .leftJoin(creditTopUps, eq(creditTopUps.id, creditLedgerEntries.topUpId))
      .leftJoin(
        entryAllocation,
        eq(entryAllocation.ledgerEntryId, creditLedgerEntries.id),
      )
      // A refund carries no allocation of its own; the invoice is on the
      // spend it hands back.
      .leftJoin(
        reversedAllocation,
        eq(reversedAllocation.ledgerEntryId, reversedEntry.id),
      )
      .leftJoin(
        invoices,
        sql`${invoices.id} = coalesce(${entryAllocation.invoiceId}, ${reversedAllocation.invoiceId})`,
      )
      .leftJoin(
        standReservations,
        eq(standReservations.id, invoices.reservationId),
      )
      .leftJoin(
        reservationFeatureActions,
        sql`${reservationFeatureActions.id} = coalesce(${creditLedgerEntries.featureActionId}, ${reversedEntry.featureActionId})`,
      )
      .leftJoin(
        festivals,
        sql`${festivals.id} = coalesce(${reservationFeatureActions.festivalId}, ${standReservations.festivalId})`,
      )
  );
}

function ledgerWhere(input: CreditLedgerQueryInput): SQL | undefined {
  const { from, toExclusive } = localDayBounds(input.from, input.to);
  return and(
    input.userId != null
      ? eq(creditLedgerEntries.userId, input.userId)
      : undefined,
    input.festivalId != null ? eq(festivals.id, input.festivalId) : undefined,
    input.kinds?.length ? inArray(ledgerKindSql, [...input.kinds]) : undefined,
    from ? gte(creditLedgerEntries.createdAt, from) : undefined,
    toExclusive ? lt(creditLedgerEntries.createdAt, toExclusive) : undefined,
    userSearchCondition(input.query ?? ""),
  );
}

function readMetadata(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMetadataId(metadata: unknown, key: string): number | null {
  const value = Number(readMetadata(metadata, key));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function displayTopUpStatus(
  status: string,
  uploadDeadlineAt: Date,
  now: Date,
): CreditTopUpDisplayStatus {
  if (status === "awaiting_voucher" && uploadDeadlineAt <= now) {
    return "expired";
  }
  return status as CreditTopUpDisplayStatus;
}

async function namesForUsers(ids: Iterable<number>) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<number, string>();
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((row) => [row.id, getUserName(row) || row.email]));
}

/** Unguarded; callers check the viewer. */
async function queryCreditLedger(
  input: CreditLedgerQueryInput,
  now = new Date(),
): Promise<CreditLedgerPage> {
  const where = ledgerWhere(input);
  const [rows, totals] = await Promise.all([
    joinLedger(
      db
        .select({
          id: creditLedgerEntries.id,
          createdAt: creditLedgerEntries.createdAt,
          amount: creditLedgerEntries.amount,
          kind: ledgerKindSql,
          metadata: creditLedgerEntries.metadata,
          reversesEntryId: creditLedgerEntries.reversesEntryId,
          userId: users.id,
          displayName: users.displayName,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          topUpId: creditTopUps.id,
          topUpStatus: creditTopUps.status,
          topUpDeadline: creditTopUps.uploadDeadlineAt,
          topUpVoucherUrl: creditTopUps.voucherUrl,
          topUpReviewedBy: creditTopUps.reviewedByUserId,
          invoiceId: invoices.id,
          invoiceReservationId: invoices.reservationId,
          featureActionId: reservationFeatureActions.id,
          featureActionType: reservationFeatureActions.type,
          featureActionReservationId: reservationFeatureActions.reservationId,
          festivalId: festivals.id,
          festivalName: festivals.name,
        })
        .from(creditLedgerEntries)
        .$dynamic(),
    )
      .where(where)
      .orderBy(
        desc(creditLedgerEntries.createdAt),
        desc(creditLedgerEntries.id),
      )
      .limit(input.limit ?? 50)
      .offset(input.offset ?? 0),
    joinLedger(
      db
        .select({
          total: sql<string>`count(*)`,
          creditsIn: sql<string>`coalesce(sum(${creditLedgerEntries.amount}) filter (where ${creditLedgerEntries.amount} > 0), 0)`,
          creditsOut: sql<string>`coalesce(sum(${creditLedgerEntries.amount}) filter (where ${creditLedgerEntries.amount} < 0), 0)`,
        })
        .from(creditLedgerEntries)
        .$dynamic(),
    ).where(where),
  ]);

  // Checked across the whole ledger rather than the page: an undo can be
  // months newer than the entry it undoes.
  const revertedIds = new Set<number>();
  if (rows.length > 0) {
    const reverting = await db
      .select({ reversesEntryId: creditLedgerEntries.reversesEntryId })
      .from(creditLedgerEntries)
      .where(
        inArray(
          creditLedgerEntries.reversesEntryId,
          rows.map((row) => row.id),
        ),
      );
    for (const row of reverting) {
      if (row.reversesEntryId != null) revertedIds.add(row.reversesEntryId);
    }
  }

  const actorIdFor = (row: (typeof rows)[number]) =>
    readMetadataId(row.metadata, "adminUserId") ??
    readMetadataId(row.metadata, "reviewerUserId") ??
    (row.kind === "voucher_reversal" ? row.topUpReviewedBy : null);
  const actorNames = await namesForUsers(
    rows.map(actorIdFor).filter((id): id is number => id != null),
  );

  return {
    rows: rows.map((row) => {
      const actorId = actorIdFor(row);
      return {
        id: row.id,
        createdAt: row.createdAt,
        amount: Number(row.amount),
        kind: row.kind,
        reason: readMetadata(row.metadata, "reason"),
        user: {
          id: row.userId,
          displayName: row.displayName,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
        },
        topUp:
          row.topUpId != null && row.topUpStatus && row.topUpDeadline
            ? {
                id: row.topUpId,
                status: displayTopUpStatus(
                  row.topUpStatus,
                  row.topUpDeadline,
                  now,
                ),
                voucherUrl: row.topUpVoucherUrl,
              }
            : null,
        invoice:
          row.invoiceId != null && row.invoiceReservationId != null
            ? { id: row.invoiceId, reservationId: row.invoiceReservationId }
            : null,
        featureAction:
          row.featureActionId != null && row.featureActionType
            ? {
                id: row.featureActionId,
                type: row.featureActionType,
                reservationId: row.featureActionReservationId,
              }
            : null,
        festival:
          row.festivalId != null && row.festivalName
            ? { id: row.festivalId, name: row.festivalName }
            : null,
        standChangeReservationId: readMetadataId(
          row.metadata,
          "standChangeRefundReservationId",
        ),
        resolution: readMetadata(row.metadata, "resolution"),
        reversesEntryId: row.reversesEntryId,
        isReverted: revertedIds.has(row.id),
        actor:
          actorId != null && actorNames.has(actorId)
            ? { id: actorId, name: actorNames.get(actorId)! }
            : null,
      };
    }),
    total: count(totals[0]?.total),
    creditsIn: money(totals[0]?.creditsIn),
    creditsOut: money(totals[0]?.creditsOut),
  };
}

/** Every ledger entry across participants, newest first. */
export async function fetchCreditLedger(
  input: CreditLedgerQueryInput,
  now = new Date(),
): Promise<CreditLedgerPage | null> {
  if (!(await canViewCredits())) return null;
  return queryCreditLedger(input, now);
}

/** Festivals for the ledger's filter, newest first. */
export async function fetchCreditLedgerFestivals(): Promise<
  { id: number; name: string }[]
> {
  if (!(await canViewCredits())) return [];
  return db
    .select({ id: festivals.id, name: festivals.name })
    .from(festivals)
    .orderBy(sql`${festivals.startDate} desc nulls last`, desc(festivals.id));
}

// ---------------------------------------------------------------------------
// One account
// ---------------------------------------------------------------------------

export type CreditAccountSubject = UserSummary & {
  imageUrl: string | null;
  role: string;
  status: string;
  category: string;
};

export type CreditAccountDetail = {
  subject: CreditAccountSubject;
  /** Null for someone who has never touched credits; they can still be granted some. */
  account: CreditAccountRow | null;
};

export async function fetchCreditAccountDetail(
  userId: number,
): Promise<CreditAccountDetail | null> {
  if (!(await canViewCredits())) return null;

  const [[subject], accounts] = await Promise.all([
    db
      .select({
        id: users.id,
        displayName: users.displayName,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        imageUrl: users.imageUrl,
        role: users.role,
        status: users.status,
        category: users.category,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    queryCreditAccounts({ userId, limit: 1 }),
  ]);
  if (!subject) return null;
  return { subject, account: accounts.rows[0] ?? null };
}

export type CreditParticipantOption = {
  id: number;
  label: string;
  imageUrl: string | null;
};

/** Any participant by name or email, for opening an account that has no history yet. */
export async function searchCreditParticipants(
  query: string,
): Promise<CreditParticipantOption[]> {
  const term = query.trim();
  if (term.length < 2 || term.length > 100) return [];
  if (!(await canViewCredits())) return [];

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      imageUrl: users.imageUrl,
    })
    .from(users)
    .where(and(eq(users.role, "user"), userSearchCondition(term)))
    .orderBy(asc(users.displayName), asc(users.id))
    .limit(8);

  return rows.map((row) => ({
    id: row.id,
    label: `${getUserName(row) || row.email} · ${row.email}`,
    imageUrl: row.imageUrl,
  }));
}

// ---------------------------------------------------------------------------
// Purchases (top-ups) and their review
// ---------------------------------------------------------------------------

/** What a pending voucher would cost to reject; see the review dialog. */
export type CreditPurchaseReviewContext = {
  /** The participant's whole ledger balance, this purchase included. */
  ledgerBalance: number;
  /**
   * Where a rejection would leave the ledger. Exact, unlike attributing
   * individual spends to a voucher — credits are fungible once posted.
   */
  balanceAfterReversal: number;
  /** Context only: credits spent since this voucher arrived. */
  spentSinceSubmission: number;
};

export type CreditPurchaseRow = {
  id: number;
  amount: number;
  status: CreditTopUpDisplayStatus;
  intendedUseType: "feature" | "invoice" | "debt";
  /** Which feature a `feature` purchase was for; null on older rows. */
  featureType: string | null;
  voucherUrl: string | null;
  createdAt: Date;
  submittedAt: Date | null;
  uploadDeadlineAt: Date;
  reviewedAt: Date | null;
  reviewerName: string | null;
  rejectionReason: string | null;
  user: UserSummary;
  /** The festival it was for: the feature's, or the paid reservation's. */
  festival: { id: number; name: string } | null;
  /** Set for an `invoice` purchase whose invoice still exists. */
  invoice: { id: number; reservationId: number } | null;
  /** Only for a purchase still under review. */
  review: CreditPurchaseReviewContext | null;
};

export type CreditPurchaseStatusCounts = Record<
  CreditTopUpDisplayStatus | "all",
  number
>;

export type CreditPurchasesPage = {
  rows: CreditPurchaseRow[];
  /** Every purchase matching the filters and status, not just this page. */
  total: number;
  totalAmount: number;
  /** Per status under the same filters, for the status tabs. */
  counts: CreditPurchaseStatusCounts;
};

export type CreditPurchasesQueryInput = {
  status?: CreditTopUpDisplayStatus | "all";
  /** One participant's purchases, for their account page. */
  userId?: number;
  query?: string;
  purpose?: "feature" | "invoice" | "debt";
  festivalId?: number;
  from?: string;
  to?: string;
  /** When the purchase reached an admin, or how much it was for. */
  sort?: "arrivedAt" | "amount";
  direction?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

/**
 * The stored status with the one correction reads make: a purchase still
 * `awaiting_voucher` past its deadline is expired, just not yet swept.
 */
function purchaseStatusSql(now: Date) {
  return sql<CreditTopUpDisplayStatus>`case
    when ${creditTopUps.status} = 'awaiting_voucher' and ${creditTopUps.uploadDeadlineAt} <= ${isoParam(now)} then 'expired'
    else ${creditTopUps.status}::text
  end`;
}

/** When the purchase reached the admin: its voucher, or its opening. */
const purchaseArrivedAt = sql`coalesce(${creditTopUps.submittedAt}, ${creditTopUps.createdAt})`;

function joinPurchases<Q extends PgSelect>(qb: Q) {
  return (
    qb
      .innerJoin(users, eq(users.id, creditTopUps.userId))
      .leftJoin(
        invoices,
        and(
          eq(creditTopUps.intendedUseType, "invoice"),
          eq(invoices.id, creditTopUps.intendedUseId),
        ),
      )
      .leftJoin(
        standReservations,
        eq(standReservations.id, invoices.reservationId),
      )
      // A feature purchase stores its festival directly; an invoice purchase
      // reaches it through the reservation it pays.
      .leftJoin(
        festivals,
        sql`${festivals.id} = case when ${creditTopUps.intendedUseType} = 'feature' then ${creditTopUps.intendedUseId} else ${standReservations.festivalId} end`,
      )
  );
}

function purchaseSearchCondition(query: string): SQL | undefined {
  const byUser = userSearchCondition(query);
  if (!byUser) return undefined;
  // The same number is also a purchase, which is what an admin holding a
  // voucher screenshot is most likely to have.
  const id = Number(query.trim().replace(/^#/, ""));
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647
    ? or(byUser, eq(creditTopUps.id, id))
    : byUser;
}

/** Unguarded; callers check the viewer. */
async function queryCreditPurchases(
  input: CreditPurchasesQueryInput,
  now = new Date(),
): Promise<CreditPurchasesPage> {
  const status = input.status ?? "under_review";
  const direction =
    input.direction ?? (status === "under_review" ? "asc" : "desc");
  const statusSql = purchaseStatusSql(now);
  const { from, toExclusive } = localDayBounds(input.from, input.to);

  // Everything but the status, so the tabs can count their own.
  const filters = and(
    input.userId != null ? eq(creditTopUps.userId, input.userId) : undefined,
    purchaseSearchCondition(input.query ?? ""),
    input.purpose ? eq(creditTopUps.intendedUseType, input.purpose) : undefined,
    input.festivalId != null ? eq(festivals.id, input.festivalId) : undefined,
    from ? sql`${purchaseArrivedAt} >= ${isoParam(from)}` : undefined,
    toExclusive
      ? sql`${purchaseArrivedAt} < ${isoParam(toExclusive)}`
      : undefined,
  );
  const where = and(
    filters,
    status === "all" ? undefined : sql`${statusSql} = ${status}`,
  );
  // Arrival for every state, so the "Llegó" header is always the truth; the
  // queue reads it oldest first and history newest first.
  const sortKey =
    input.sort === "amount" ? creditTopUps.amount : purchaseArrivedAt;
  const order = sql.raw(direction === "asc" ? "asc" : "desc");

  const [rows, totals, countRows] = await Promise.all([
    joinPurchases(
      db
        .select({
          id: creditTopUps.id,
          amount: creditTopUps.amount,
          status: statusSql,
          intendedUseType: creditTopUps.intendedUseType,
          featureType: creditTopUps.intendedFeatureType,
          voucherUrl: creditTopUps.voucherUrl,
          createdAt: creditTopUps.createdAt,
          submittedAt: creditTopUps.submittedAt,
          uploadDeadlineAt: creditTopUps.uploadDeadlineAt,
          reviewedAt: creditTopUps.reviewedAt,
          reviewedByUserId: creditTopUps.reviewedByUserId,
          rejectionReason: creditTopUps.rejectionReason,
          userId: users.id,
          displayName: users.displayName,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          invoiceId: invoices.id,
          invoiceReservationId: invoices.reservationId,
          festivalId: festivals.id,
          festivalName: festivals.name,
        })
        .from(creditTopUps)
        .$dynamic(),
    )
      .where(where)
      .orderBy(sql`${sortKey} ${order}`, sql`${creditTopUps.id} ${order}`)
      .limit(input.limit ?? 25)
      .offset(input.offset ?? 0),
    joinPurchases(
      db
        .select({
          total: sql<string>`count(*)`,
          totalAmount: sql<string>`coalesce(sum(${creditTopUps.amount}), 0)`,
        })
        .from(creditTopUps)
        .$dynamic(),
    ).where(where),
    joinPurchases(
      db
        .select({ status: statusSql, total: sql<string>`count(*)` })
        .from(creditTopUps)
        .$dynamic(),
    )
      .where(filters)
      // By position: the status expression carries `now` as a bind
      // parameter, which Postgres numbers differently in the GROUP BY and so
      // would not recognise as the selected expression.
      .groupBy(sql`1`),
  ]);

  const counts: CreditPurchaseStatusCounts = {
    under_review: 0,
    awaiting_voucher: 0,
    approved: 0,
    rejected: 0,
    expired: 0,
    all: 0,
  };
  for (const row of countRows) {
    if (row.status in counts) counts[row.status] = count(row.total);
    counts.all += count(row.total);
  }

  const pending = rows.filter((row) => row.status === "under_review");
  const pendingUserIds = [...new Set(pending.map((row) => row.userId))];
  const [balanceRows, spentRows, reviewerNames] = await Promise.all([
    pendingUserIds.length
      ? db
          .select({
            userId: creditLedgerEntries.userId,
            balance: sql<string>`coalesce(sum(${creditLedgerEntries.amount}), 0)`,
          })
          .from(creditLedgerEntries)
          .where(inArray(creditLedgerEntries.userId, pendingUserIds))
          .groupBy(creditLedgerEntries.userId)
      : [],
    pending.length
      ? db
          .select({
            topUpId: creditTopUps.id,
            spent: sql<string>`coalesce(-sum(${creditLedgerEntries.amount}), 0)`,
          })
          .from(creditTopUps)
          .innerJoin(
            creditLedgerEntries,
            and(
              eq(creditLedgerEntries.userId, creditTopUps.userId),
              eq(creditLedgerEntries.type, "spend"),
              gte(creditLedgerEntries.createdAt, creditTopUps.submittedAt),
            ),
          )
          .where(
            inArray(
              creditTopUps.id,
              pending.map((row) => row.id),
            ),
          )
          .groupBy(creditTopUps.id)
      : [],
    namesForUsers(
      rows
        .map((row) => row.reviewedByUserId)
        .filter((id): id is number => id != null),
    ),
  ]);
  const balanceByUser = new Map(
    balanceRows.map((row) => [row.userId, money(row.balance)]),
  );
  const spentByTopUp = new Map(
    spentRows.map((row) => [row.topUpId, money(row.spent)]),
  );

  return {
    rows: rows.map((row) => {
      const amount = Number(row.amount);
      const ledgerBalance = balanceByUser.get(row.userId) ?? 0;
      return {
        id: row.id,
        amount,
        status: row.status,
        intendedUseType: row.intendedUseType,
        featureType: row.featureType,
        voucherUrl: row.voucherUrl,
        createdAt: row.createdAt,
        submittedAt: row.submittedAt,
        uploadDeadlineAt: row.uploadDeadlineAt,
        reviewedAt: row.reviewedAt,
        reviewerName:
          row.reviewedByUserId != null
            ? (reviewerNames.get(row.reviewedByUserId) ?? null)
            : null,
        rejectionReason: row.rejectionReason,
        user: {
          id: row.userId,
          displayName: row.displayName,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
        },
        festival:
          row.festivalId != null && row.festivalName
            ? { id: row.festivalId, name: row.festivalName }
            : null,
        invoice:
          row.invoiceId != null && row.invoiceReservationId != null
            ? { id: row.invoiceId, reservationId: row.invoiceReservationId }
            : null,
        review:
          row.status === "under_review"
            ? {
                ledgerBalance,
                balanceAfterReversal: roundMoney(ledgerBalance - amount),
                spentSinceSubmission: spentByTopUp.get(row.id) ?? 0,
              }
            : null,
      };
    }),
    total: count(totals[0]?.total),
    totalAmount: money(totals[0]?.totalAmount),
    counts,
  };
}

/**
 * Every credit purchase, filterable, for the review page.
 *
 * Readable by global and festival admins; only a global admin can act on a
 * voucher, which `reviewCreditTopUpAction` enforces separately.
 */
export async function fetchCreditPurchases(
  input: CreditPurchasesQueryInput,
  now = new Date(),
): Promise<CreditPurchasesPage | null> {
  if (!(await canViewCredits())) return null;
  return queryCreditPurchases(input, now);
}
