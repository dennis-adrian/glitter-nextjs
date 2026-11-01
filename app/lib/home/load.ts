import "server-only";

import { and, eq, inArray, min, ne } from "drizzle-orm";

import type { ProfileType } from "@/app/api/users/definitions";
import {
  getEnrolledConfig,
  getEnrollmentInfo,
} from "@/app/components/participant_dashboard/activity-card/utils";
import { db } from "@/db";
import {
  festivals,
  invoices,
  orders,
  reservationParticipants,
  standReservations,
} from "@/db/schema";
import type { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { fetchPastFestivals } from "@/app/lib/festivals/queries";
import { sortFestivalsForAdmin } from "@/app/lib/festivals/utils";
import {
  buildHistorySummary,
  type HistoryPartner,
  type HistorySummary,
} from "@/app/lib/home/history";
import {
  activityTasks,
  creditTasks,
  festivalTasks,
  orderTasks,
  profileTasks,
  sortHomeTasks,
  type ActivityProofTask,
  type HomeTask,
} from "@/app/lib/home/tasks";
import type { ParticipationHub } from "@/app/lib/participations/hub";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { fetchProducts } from "@/app/lib/products/queries";
import { getProductEffectiveStock } from "@/app/lib/products/variants";
import { reservationStandLabel } from "@/app/lib/reservations/member-stands";
import { resolveSectionClosure } from "@/app/lib/store_settings/closure";
import { hasPlaceholderProfilePicture } from "@/app/lib/utils";

const ACTIVITIES_HREF = "/my_participations/activities";

/** The earliest deadline among the participant's unpaid invoices of a festival. */
async function fetchInvoiceDueAt(userId: number, festivalId: number) {
  const [row] = await db
    .select({ dueAt: min(invoices.dueAt) })
    .from(invoices)
    .innerJoin(
      standReservations,
      eq(invoices.reservationId, standReservations.id),
    )
    .where(
      and(
        eq(invoices.userId, userId),
        eq(invoices.status, "pending"),
        eq(standReservations.festivalId, festivalId),
      ),
    );
  return row?.dueAt ?? null;
}

async function fetchOrdersToPay(userId: number) {
  return db
    .select({ id: orders.id, paymentDueDate: orders.paymentDueDate })
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.status, "pending")));
}

function pendingActivityProofs(hub: ParticipationHub): ActivityProofTask[] {
  const tasks: ActivityProofTask[] = [];
  for (const activity of hub.activities) {
    const info = getEnrollmentInfo(activity, hub.profile.id);
    if (!info.isEnrolled || info.isRemoved) continue;
    const config = getEnrolledConfig(
      activity,
      hub.profile.id,
      info.proofDisplayState,
    );
    if (!config.isPending || config.isUploadExpired) continue;
    tasks.push({
      activityId: activity.id,
      activityName: activity.name,
      pendingLabel: config.pendingLabel,
      deadline: config.deadlineDate,
    });
  }
  return tasks;
}

/**
 * A verified participant's open tasks: the festival's, the activities', store
 * orders to pay and a credit debt.
 */
export async function loadVerifiedTasks({
  profile,
  hub,
  creditDebt,
  now,
}: {
  profile: ProfileType;
  hub: ParticipationHub | null;
  creditDebt: number;
  now: Date;
}): Promise<HomeTask[]> {
  const needsInvoiceDue =
    hub?.pending.some((item) => item.key === "payment" && !item.done) ?? false;
  const [ordersToPay, invoiceDueAt] = await Promise.all([
    fetchOrdersToPay(profile.id),
    hub && needsInvoiceDue
      ? fetchInvoiceDueAt(profile.id, hub.festival.id)
      : Promise.resolve(null),
  ]);

  const tasks = [
    ...creditTasks(creditDebt),
    ...(hub
      ? festivalTasks(hub.pending, {
          standLabel: hub.reservation
            ? `stand ${reservationStandLabel(hub.reservation)}`
            : null,
          invoiceDueAt,
        })
      : []),
    ...(hub ? activityTasks(pendingActivityProofs(hub), ACTIVITIES_HREF) : []),
    ...orderTasks(ordersToPay),
  ];
  return sortHomeTasks(tasks, now);
}

