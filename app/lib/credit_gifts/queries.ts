import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  CREDIT_GIFT_SKIP_REASONS,
  type CreditGiftOccasion,
  type CreditGiftRecipientOption,
  type CreditGiftSkipReason,
} from "@/app/lib/credit_gifts/definitions";
import { classifyCreditGiftRecipients } from "@/app/lib/credit_gifts/service";
import { userSearchCondition } from "@/app/lib/users/search-condition";
import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { getUserName } from "@/app/lib/users/utils";
import { db } from "@/db";
import {
  creditGiftDetails,
  creditLedgerEntries,
  emailSuppressions,
  notificationCampaignRecipients,
  notificationCampaigns,
  notificationDeliveries,
  notifications,
  users,
} from "@/db/schema";

async function canViewCreditGifts() {
  const actor = await getCurrentUserProfile();
  return canViewAdminReservationData(actor);
}

function toOption(
  row: {
    id: number;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
    imageUrl: string | null;
    status: string;
  },
  reason: CreditGiftSkipReason | null | undefined,
): CreditGiftRecipientOption {
  return {
    id: row.id,
    name: getUserName(row) || row.email,
    greetingName: getUserName(row) || null,
    email: row.email,
    imageUrl: row.imageUrl,
    status: row.status,
    skipReason: reason ? CREDIT_GIFT_SKIP_REASONS[reason] : null,
  };
}

const optionColumns = {
  id: users.id,
  displayName: users.displayName,
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  imageUrl: users.imageUrl,
  status: users.status,
};

/** Participants matching a name or email, with whether a gift would reach them. */
export async function searchCreditGiftRecipients(
  query: string,
): Promise<CreditGiftRecipientOption[]> {
  const term = query.trim();
  if (term.length < 2 || term.length > 100) return [];
  if (!(await canViewCreditGifts())) return [];

  const rows = await db
    .select(optionColumns)
    .from(users)
    .where(and(eq(users.role, "user"), userSearchCondition(term)))
    .orderBy(asc(users.displayName), asc(users.id))
    .limit(8);
  const reasons = await classifyCreditGiftRecipients(rows.map((row) => row.id));
  return rows.map((row) => toOption(row, reasons.get(row.id)));
}

/**
 * These participants as the composer lists them, in the order given. Ids that
 * no longer exist are left out.
 */
export async function fetchCreditGiftRecipientOptions(
  userIds: readonly number[],
): Promise<CreditGiftRecipientOption[]> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return [];
  if (!(await canViewCreditGifts())) return [];
  const [rows, reasons] = await Promise.all([
    db.select(optionColumns).from(users).where(inArray(users.id, unique)),
    classifyCreditGiftRecipients(unique),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return unique.flatMap((id) => {
    const row = byId.get(id);
    return row ? [toOption(row, reasons.get(id))] : [];
  });
}

export type CreditGiftCounts = {
  total: number;
  pending: number;
  granted: number;
  skipped: number;
  failed: number;
  revoked: number;
  read: number;
};

const countColumns = {
  total: sql<number>`count(${notificationCampaignRecipients.id})::int`,
  pending: sql<number>`count(*) filter (where ${notificationCampaignRecipients.status} = 'pending')::int`,
  granted: sql<number>`count(*) filter (where ${notificationCampaignRecipients.status} = 'granted')::int`,
  skipped: sql<number>`count(*) filter (where ${notificationCampaignRecipients.status} = 'skipped')::int`,
  failed: sql<number>`count(*) filter (where ${notificationCampaignRecipients.status} = 'failed')::int`,
  revoked: sql<number>`count(*) filter (where ${notificationCampaignRecipients.revokedAt} is not null)::int`,
  read: sql<number>`count(*) filter (where ${notifications.readAt} is not null)::int`,
};

export type CreditGiftListRow = {
  id: number;
  title: string;
  occasion: CreditGiftOccasion;
  amountPerRecipient: number;
  status: "processing" | "completed";
  createdAt: Date;
  createdByName: string | null;
  counts: CreditGiftCounts;
};

export async function listCreditGifts(): Promise<CreditGiftListRow[] | null> {
  if (!(await canViewCreditGifts())) return null;

  const rows = await db
    .select({
      id: notificationCampaigns.id,
      title: notificationCampaigns.title,
      status: notificationCampaigns.status,
      createdAt: notificationCampaigns.createdAt,
      occasion: creditGiftDetails.occasion,
      amountPerRecipient: creditGiftDetails.amountPerRecipient,
      creatorDisplayName: users.displayName,
      creatorFirstName: users.firstName,
      creatorLastName: users.lastName,
      ...countColumns,
    })
    .from(notificationCampaigns)
    .innerJoin(
      creditGiftDetails,
      eq(creditGiftDetails.campaignId, notificationCampaigns.id),
    )
    .leftJoin(users, eq(users.id, notificationCampaigns.createdByUserId))
    .leftJoin(
      notificationCampaignRecipients,
      eq(notificationCampaignRecipients.campaignId, notificationCampaigns.id),
    )
    .leftJoin(
      notifications,
      eq(notifications.id, notificationCampaignRecipients.notificationId),
    )
    .where(eq(notificationCampaigns.type, "credit_gift"))
    .groupBy(notificationCampaigns.id, creditGiftDetails.campaignId, users.id)
    .orderBy(
      desc(notificationCampaigns.createdAt),
      desc(notificationCampaigns.id),
    )
    .limit(200);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    occasion: row.occasion,
    amountPerRecipient: Number(row.amountPerRecipient),
    status: row.status,
    createdAt: row.createdAt,
    createdByName:
      getUserName({
        displayName: row.creatorDisplayName,
        firstName: row.creatorFirstName,
        lastName: row.creatorLastName,
      }) || null,
    counts: {
      total: Number(row.total),
      pending: Number(row.pending),
      granted: Number(row.granted),
      skipped: Number(row.skipped),
      failed: Number(row.failed),
      revoked: Number(row.revoked),
      read: Number(row.read),
    },
  }));
}

