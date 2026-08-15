import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import {
  resolveAvailability,
  resolveUsage,
  type FastPassAvailability,
  type FastPassPurchaseConsumption,
  type FastPassUsage,
} from "@/app/lib/fast-pass/availability";
import {
  requireFastPassFestivalAdmin,
  requireFastPassFestivalDateAdmin,
} from "@/app/lib/fast-pass/admin-auth";
import type { FastPassDaySettings } from "@/app/lib/fast-pass/definitions";
import {
  resolveFastPassSaleState,
  settingsToSaleInput,
  type FastPassSaleState,
} from "@/app/lib/fast-pass/state";
import { db } from "@/db";
import {
  fastPassDaySettings,
  fastPassPurchases,
  festivalDates,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | DbTx;

export type FastPassDayAvailability = {
  settings: FastPassDaySettings;
  usage: FastPassUsage;
  availability: FastPassAvailability;
};

/**
 * Locks the festival-day settings row for the rest of the transaction. Every
 * checkout and POS sale must hold this lock before counting availability.
 */
export async function lockDaySettings(
  tx: DbTx,
  settingsId: number,
): Promise<FastPassDaySettings | null> {
  const [settings] = await tx
    .select()
    .from(fastPassDaySettings)
    .where(eq(fastPassDaySettings.id, settingsId))
    .for("update")
    .limit(1);

  return settings ?? null;
}

async function loadPurchaseConsumptions(
  executor: Executor,
  settingsId: number,
): Promise<FastPassPurchaseConsumption[]> {
  const rows = await executor
    .select({
      channel: fastPassPurchases.channel,
      status: fastPassPurchases.status,
      holdExpiresAt: fastPassPurchases.holdExpiresAt,
      correctionExpiresAt: fastPassPurchases.correctionExpiresAt,
      allocationRestored: fastPassPurchases.allocationRestored,
      paidCount: sql<number>`(
        SELECT count(*)::int
        FROM fast_pass_purchase_lines l
        WHERE l.purchase_id = ${fastPassPurchases.id}
      )`,
      priorityCount: sql<number>`(
        SELECT coalesce(sum(1 + l.responsible_child_count), 0)::int
        FROM fast_pass_purchase_lines l
        WHERE l.purchase_id = ${fastPassPurchases.id}
      )`,
    })
    .from(fastPassPurchases)
    .where(eq(fastPassPurchases.settingsId, settingsId));

  return rows.map((row) => ({
    channel: row.channel,
    status: row.status,
    holdExpiresAt: row.holdExpiresAt,
    correctionExpiresAt: row.correctionExpiresAt,
    allocationRestored: row.allocationRestored,
    paidCount: Number(row.paidCount),
    priorityCount: Number(row.priorityCount),
  }));
}

/** Canonical availability for a festival day, outside a writer transaction. */
export async function fetchDayAvailability(
  settingsId: number,
  now: Date = new Date(),
): Promise<FastPassDayAvailability | null> {
  const [settings] = await db
    .select()
    .from(fastPassDaySettings)
    .where(eq(fastPassDaySettings.id, settingsId))
    .limit(1);

  if (!settings) return null;

  return fetchDayAvailabilityInTx(db, settings, now);
}

/**
 * Recomputes availability using an already-loaded (and ideally locked)
 * settings row. Call this inside checkout/POS after `lockDaySettings`.
 */
export async function fetchDayAvailabilityInTx(
  executor: Executor,
  settings: FastPassDaySettings,
  now: Date = new Date(),
): Promise<FastPassDayAvailability> {
  const purchases = await loadPurchaseConsumptions(executor, settings.id);
  const usage = resolveUsage(purchases, now);
  const availability = resolveAvailability(settings, usage);

  return { settings, usage, availability };
}

export type FastPassInventoryOverviewDate = {
  festivalDateId: number;
  startDate: Date;
  offeringEnabled: boolean;
  saleState: FastPassSaleState;
  price: number;
  remainingPaid: number;
  remainingPriority: number;
  paidInventoryLimit: number;
  priorityCapacityLimit: number;
};

/** Admin overview cards for every festival day. */
export async function fetchFastPassInventoryOverview(
  festivalId: number,
): Promise<FastPassInventoryOverviewDate[]> {
  if (!(await requireFastPassFestivalAdmin(festivalId))) return [];

  const dates = await db.query.festivalDates.findMany({
    where: eq(festivalDates.festivalId, festivalId),
    orderBy: [asc(festivalDates.startDate)],
  });

  const results: FastPassInventoryOverviewDate[] = [];
  for (const date of dates) {
    const settings = await db.query.fastPassDaySettings.findFirst({
      where: eq(fastPassDaySettings.festivalDateId, date.id),
    });

    if (!settings) {
      results.push({
        festivalDateId: date.id,
        startDate: date.startDate,
        offeringEnabled: false,
        saleState: "offering_disabled",
        price: 0,
        remainingPaid: 0,
        remainingPriority: 0,
        paidInventoryLimit: 0,
        priorityCapacityLimit: 0,
      });
      continue;
    }

    const day = await fetchDayAvailabilityInTx(db, settings);
    const sale = resolveFastPassSaleState(
      settingsToSaleInput(settings),
      "online",
    );

    results.push({
      festivalDateId: date.id,
      startDate: date.startDate,
      offeringEnabled: settings.offeringEnabled,
      saleState: sale.state,
      price: settings.price,
      remainingPaid: day.availability.remainingPaid,
      remainingPriority: day.availability.remainingPriority,
      paidInventoryLimit: settings.paidInventoryLimit,
      priorityCapacityLimit: settings.priorityCapacityLimit,
    });
  }

  return results;
}

export type FastPassDaySettingsBundle = {
  settings: FastPassDaySettings;
  notificationEmails: string[];
  onlineSalesPaused: boolean;
  onSiteSalesPaused: boolean;
};

export async function fetchFastPassDaySettingsBundle(
  festivalDateId: number,
): Promise<FastPassDaySettingsBundle | null> {
  if (!(await requireFastPassFestivalDateAdmin(festivalDateId))) return null;

  const settings = await db.query.fastPassDaySettings.findFirst({
    where: eq(fastPassDaySettings.festivalDateId, festivalDateId),
    with: { notificationRecipients: true },
  });

  if (!settings) return null;

  return {
    settings,
    notificationEmails: settings.notificationRecipients.map((r) => r.email),
    onlineSalesPaused: settings.onlineSalesPausedAt !== null,
    onSiteSalesPaused: settings.onSiteSalesPausedAt !== null,
  };
}

export type FastPassPublicDateOffering = {
  festivalDateId: number;
  startDate: Date;
  price: number;
  saleState: FastPassSaleState;
  remainingPaid: number | null;
};

export async function fetchFastPassPublicOffering(
  festivalId: number,
): Promise<FastPassPublicDateOffering[]> {
  const dates = await db.query.festivalDates.findMany({
    where: eq(festivalDates.festivalId, festivalId),
    orderBy: [asc(festivalDates.startDate)],
  });

  const offerings: FastPassPublicDateOffering[] = [];
  for (const date of dates) {
    const settings = await db.query.fastPassDaySettings.findFirst({
      where: eq(fastPassDaySettings.festivalDateId, date.id),
    });

    if (!settings?.offeringEnabled) continue;

    const day = await fetchDayAvailabilityInTx(db, settings);
    const sale = resolveFastPassSaleState(
      settingsToSaleInput(settings),
      "online",
    );

    offerings.push({
      festivalDateId: date.id,
      startDate: date.startDate,
      price: settings.price,
      saleState: sale.state,
      remainingPaid: Math.min(
        day.availability.remainingPaid,
        day.availability.remainingPriority,
        day.availability.remainingOnlinePaid,
        day.availability.remainingOnlinePriority,
      ),
    });
  }

  return offerings;
}

export type FastPassCheckoutContext = {
  settingsId: number;
  price: number;
  maxPaidPassesPerPurchase: number;
  remainingPaid: number;
  saleState: FastPassSaleState;
};

export async function fetchFastPassCheckoutContext(
  festivalDateId: number,
): Promise<FastPassCheckoutContext | null> {
  const settings = await db.query.fastPassDaySettings.findFirst({
    where: eq(fastPassDaySettings.festivalDateId, festivalDateId),
  });
  if (!settings?.offeringEnabled) return null;

  const day = await fetchDayAvailabilityInTx(db, settings);
  const sale = resolveFastPassSaleState(
    settingsToSaleInput(settings),
    "online",
  );

  return {
    settingsId: settings.id,
    price: settings.price,
    maxPaidPassesPerPurchase: settings.maxPaidPassesPerPurchase,
    remainingPaid: Math.min(
      day.availability.remainingPaid,
      day.availability.remainingPriority,
      day.availability.remainingOnlinePaid,
      day.availability.remainingOnlinePriority,
    ),
    saleState: sale.state,
  };
}
