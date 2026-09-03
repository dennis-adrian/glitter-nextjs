import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq, inArray } from "drizzle-orm";

import type { db as DbType } from "@/db";
import {
  festivalDates,
  festivalSectors,
  festivals,
  invoiceSettlementSubmissions,
  invoices,
  mapElements,
  reservationParticipants,
  payments,
  profileSubcategories,
  standGroups,
  standReservationStands,
  standReservations,
  standSubcategories,
  stands,
  subcategories,
  userRequests,
  users,
} from "@/db/schema";

import {
  offsetToDate,
  type FestivalFixture,
  type FixtureFestival,
} from "./festival-fixture";

/**
 * When each mirrored festival happens, relative to the seed run.
 *
 * The newest festival is placed in the near future so its reservation period is
 * open and it is the one you land on; the others sit in the past as history.
 */
const SCHEDULE: Record<string, { startsInDays: number; occupancy: number }> = {
  // Upcoming and bookable. Occupancy is capped so there is something left to
  // reserve: the source festival is almost fully booked, which makes it useless
  // for exercising the booking flow.
  glitter: { startsInDays: 21, occupancy: 0.5 },
  festicker: { startsInDays: -60, occupancy: 1 },
  twinkler: { startsInDays: -180, occupancy: 1 },
};

/** Statuses that take a stand out of circulation. */
const OCCUPYING = new Set(["pending", "verification_payment", "accepted"]);

function loadFixture(): FestivalFixture {
  const path = join(process.cwd(), "scripts/seed/fixtures/festivals.json");
  const fixture = JSON.parse(readFileSync(path, "utf8")) as FestivalFixture;
  if (fixture.version !== 1) {
    throw new Error(
      `Unsupported festival fixture version ${fixture.version}; expected 1.`,
    );
  }
  return fixture;
}

/**
 * Chooses which reservations to keep so a share of the stands stays free.
 *
 * Takes a proportional slice of each status rather than the first N overall, so
 * capping occupancy does not quietly remove every reservation in some state and
 * leave nothing to test against.
 */
function selectReservations(
  festival: FixtureFestival,
  occupancy: number,
): FixtureFestival["reservations"] {
  if (occupancy >= 1) return festival.reservations;

  const occupying = festival.reservations.filter((r) =>
    OCCUPYING.has(r.status),
  );
  const historical = festival.reservations.filter(
    (r) => !OCCUPYING.has(r.status),
  );
  const budget = Math.max(1, Math.floor(festival.stands.length * occupancy));

  const byStatus = new Map<string, FixtureFestival["reservations"]>();
  for (const reservation of occupying) {
    byStatus.set(reservation.status, [
      ...(byStatus.get(reservation.status) ?? []),
      reservation,
    ]);
  }

  const kept: FixtureFestival["reservations"] = [];
  for (const [, group] of byStatus) {
    const share = Math.max(
      1,
      Math.round((group.length / occupying.length) * budget),
    );
    kept.push(...group.slice(0, share));
  }

  // Historical rows hold no capacity, so they all stay: they are what makes
  // rejected and cancelled states testable.
  return [...kept.slice(0, budget), ...historical];
}

export type SeedFestivalsResult = {
  festivals: Array<{ name: string; reservations: number; freeStands: number }>;
  users: number;
};

/**
 * Inserts the mirrored festivals, participants and reservation history.
 *
 * Idempotent by festival name: a festival that is already present is skipped
 * whole rather than partially rebuilt, so re-running never doubles the data.
 */