/**
 * A gift recipient's status. `notified` belongs to comunicados and never
 * appears on a gift, which is read by its `credit_gift` type first.
 */
function giftRecipientStatus(
  status: (typeof notificationCampaignRecipients.$inferSelect)["status"],
): CreditGiftRecipientRow["status"] {
  return status === "notified" ? "pending" : status;
}

export type CreditGiftEmailState =
  | "none"
  | "pending"
  | "sent"
  | "failed"
  /** The address bounced or reported us. */
  | "skipped"
  /** Never sent because the gift was taken back first. */
  | "cancelled";

export type CreditGiftRecipientRow = {
  userId: number;
  name: string;
  email: string;
  status: "pending" | "granted" | "skipped" | "failed";
  skippedReason: string | null;
  readAt: Date | null;
  emailState: CreditGiftEmailState;
  /** How many times the notice was mailed again by hand. */
  resendCount: number;
  /**
   * Whether the address is on the bounce/complaint list right now. Read live
   * rather than from the last delivery, so lifting a block or changing the
   * address makes "Reenviar aviso" usable again.
   */
  emailBlocked: boolean;
  ledgerBalance: number;
  revokedAt: Date | null;
  processedAt: Date | null;
};

export type CreditGiftDetail = {
  id: number;
  title: string;
  message: string;
  occasion: CreditGiftOccasion;
  amountPerRecipient: number;
  internalNote: string;
  status: "processing" | "completed";
  createdAt: Date;
  completedAt: Date | null;
  createdByName: string | null;
  counts: CreditGiftCounts & { emailsSent: number; emailsFailed: number };
  recipients: CreditGiftRecipientRow[];
};

function emailStateOf(
  delivery: { status: string; lastError: string | null } | undefined,
): CreditGiftEmailState {
  switch (delivery?.status) {
    case "sent":
      return "sent";
    case "failed":
      return "failed";
    case "skipped":
      return delivery.lastError === "revoked" ? "cancelled" : "skipped";
    case "pending":
    case "processing":
      return "pending";
    default:
      return "none";
  }
}