/** A profile under review or rejected: what the review will look at. */
export function profileReviewTasks(profile: ProfileType): HomeTask[] {
  // The same fields `isProfileComplete` requires, split the way a person
  // fixes them: the picture, the bio, the socials, and the rest of the data.
  const details =
    !profile.firstName ||
    !profile.lastName ||
    !profile.birthdate ||
    !profile.phoneNumber ||
    !profile.displayName ||
    !profile.email ||
    !profile.gender ||
    !profile.country ||
    profile.category === "none" ||
    profile.profileSubcategories.length === 0;

  return profileTasks(
    {
      photo: !profile.imageUrl || hasPlaceholderProfilePicture(profile),
      bio: !profile.bio,
      socials: !profile.userSocials.some((social) => !!social.username),
      details,
    },
    { rejected: profile.status === "rejected" },
  );
}

async function fetchPartnersByReservation(
  reservationIds: number[],
  profileId: number,
): Promise<Map<number, HistoryPartner[]>> {
  const map = new Map<number, HistoryPartner[]>();
  if (reservationIds.length === 0) return map;

  const rows = await db.query.reservationParticipants.findMany({
    where: and(
      inArray(reservationParticipants.reservationId, reservationIds),
      ne(reservationParticipants.userId, profileId),
    ),
    columns: { reservationId: true },
    with: {
      user: { columns: { id: true, displayName: true, imageUrl: true } },
    },
  });
  for (const row of rows) {
    const list = map.get(row.reservationId) ?? [];
    list.push(row.user);
    map.set(row.reservationId, list);
  }
  return map;
}

export async function loadHistorySummary(
  profile: ProfileType,
  activeFestivalId: number | null,
): Promise<HistorySummary | null> {
  const accepted = profile.participations.filter(
    (participation) =>
      participation.reservation.status === "accepted" &&
      participation.reservation.festivalId !== activeFestivalId,
  );
  if (accepted.length === 0) return null;

  const [pastFestivals, partnersByReservation] = await Promise.all([
    fetchPastFestivals(),
    fetchPartnersByReservation(
      accepted.map((participation) => participation.reservation.id),
      profile.id,
    ),
  ]);

  return buildHistorySummary({
    participations: profile.participations,
    activeFestivalId,
    pastFestivalIds: pastFestivals.map((festival) => festival.id),
    partnersByReservation,
  });
}

export type HomeProduct = {
  id: number;
  slug: string;
  name: string;
  imageUrl: string | null;
  price: number;
  /** Shown with its rental price when it is rented, not sold. */
  rental: boolean;
};

export type HomeStore = {
  kind: "supplies" | "merch";
  featured: boolean;
  products: HomeProduct[];
};

const STORE_STRIP_SIZE = 6;

/**
 * A few products for Inicio: supplies and rentals for someone with a stand
 * coming up, the store's featured merch for everyone else. Nothing when the
 * section is closed or has nothing in stock.
 */
export async function loadHomeStore(
  kind: "supplies" | "merch",
): Promise<HomeStore | null> {
  const closure = await resolveSectionClosure(kind);
  if (closure.closed) return null;

  const products = (
    await fetchProducts("default", { visibleOnly: true, storeCategory: kind })
  ).filter((product) => getProductEffectiveStock(product) > 0 || product.isRentable);
  const featured =
    kind === "merch" ? products.filter((product) => product.isFeatured) : [];
  const shown = (featured.length > 0 ? featured : products).slice(
    0,
    STORE_STRIP_SIZE,
  );
  if (shown.length === 0) return null;

  return {
    kind,
    featured: featured.length > 0,
    products: shown.map((product) => {
      const image =
        product.images.find((entry) => entry.isMain) ?? product.images[0];
      const rentalOnly =
        product.isRentable &&
        product.rentalPrice != null &&
        getProductEffectiveStock(product) <= 0;
      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        imageUrl: image?.imageUrl ?? null,
        price: rentalOnly
          ? (product.rentalPrice as number)
          : getProductPriceAtPurchase(product),
        rental: rentalOnly,
      };
    }),
  };
}

/**
 * The next announced edition, when nothing is active: the soonest published
 * festival.
 */
export async function loadUpcomingFestival(): Promise<FestivalWithDates | null> {
  const rows = await db.query.festivals.findMany({
    where: eq(festivals.status, "published"),
    with: { festivalDates: true },
  });
  // An edition without dates yet sorts as the oldest; prefer one with dates.
  const dated = rows.filter((row) => row.festivalDates.length > 0);
  const pool = dated.length > 0 ? dated : rows;
  if (pool.length === 0) return null;
  // Newest first; the soonest is the last one.
  const sorted = sortFestivalsForAdmin(pool);
  return sorted[sorted.length - 1] ?? null;
}