export async function seedFestivals(
  database: typeof DbType,
): Promise<SeedFestivalsResult> {
  const fixture = loadFixture();

  // Subcategories are matched by name: their ids differ between databases.
  const existingSubcategories = await database
    .select({ id: subcategories.id, label: subcategories.label })
    .from(subcategories);
  const subcategoryIdByName = new Map(
    existingSubcategories.map((row) => [row.label, row.id]),
  );
  const subcategoryId = (ref: number): number | null => {
    const entry = fixture.subcategories.find((row) => row.ref === ref);
    if (!entry) return null;
    return subcategoryIdByName.get(entry.name) ?? null;
  };

  const now = new Date();

  // ---- participants -------------------------------------------------------
  const emails = fixture.users.map((user) => user.email);
  const existingUsers = await database
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.email, emails));
  const userIdByEmail = new Map(
    existingUsers.map((row) => [row.email, row.id]),
  );

  const missing = fixture.users.filter(
    (user) => !userIdByEmail.has(user.email),
  );
  if (missing.length > 0) {
    const inserted = await database
      .insert(users)
      .values(
        missing.map((user) => ({
          // Never a real address, and the clerk id is synthetic: these
          // participants exist to populate scenarios, not to sign in.
          clerkId: `seed_participant_${user.ref}`,
          email: user.email,
          displayName: user.displayName,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role as "user",
          status: user.status as "verified",
          category: user.category as "illustration",
          participationType: user.participationType as "standard",
          country: user.country ?? "BO",
          verifiedAt:
            user.verifiedAtOffset != null
              ? offsetToDate(now, user.verifiedAtOffset)
              : null,
        })),
      )
      .returning({ id: users.id, email: users.email });
    for (const row of inserted) userIdByEmail.set(row.email, row.id);

    const subcategoryRows = missing.flatMap((user) =>
      user.subcategoryRefs
        .map((ref) => subcategoryId(ref))
        .filter((id): id is number => id != null)
        .map((id) => ({
          profileId: userIdByEmail.get(user.email)!,
          subcategoryId: id,
        })),
    );
    if (subcategoryRows.length > 0) {
      await database
        .insert(profileSubcategories)
        .values(subcategoryRows)
        .onConflictDoNothing();
    }
  }

  const userId = (ref: number | null): number | null => {
    if (ref == null) return null;
    const user = fixture.users.find((row) => row.ref === ref);
    return user ? (userIdByEmail.get(user.email) ?? null) : null;
  };

  // ---- festivals ----------------------------------------------------------
  const results: SeedFestivalsResult["festivals"] = [];

  for (const fixtureFestival of fixture.festivals) {
    const [already] = await database
      .select({ id: festivals.id })
      .from(festivals)
      .where(eq(festivals.name, fixtureFestival.name))
      .limit(1);
    if (already) {
      results.push({
        name: fixtureFestival.name,
        reservations: 0,
        freeStands: 0,
      });
      continue;
    }

    const schedule = SCHEDULE[fixtureFestival.festivalType] ?? {
      startsInDays: -30,
      occupancy: 1,
    };
    const anchor = offsetToDate(now, schedule.startsInDays);

    const [festival] = await database
      .insert(festivals)
      .values({
        name: fixtureFestival.name,
        description: fixtureFestival.description,
        festivalType: fixtureFestival.festivalType as "glitter",
        status: fixtureFestival.status as "active",
        locationLabel: fixtureFestival.locationLabel,
        address: fixtureFestival.address,
        publicRegistration: fixtureFestival.publicRegistration,
        eventDayRegistration: fixtureFestival.eventDayRegistration,
        keepStoreOpen: fixtureFestival.keepStoreOpen,
        participantTermsEnabled: fixtureFestival.participantTermsEnabled,
        reservationHoldMinutes: fixtureFestival.reservationHoldMinutes,
        startDate: anchor,
        endDate: offsetToDate(anchor, fixtureFestival.durationDays),
        // notNull with a default; fall back to the festival start so a fixture
        // without the offset still produces a coherent reservation window.
        reservationsStartDate:
          fixtureFestival.reservationsStartOffset != null
            ? offsetToDate(anchor, fixtureFestival.reservationsStartOffset)
            : anchor,
      })
      .returning({ id: festivals.id });

    if (fixtureFestival.dates.length > 0) {
      await database.insert(festivalDates).values(
        fixtureFestival.dates.map((date) => ({
          festivalId: festival.id,
          startDate: offsetToDate(anchor, date.startOffset),
          endDate: offsetToDate(anchor, date.endOffset),
        })),
      );
    }

    const sectorIdByRef = new Map<number, number>();
    for (const sector of fixtureFestival.sectors) {
      const [row] = await database
        .insert(festivalSectors)
        .values({
          festivalId: festival.id,
          name: sector.name,
          description: sector.description,
          orderInFestival: sector.orderInFestival,
          mapOriginX: sector.mapOriginX,
          mapOriginY: sector.mapOriginY,
          mapWidth: sector.mapWidth,
          mapHeight: sector.mapHeight,
        })
        .returning({ id: festivalSectors.id });
      sectorIdByRef.set(sector.ref, row.id);

      if (sector.mapElements.length > 0) {
        await database.insert(mapElements).values(
          sector.mapElements.map((element) => ({
            festivalSectorId: row.id,
            type: element.type as "custom",
            label: element.label,
            positionLeft: element.positionLeft ?? 0,
            positionTop: element.positionTop ?? 0,
            width: element.width ?? 0,
            height: element.height ?? 0,
            rotation: element.rotation,
          })),
        );
      }
    }

    const groupIdByRef = new Map<number, number>();
    for (const group of fixtureFestival.standGroups) {
      const [row] = await database
        .insert(standGroups)
        .values({
          festivalSectorId: sectorIdByRef.get(group.sectorRef)!,
          type: group.type as "visual_group",
        })
        .returning({ id: standGroups.id });
      groupIdByRef.set(group.ref, row.id);
    }

    const keptReservations = selectReservations(
      fixtureFestival,
      schedule.occupancy,
    );
    const occupiedStandRefs = new Set(
      keptReservations
        .filter((reservation) => OCCUPYING.has(reservation.status))
        .flatMap((reservation) =>
          reservation.members.length > 0
            ? reservation.members
                .filter((member) => !member.released)
                .map((member) => member.standRef)
            : [reservation.standRef],
        ),
    );

    const standIdByRef = new Map<number, number>();
    const insertedStands = await database
      .insert(stands)
      .values(
        fixtureFestival.stands.map((stand) => ({
          festivalId: festival.id,
          festivalSectorId: sectorIdByRef.get(stand.sectorRef)!,
          label: stand.label,
          standNumber: stand.standNumber,
          // A stand nobody occupies must read as available, otherwise capping
          // occupancy would leave it visually taken and unbookable.
          status: occupiedStandRefs.has(stand.ref)
            ? (stand.status as "reserved")
            : ("available" as const),
          standCategory: stand.standCategory as "illustration",
          participationType: stand.participationType as "standard",
          zone: stand.zone as "main",
          orientation: (stand.orientation ?? "landscape") as "landscape",
          width: stand.width ?? 0,
          height: stand.height ?? 0,
          positionLeft: stand.positionLeft ?? 0,
          positionTop: stand.positionTop ?? 0,
          price: stand.price,
          individualPrice: stand.individualPrice,
          sharedPrice: stand.sharedPrice,
          standGroupId:
            stand.groupRef != null
              ? (groupIdByRef.get(stand.groupRef) ?? null)
              : null,
        })),
      )
      .returning({ id: stands.id });
    fixtureFestival.stands.forEach((stand, index) =>
      standIdByRef.set(stand.ref, insertedStands[index].id),
    );

    const standSubcategoryRows = fixtureFestival.stands.flatMap((stand) =>
      stand.subcategoryRefs
        .map((ref) => subcategoryId(ref))
        .filter((id): id is number => id != null)
        .map((id) => ({
          standId: standIdByRef.get(stand.ref)!,
          subcategoryId: id,
        })),
    );
    if (standSubcategoryRows.length > 0) {
      await database
        .insert(standSubcategories)
        .values(standSubcategoryRows)
        .onConflictDoNothing();
    }

    const enrollmentRows = fixtureFestival.enrollments
      .map((enrollment) => ({
        userId: userId(enrollment.userRef),
        festivalId: festival.id,
        type: enrollment.type as "festival_participation",
        status: enrollment.status as "accepted",
      }))
      .filter(
        (row): row is typeof row & { userId: number } => row.userId != null,
      );
    if (enrollmentRows.length > 0) {
      await database.insert(userRequests).values(enrollmentRows);
    }

    let reservationCount = 0;
    for (const reservation of keptReservations) {
      const standId = standIdByRef.get(reservation.standRef);
      if (!standId) continue;

      const [row] = await database
        .insert(standReservations)
        .values({
          festivalId: festival.id,
          standId,
          status: reservation.status as "pending",
          source: reservation.source as "user_reservation",
          ownerUserId: userId(reservation.ownerRef),
          priceAmountSnapshot: reservation.priceAmountSnapshot,
          individualPriceSnapshot: reservation.individualPriceSnapshot,
          sharedPriceSnapshot: reservation.sharedPriceSnapshot,
          bookedParticipantCount: reservation.bookedParticipantCount,
          revealAt:
            reservation.revealAtOffset != null
              ? offsetToDate(anchor, reservation.revealAtOffset)
              : null,
          createdAt: offsetToDate(anchor, reservation.createdAtOffset),
        })
        .returning({ id: standReservations.id });
      reservationCount += 1;

      const members =
        reservation.members.length > 0
          ? reservation.members
          : [{ standRef: reservation.standRef, position: 0, released: false }];
      await database.insert(standReservationStands).values(
        members
          .map((member) => ({
            reservationId: row.id,
            standId: standIdByRef.get(member.standRef)!,
            position: member.position,
            releasedAt: member.released
              ? offsetToDate(anchor, reservation.createdAtOffset)
              : null,
          }))
          .filter((member) => member.standId != null),
      );

      const participantRows = reservation.participantRefs
        .map((ref) => userId(ref))
        .filter((id): id is number => id != null)
        .map((id) => ({ userId: id, reservationId: row.id }));
      if (participantRows.length > 0) {
        await database
          .insert(reservationParticipants)
          .values(participantRows)
          .onConflictDoNothing();
      }

      const invoice = reservation.invoice;
      if (!invoice) continue;
      const invoiceUserId = userId(invoice.userRef);
      if (invoiceUserId == null) continue;

      const [invoiceRow] = await database
        .insert(invoices)
        .values({
          userId: invoiceUserId,
          reservationId: row.id,
          amount: invoice.amount,
          originalAmount: invoice.originalAmount,
          discountAmount: invoice.discountAmount,
          status: invoice.status as "pending",
          date: offsetToDate(anchor, invoice.dateOffset),
          dueAt:
            invoice.dueAtOffset != null
              ? offsetToDate(anchor, invoice.dueAtOffset)
              : null,
        })
        .returning({ id: invoices.id });

      if (invoice.payments.length > 0) {
        const insertedPayments = await database
          .insert(payments)
          .values(
            // No voucher or uploader: the fixture carries no uploaded files, and
            // nothing in the app needs them to render payment history.
            invoice.payments.map((payment) => ({
              invoiceId: invoiceRow.id,
              amount: payment.amount,
              date: offsetToDate(anchor, payment.dateOffset),
              // The column is required, and the fixture carries no real
              // vouchers. A local asset keeps the payment view renderable and
              // is obviously not a participant's receipt.
              voucherUrl: "/img/glitter-mascot-with-stand-sm.png",
            })),
          )
          .returning({ id: payments.id });

        // A payment on a settled invoice must have the proof submission that
        // produced it; without one the reservation invariant audit reports the
        // seeded data as broken, and the admin settlement views have nothing
        // to show.
        await database.insert(invoiceSettlementSubmissions).values({
          invoiceId: invoiceRow.id,
          paymentId: insertedPayments[0]?.id ?? null,
          kind: "payment_proof" as const,
          status: (invoice.status === "paid" ? "approved" : "submitted") as
            | "approved"
            | "submitted",
          voucherUrl: "/img/glitter-mascot-with-stand-sm.png",
          fileKey: `seed-${invoiceRow.id}`,
          uploadedByUserId: invoiceUserId,
          reviewedByUserId: invoice.status === "paid" ? invoiceUserId : null,
          reviewedAt:
            invoice.status === "paid"
              ? offsetToDate(anchor, invoice.dateOffset)
              : null,
        });
      }
    }

    results.push({
      name: fixtureFestival.name,
      reservations: reservationCount,
      freeStands: fixtureFestival.stands.length - occupiedStandRefs.size,
    });
  }

  return { festivals: results, users: fixture.users.length };
}