export async function fetchCreditGift(
  campaignId: number,
): Promise<CreditGiftDetail | null> {
  if (!(await canViewCreditGifts())) return null;

  const [gift] = await db
    .select({
      id: notificationCampaigns.id,
      title: notificationCampaigns.title,
      message: notificationCampaigns.message,
      status: notificationCampaigns.status,
      createdAt: notificationCampaigns.createdAt,
      completedAt: notificationCampaigns.completedAt,
      occasion: creditGiftDetails.occasion,
      amountPerRecipient: creditGiftDetails.amountPerRecipient,
      internalNote: creditGiftDetails.internalNote,
      creatorDisplayName: users.displayName,
      creatorFirstName: users.firstName,
      creatorLastName: users.lastName,
    })
    .from(notificationCampaigns)
    .innerJoin(
      creditGiftDetails,
      eq(creditGiftDetails.campaignId, notificationCampaigns.id),
    )
    .leftJoin(users, eq(users.id, notificationCampaigns.createdByUserId))
    .where(
      and(
        eq(notificationCampaigns.id, campaignId),
        eq(notificationCampaigns.type, "credit_gift"),
      ),
    )
    .limit(1);
  if (!gift) return null;

  const recipientRows = await db
    .select({
      userId: notificationCampaignRecipients.userId,
      status: notificationCampaignRecipients.status,
      skippedReason: notificationCampaignRecipients.skippedReason,
      notificationId: notificationCampaignRecipients.notificationId,
      revokedAt: notificationCampaignRecipients.revokedAt,
      processedAt: notificationCampaignRecipients.processedAt,
      readAt: notifications.readAt,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(notificationCampaignRecipients)
    .innerJoin(users, eq(users.id, notificationCampaignRecipients.userId))
    .leftJoin(
      notifications,
      eq(notifications.id, notificationCampaignRecipients.notificationId),
    )
    .where(eq(notificationCampaignRecipients.campaignId, campaignId))
    .orderBy(asc(users.displayName), asc(users.id));

  const userIds = recipientRows.map((row) => row.userId);
  const notificationIds = recipientRows
    .map((row) => row.notificationId)
    .filter((id): id is number => id != null);

  const emailKeys = [
    ...new Set(recipientRows.map((row) => row.email.trim().toLowerCase())),
  ];
  const [balanceRows, deliveryRows, blockedRows] = await Promise.all([
    userIds.length
      ? db
          .select({
            userId: creditLedgerEntries.userId,
            balance: sql<number>`coalesce(sum(${creditLedgerEntries.amount}), 0)`,
          })
          .from(creditLedgerEntries)
          .where(inArray(creditLedgerEntries.userId, userIds))
          .groupBy(creditLedgerEntries.userId)
      : Promise.resolve([]),
    notificationIds.length
      ? db
          .select({
            notificationId: notificationDeliveries.notificationId,
            status: notificationDeliveries.status,
            lastError: notificationDeliveries.lastError,
            resendOfDeliveryId: notificationDeliveries.resendOfDeliveryId,
            id: notificationDeliveries.id,
          })
          .from(notificationDeliveries)
          .where(
            and(
              inArray(notificationDeliveries.notificationId, notificationIds),
              // The page reports the email; pushes to devices are not mail.
              eq(notificationDeliveries.channel, "email"),
            ),
          )
          .orderBy(asc(notificationDeliveries.id))
      : Promise.resolve([]),
    emailKeys.length
      ? db
          .select({ emailKey: emailSuppressions.emailKey })
          .from(emailSuppressions)
          .where(
            and(
              inArray(emailSuppressions.emailKey, emailKeys),
              isNull(emailSuppressions.liftedAt),
            ),
          )
      : Promise.resolve([]),
  ]);
  const blocked = new Set(blockedRows.map((row) => row.emailKey));

  const balanceByUser = new Map(
    balanceRows.map((row) => [row.userId, Number(row.balance)]),
  );
  // The latest attempt is what the admin needs to know about; earlier ones
  // only count as re-sends.
  const latestDelivery = new Map<
    number,
    { status: string; lastError: string | null }
  >();
  const resends = new Map<number, number>();
  for (const row of deliveryRows) {
    if (row.notificationId == null) continue;
    latestDelivery.set(row.notificationId, row);
    if (row.resendOfDeliveryId != null) {
      resends.set(
        row.notificationId,
        (resends.get(row.notificationId) ?? 0) + 1,
      );
    }
  }

  const recipients: CreditGiftRecipientRow[] = recipientRows.map((row) => ({
    userId: row.userId,
    name: getUserName(row) || row.email,
    email: row.email,
    status: giftRecipientStatus(row.status),
    skippedReason: row.skippedReason,
    readAt: row.readAt,
    emailState:
      row.notificationId != null
        ? emailStateOf(latestDelivery.get(row.notificationId))
        : "none",
    resendCount:
      row.notificationId != null ? (resends.get(row.notificationId) ?? 0) : 0,
    emailBlocked: blocked.has(row.email.trim().toLowerCase()),
    ledgerBalance: balanceByUser.get(row.userId) ?? 0,
    revokedAt: row.revokedAt,
    processedAt: row.processedAt,
  }));

  const counts = {
    total: recipients.length,
    pending: recipients.filter((row) => row.status === "pending").length,
    granted: recipients.filter((row) => row.status === "granted").length,
    skipped: recipients.filter((row) => row.status === "skipped").length,
    failed: recipients.filter((row) => row.status === "failed").length,
    revoked: recipients.filter((row) => row.revokedAt != null).length,
    read: recipients.filter((row) => row.readAt != null).length,
    emailsSent: recipients.filter((row) => row.emailState === "sent").length,
    emailsFailed: recipients.filter((row) => row.emailState === "failed")
      .length,
  };

  return {
    id: gift.id,
    title: gift.title,
    message: gift.message,
    occasion: gift.occasion,
    amountPerRecipient: Number(gift.amountPerRecipient),
    internalNote: gift.internalNote,
    status: gift.status,
    createdAt: gift.createdAt,
    completedAt: gift.completedAt,
    createdByName:
      getUserName({
        displayName: gift.creatorDisplayName,
        firstName: gift.creatorFirstName,
        lastName: gift.creatorLastName,
      }) || null,
    counts,
    recipients,
  };
}
