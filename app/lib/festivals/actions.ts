"use server";

import {
  BaseProfile,
  ParticipationWithParticipantWithInfractionsAndReservations,
} from "@/app/api/users/definitions";
import { withMembershipReservationsBySector } from "@/app/lib/reservations/stand-occupancy";
import { getFestivalSectorAllowedCategories } from "@/app/lib/festival_sectors/helpers";
import { db } from "@/db";
import {
  creditLedgerEntries,
  festivalActivities,
  festivalDates,
  festivalStatusEnum,
  festivalStatusEvents,
  festivals,
  festivalSectors,
  infractions,
  reservationFeatureActions,
  reservationParticipants,
  stands,
  standReservations,
  tickets,
  userRequests,
  users,
} from "@/db/schema";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  not,
  or,
  sql,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  FestivalActivityWithDetailsAndParticipants,
  FestivalBase,
  PublicFestivalPage,
  FestivalWithDates,
  FestivalWithDatesAndSectors,
  FestivalWithTicketsAndDates,
  FullFestival,
} from "./definitions";
import {
  recordFestivalCreatedStatus,
  transitionFestivalStatus,
} from "./status-transitions";
import {
  lockFestivalRow,
  lockFestivalTermsDocument,
} from "@/app/lib/reservations/locks";
import { recalculateReservationEligibleAtForFestival } from "@/app/lib/sanctions/festival-counting";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

function isValidFestivalStatus(
  status: unknown,
): status is (typeof festivalStatusEnum.enumValues)[number] {
  return festivalStatusEnum.enumValues.includes(
    status as (typeof festivalStatusEnum.enumValues)[number],
  );
}

async function hasLedgerReferencedFeatureAction(festivalId: number) {
  const [featureAction] = await db
    .select({ id: reservationFeatureActions.id })
    .from(reservationFeatureActions)
    .innerJoin(
      creditLedgerEntries,
      eq(creditLedgerEntries.featureActionId, reservationFeatureActions.id),
    )
    .where(eq(reservationFeatureActions.festivalId, festivalId))
    .limit(1);

  return Boolean(featureAction);
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23503"
  );
}

async function archiveLedgerReferencedFestival(festivalId: number) {
  const archived = await archiveFestival(festivalId);
  return archived.success
    ? {
        success: true,
        message: "Festival archivado; se conserva su historial de créditos.",
      }
    : archived;
}

/**
 * Whether the festival ever changed status after it was created. That
 * history feeds sanction counting, and `festival_status_events` keeps it with
 * ON DELETE RESTRICT; only the creation row of a festival that never moved
 * carries nothing worth keeping.
 */
async function hasStatusTransitions(festivalId: number) {
  const [transition] = await db
    .select({ id: festivalStatusEvents.id })
    .from(festivalStatusEvents)
    .where(
      and(
        eq(festivalStatusEvents.festivalId, festivalId),
        isNotNull(festivalStatusEvents.fromStatus),
      ),
    )
    .limit(1);

  return Boolean(transition);
}

/**
 * Tickets and reservations point at their festival without a foreign key, so
 * deleting the festival would orphan them rather than fail. Any of them means
 * the festival happened, or nearly did, and is archived instead.
 */
async function hasTicketsOrReservations(festivalId: number) {
  const [[ticket], [reservation]] = await Promise.all([
    db
      .select({ id: tickets.id })
      .from(tickets)
      .where(eq(tickets.festivalId, festivalId))
      .limit(1),
    db
      .select({ id: standReservations.id })
      .from(standReservations)
      .where(eq(standReservations.festivalId, festivalId))
      .limit(1),
  ]);
  return Boolean(ticket || reservation);
}

async function archiveFestivalWithStatusHistory(festivalId: number) {
  const archived = await archiveFestival(festivalId);
  return archived.success
    ? {
        success: true,
        message:
          "El festival ya tuvo actividad (estados, entradas o reservas), así que se archivó para conservar su historial.",
      }
    : archived;
}

export async function createFestival(
  festivalData: Omit<typeof festivals.$inferInsert, "id"> & {
    dates?: Array<{
      date: Date;
      startTime: string;
      endTime: string;
    }>;
    dateDetails?: Array<{
      startDate: Date;
      endDate: Date;
    }>;
    festivalSectors?: Array<{
      name: string;
      orderInFestival: number;
      mapUrl?: string | null;
      mascotUrl?: string | null;
    }>;
  },
) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [newFestival] = await tx
        .insert(festivals)
        .values({
          name: festivalData.name,
          description: festivalData.description || null,
          address: festivalData.address || null,
          locationLabel: festivalData.locationLabel || null,
          locationUrl: festivalData.locationUrl || null,
          // A festival is born as a draft (or published), closed to
          // visitors. Activation and acreditación have their own actions,
          // which enforce one active festival and offer the invitations.
          status: festivalData.status === "published" ? "published" : "draft",
          mapsVersion: festivalData.mapsVersion || "v1",
          publicRegistration: false,
          eventDayRegistration: false,
          festivalType: festivalData.festivalType || "glitter",
          reservationsStartDate:
            festivalData.reservationsStartDate || new Date(),
          generalMapUrl: festivalData.generalMapUrl || null,
          mascotUrl: festivalData.mascotUrl || null,
          illustrationPaymentQrCodeUrl:
            festivalData.illustrationPaymentQrCodeUrl || null,
          gastronomyPaymentQrCodeUrl:
            festivalData.gastronomyPaymentQrCodeUrl || null,
          entrepreneurshipPaymentQrCodeUrl:
            festivalData.entrepreneurshipPaymentQrCodeUrl || null,
          illustrationStandUrl: festivalData.illustrationStandUrl || null,
          gastronomyStandUrl: festivalData.gastronomyStandUrl || null,
          entrepreneurshipStandUrl:
            festivalData.entrepreneurshipStandUrl || null,
          festivalCode: festivalData.festivalCode || null,
          festivalBannerUrl: festivalData.festivalBannerUrl || null,
          updatedAt: new Date(),
          createdAt: new Date(),
        })
        .returning();

      if (festivalData.dateDetails && festivalData.dateDetails.length > 0) {
        for (const dateItem of festivalData.dateDetails) {
          await tx.insert(festivalDates).values({
            festivalId: newFestival.id,
            startDate: dateItem.startDate,
            endDate: dateItem.endDate,
            updatedAt: new Date(),
            createdAt: new Date(),
          });
        }
      }
      if (
        festivalData.festivalSectors &&
        festivalData.festivalSectors.length > 0
      ) {
        for (const sector of festivalData.festivalSectors) {
          await tx.insert(festivalSectors).values({
            festivalId: newFestival.id,
            name: sector.name,
            orderInFestival: sector.orderInFestival,
            mapUrl: sector.mapUrl || null,
            mascotUrl: sector.mascotUrl || null,
            updatedAt: new Date(),
            createdAt: new Date(),
          });
        }
      }

      await recordFestivalCreatedStatus(tx, {
        festivalId: newFestival.id,
        status: newFestival.status,
        actorUserId: actor.id,
      });

      return newFestival;
    });

    revalidatePath("/dashboard/festivals");
    return {
      success: true,
      message: "Festival creado exitosamente!",
      data: result,
    };
  } catch (error) {
    console.error("Error creating festival", error);
    return {
      success: false,
      message: "Failed to create festival",
    };
  }
}

export async function deleteFestival(festivalId: number) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

  try {
    // Ledger entries are append-only. Retain their feature-action parent by
    // archiving the festival instead of cascading a delete through it.
    if (await hasLedgerReferencedFeatureAction(festivalId)) {
      return archiveLedgerReferencedFestival(festivalId);
    }
    if (
      (await hasStatusTransitions(festivalId)) ||
      (await hasTicketsOrReservations(festivalId))
    ) {
      return archiveFestivalWithStatusHistory(festivalId);
    }

    await db.transaction(async (tx) => {
      // Only the creation row is left (see hasStatusTransitions); it would
      // otherwise block the delete through its RESTRICT foreign key.
      await tx
        .delete(festivalStatusEvents)
        .where(
          and(
            eq(festivalStatusEvents.festivalId, festivalId),
            isNull(festivalStatusEvents.fromStatus),
          ),
        );
      await tx.delete(festivals).where(eq(festivals.id, festivalId));
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      try {
        // A ledger entry may have posted after the initial lookup. The
        // RESTRICT FK is the final arbiter, so turn that expected race into
        // the same archival outcome as a pre-existing reference.
        if (await hasLedgerReferencedFeatureAction(festivalId)) {
          return archiveLedgerReferencedFestival(festivalId);
        }
        // Likewise for a status change made after the check above.
        if (await hasStatusTransitions(festivalId)) {
          return archiveFestivalWithStatusHistory(festivalId);
        }
      } catch (recheckError) {
        console.error(
          "Error rechecking festival ledger references:",
          recheckError,
        );
      }
    }

    console.error("Error deleting festival:", error);
    return {
      success: false,
      message:
        "Error al eliminar el festival. Por favor verifica que no haya datos relacionados.",
    };
  }
  revalidatePath("/dashboard/festivals");
  return {
    success: true,
    message: "Festival eliminado correctamente!",
  };
}

export async function fetchActiveFestivalBase() {
  try {
    return await db.query.festivals.findFirst({
      where: eq(festivals.status, "active"),
    });
  } catch (error) {
    console.error("Error fetching active festival base", error);
    throw error;
  }
}

export async function updateFestival(
  data: Omit<typeof festivals.$inferInsert, "id"> & {
    id: number;
    dates?: Array<{
      id?: number;
      date: Date;
      startTime: string;
      endTime: string;
    }>;
    dateDetails?: Array<{
      startDate: Date;
      endDate: Date;
    }>;
    festivalSectors?: Array<{
      id?: number;
      name: string;
      orderInFestival: number;
      mapUrl?: string;
      mascotUrl?: string;
    }>;
    deletedSectorIds?: number[];
  },
) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }
  if (!Number.isInteger(data.id) || data.id <= 0) {
    return { success: false, message: "Festival inválido" };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          id: festivals.id,
          status: festivals.status,
          reservationsStartDate: festivals.reservationsStartDate,
        })
        .from(festivals)
        .where(eq(festivals.id, data.id))
        .for("update");

      if (!existing) {
        throw new Error("Festival no encontrado");
      }

      // Status is immutable here — transitions go through updateFestivalStatus /
      // archiveFestival so concurrent transitions stay authoritative.
      if (!isValidFestivalStatus(existing.status)) {
        throw new Error("INVALID_FESTIVAL_STATUS");
      }
      const nextReservationsStartDate =
        data.reservationsStartDate ?? existing.reservationsStartDate;

      const [updatedFestival] = await tx
        .update(festivals)
        .set({
          name: data.name,
          description: data.description || null,
          address: data.address || null,
          locationLabel: data.locationLabel || null,
          locationUrl: data.locationUrl || null,
          // Status is owned by the locked row; transitions use dedicated APIs.
          status: existing.status,
          mapsVersion: data.mapsVersion || "v1",
          // publicRegistration and eventDayRegistration are not written here
          // either: the edit form only carries the values it loaded, so saving
          // it would undo a registration change made since. They go through
          // updateFestivalRegistration / updateFestivalEventDayRegistration.
          keepStoreOpen: data.keepStoreOpen || false,
          festivalType: data.festivalType || "glitter",
          reservationsStartDate: nextReservationsStartDate,
          generalMapUrl: data.generalMapUrl || null,
          mascotUrl: data.mascotUrl || null,
          illustrationPaymentQrCodeUrl:
            data.illustrationPaymentQrCodeUrl || null,
          gastronomyPaymentQrCodeUrl: data.gastronomyPaymentQrCodeUrl || null,
          entrepreneurshipPaymentQrCodeUrl:
            data.entrepreneurshipPaymentQrCodeUrl || null,
          illustrationStandUrl: data.illustrationStandUrl || null,
          gastronomyStandUrl: data.gastronomyStandUrl || null,
          entrepreneurshipStandUrl: data.entrepreneurshipStandUrl || null,
          festivalCode: data.festivalCode || null,
          festivalBannerUrl: data.festivalBannerUrl || null,
          posterUrl: data.posterUrl || null,
          updatedAt: new Date(),
        })
        .where(eq(festivals.id, data.id))
        .returning();

      // Get existing dates to compare
      const existingDates = await tx
        .select()
        .from(festivalDates)
        .where(eq(festivalDates.festivalId, data.id));

      if (data.dateDetails && data.dateDetails.length > 0) {
        for (let i = 0; i < data.dateDetails.length; i++) {
          const dateItem = data.dateDetails[i];
          const originalDateItem = data.dates?.[i];

          if (originalDateItem?.id) {
            // Update existing date
            await tx
              .update(festivalDates)
              .set({
                startDate: dateItem.startDate,
                endDate: dateItem.endDate,
                updatedAt: new Date(),
              })
              .where(eq(festivalDates.id, originalDateItem.id));
          } else {
            await tx.insert(festivalDates).values({
              festivalId: data.id,
              startDate: dateItem.startDate,
              endDate: dateItem.endDate,
              updatedAt: new Date(),
              createdAt: new Date(),
            });
          }
        }
        // Delete dates that were removed
        const datesToKeep =
          (data.dates?.map((d) => d.id).filter(Boolean) as number[]) || [];
        const datesToDelete = existingDates
          .filter((d) => !datesToKeep.includes(d.id))
          .map((d) => d.id);

        if (datesToDelete.length > 0) {
          await tx
            .delete(festivalDates)
            .where(inArray(festivalDates.id, datesToDelete));
        }
      }
      if (data.festivalSectors) {
        for (const sector of data.festivalSectors) {
          if (sector.id) {
            await tx
              .update(festivalSectors)
              .set({
                name: sector.name,
                orderInFestival: sector.orderInFestival,
                mapUrl: sector.mapUrl || null,
                mascotUrl: sector.mascotUrl || null,
                updatedAt: new Date(),
              })
              .where(eq(festivalSectors.id, sector.id));
          } else {
            await tx.insert(festivalSectors).values({
              festivalId: data.id,
              name: sector.name,
              orderInFestival: sector.orderInFestival,
              mapUrl: sector.mapUrl || null,
              mascotUrl: sector.mascotUrl || null,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        }
        if (data.deletedSectorIds && data.deletedSectorIds.length > 0) {
          const reservationsInDeletedSectors = await tx
            .select({
              reservationId: standReservations.id,
              sectorId: stands.festivalSectorId,
            })
            .from(standReservations)
            .innerJoin(stands, eq(standReservations.standId, stands.id))
            .innerJoin(
              festivalSectors,
              eq(stands.festivalSectorId, festivalSectors.id),
            )
            .where(
              and(
                inArray(stands.festivalSectorId, data.deletedSectorIds),
                eq(stands.festivalId, data.id),
                eq(festivalSectors.festivalId, data.id),
              ),
            )
            .limit(1);

          if (reservationsInDeletedSectors.length > 0) {
            throw new Error("SECTOR_HAS_RESERVATIONS");
          }

          await tx
            .delete(festivalSectors)
            .where(
              and(
                inArray(festivalSectors.id, data.deletedSectorIds),
                eq(festivalSectors.festivalId, data.id),
              ),
            );
        }
      }

      const affectedSanctionIds = new Set<number>();

      if (
        existing.reservationsStartDate.getTime() !==
        nextReservationsStartDate.getTime()
      ) {
        const recalculated = await recalculateReservationEligibleAtForFestival(
          tx,
          {
            festivalId: data.id,
            reservationsStartDate: nextReservationsStartDate,
            actorUserId: actor.id,
          },
        );
        for (const sanctionId of recalculated) {
          affectedSanctionIds.add(sanctionId);
        }
      }

      return {
        festival: updatedFestival,
        affectedSanctionIds: [...affectedSanctionIds],
      };
    });

    revalidatePath("/dashboard/festivals");
    revalidatePath(`/dashboard/festivals/${data.id}`);
    for (const sanctionId of result.affectedSanctionIds) {
      revalidatePath(`/dashboard/sanctions/${sanctionId}`);
    }
    return {
      success: true,
      message: "Festival actualizado correctamente.",
      data: result.festival,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "SECTOR_HAS_RESERVATIONS") {
      return {
        success: false,
        message:
          "No puedes eliminar sectores que tienen stands con reservaciones. Elimina esas reservaciones primero.",
      };
    }
    console.error("Error updating festival:", error);
    return {
      success: false,
      message: "No se pudo actualizar el festival. Inténtalo nuevamente.",
    };
  }
}

export async function fetchFestivalActivityForReview(
  festivalId: number,
  activityId: number,
) {
  try {
    return await db.query.festivalActivities.findFirst({
      where: and(
        eq(festivalActivities.festivalId, festivalId),
        eq(festivalActivities.id, activityId),
      ),
      with: {
        details: {
          orderBy: (details, { asc }) => [asc(details.id)],
          with: {
            participants: {
              with: {
                proofs: true,
                user: true,
              },
            },
          },
        },
      },
    });
  } catch (error) {
    console.error("Error fetching festival activity for review", error);
    throw error;
  }
}

/** Active + published festivals (e.g. dashboard/portal) — not the marketing banner carousel. */
export async function fetchPublishedActiveFestivals(): Promise<
  FestivalWithDates[]
> {
  try {
    return (await db.query.festivals.findMany({
      where: or(
        eq(festivals.status, "active"),
        eq(festivals.status, "published"),
      ),
      with: { festivalDates: true },
      orderBy: desc(festivals.id),
    })) as FestivalWithDates[];
  } catch (error) {
    console.error("Error fetching published/active festivals", error);
    throw error;
  }
}

export async function fetchFestivalActivitiesByFestivalId(
  festivalId: number,
): Promise<FestivalActivityWithDetailsAndParticipants[]> {
  try {
    return (await db.query.festivalActivities.findMany({
      where: eq(festivalActivities.festivalId, festivalId),
      with: {
        details: {
          with: {
            participants: {
              with: {
                proofs: true,
                user: true,
              },
            },
            votes: true,
          },
        },
        waitlistEntries: { with: { user: true } },
      },
    })) as FestivalActivityWithDetailsAndParticipants[];
  } catch (error) {
    console.error("Error fetching festival activities by festival id", error);
    throw error;
  }
}

export async function fetchFestivalWithDatesAndSectors(
  id: number,
): Promise<FestivalWithDatesAndSectors | null> {
  try {
    const festival = await db.query.festivals.findFirst({
      where: eq(festivals.id, id),
      with: {
        festivalDates: true,
        festivalSectors: {
          with: {
            stands: {
              with: {
                // The nested reservation is fetched under its own short alias:
                // Postgres truncates identifiers at 63 bytes, and a deeper chain
                // here collides `_participants` with `_participants_user`.
                reservations: {
                  columns: {
                    id: true,
                  },
                },
                // Flat membership; joined to the reservations above in memory.
                reservationMembers: true,
              },
            },
          },
        },
      },
    });

    if (!festival) return null;

    return {
      ...festival,
      festivalSectors: withMembershipReservationsBySector(
        festival.festivalSectors,
      ),
    } as FestivalWithDatesAndSectors;
  } catch (error) {
    console.error("Error fetching festival with dates and sectors", error);
    throw error;
  }
}

export async function fetchActiveFestivalWithDates(): Promise<FestivalWithDates | null> {
  try {
    const festival = await db.query.festivals.findFirst({
      where: eq(festivals.status, "active"),
      with: {
        festivalDates: true,
      },
    });

    return festival as FestivalWithDates | null;
  } catch (error) {
    console.error("Error fetching active festival with dates", error);
    throw error;
  }
}

export async function fetchFestival({
  acceptedUsersOnly = false,
  id,
}: {
  acceptedUsersOnly?: boolean;
  id?: number;
}): Promise<FullFestival | null | undefined> {
  const whereCondition = acceptedUsersOnly
    ? { where: eq(userRequests.status, "accepted") }
    : {};

  const festivalWhereCondition = id
    ? { where: eq(festivals.id, id) }
    : { where: eq(festivals.status, "active") };

  try {
    return await db.query.festivals.findFirst({
      ...festivalWhereCondition,
      with: {
        festivalDates: true,
        userRequests: {
          with: {
            user: {
              with: {
                participations: {
                  with: {
                    reservation: {
                      with: {
                        stand: true,
                        festival: true,
                      },
                    },
                  },
                },
                userRequests: true,
              },
            },
          },
          ...whereCondition,
        },
        standReservations: true,
        festivalSectors: {
          with: {
            stands: true,
          },
        },
        festivalActivities: {
          with: {
            details: {
              with: {
                participants: {
                  with: {
                    user: true,
                    proofs: true,
                  },
                },
                votes: true,
              },
            },
            waitlistEntries: { with: { user: true } },
          },
        },
      },
    });
  } catch (error) {
    console.error("Error fetching festival", error);
    throw error;
  }
}

export async function fetchFestivalWithTicketsAndDates(
  id: number,
): Promise<FestivalWithTicketsAndDates | null | undefined> {
  try {
    return await db.query.festivals.findFirst({
      where: eq(festivals.id, id),
      with: {
        festivalDates: true,
        tickets: {
          with: {
            visitor: true,
          },
        },
      },
    });
  } catch (error) {
    console.error("Error fetching festival with tickets and dates", error);
    throw error;
  }
}

export async function fetchBaseFestival(
  id: number,
): Promise<FestivalBase | null | undefined> {
  try {
    return await db.query.festivals.findFirst({
      where: eq(festivals.id, id),
    });
  } catch (error) {
    console.error("Error fetching base festival", error);
    throw error;
  }
}

export async function fetchFestivalWithDates(
  id: number,
): Promise<FestivalWithDates | null | undefined> {
  try {
    return await db.query.festivals.findFirst({
      with: {
        festivalDates: true,
      },
      where: eq(festivals.id, id),
    });
  } catch (error) {
    console.error("Error fetching festival with dates", error);
    throw error;
  }
}

/** Public festival page data only; excludes participant/admin relation trees. */
export async function fetchPublicFestivalPage(
  id: number,
): Promise<PublicFestivalPage | undefined> {
  return await db.query.festivals.findFirst({
    where: and(
      eq(festivals.id, id),
      inArray(festivals.status, ["published", "active", "archived"]),
    ),
    with: {
      festivalDates: true,
      festivalActivities: {
        where: eq(festivalActivities.accessLevel, "public"),
      },
    },
  });
}

export async function fetchFestivals(): Promise<FestivalWithDates[]> {
  try {
    return await db.query.festivals.findMany({
      with: {
        festivalDates: true,
      },
      orderBy: desc(festivals.id),
    });
  } catch (error) {
    console.error("Error fetching festivals", error);
    throw error;
  }
}

/**
 * Every page that reads a festival's status or registration switches: the
 * dashboard, and the public festival pages whose registration forms open and
 * close with them.
 */
function revalidateFestivalPages(
  festivalId: number,
  associatedSanctionIds: readonly number[] = [],
) {
  revalidatePath("/dashboard/festivals");
  revalidatePath(`/dashboard/festivals/${festivalId}`);
  revalidatePath(`/festivals/${festivalId}`, "layout");
  revalidatePath("/");
  for (const sanctionId of associatedSanctionIds) {
    revalidatePath(`/dashboard/sanctions/${sanctionId}`);
  }
}

function isValidFestivalId(festivalId: unknown): festivalId is number {
  return (
    typeof festivalId === "number" &&
    Number.isInteger(festivalId) &&
    festivalId > 0
  );
}

/**
 * Switches a festival on for the public, or back to draft.
 *
 * Switching off also closes acreditación and registro en puerta, as archiving
 * does. Otherwise a festival switched back on later would reopen visitor
 * registration without anyone deciding to, and without its invitation.
 *
 * Nothing is mailed here. The dashboard sends the participant invitation
 * afterwards through `sendInvitationBatch`, a page per call, because a whole
 * list does not fit in one function invocation.
 */
export async function setFestivalActive(festivalId: number, active: boolean) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }
  if (!isValidFestivalId(festivalId) || typeof active !== "boolean") {
    return { success: false, message: "Festival inválido" };
  }

  let associatedSanctionIds: number[] = [];
  let changed = false;
  try {
    type Outcome =
      | { error: string }
      | { associatedSanctionIds: number[]; changed: boolean };
    const outcome = await db.transaction(async (tx): Promise<Outcome> => {
      const [current] = await tx
        .select({ status: festivals.status })
        .from(festivals)
        .where(eq(festivals.id, festivalId))
        .for("update");

      if (!current) return { error: "Festival no encontrado" };
      if (current.status === "archived") {
        return {
          error: "Un festival archivado no se puede activar ni desactivar.",
        };
      }
      // Only an active festival goes back to draft. Asking to deactivate one
      // that is not active is a stale screen, not a request to demote it.
      if (!active && current.status !== "active") {
        return { associatedSanctionIds: [], changed: false };
      }

      if (active && current.status !== "active") {
        // The site reads "the" active festival with an unordered findFirst,
        // so a second one makes it pick arbitrarily (see
        // docs/PLAN-stand-reservation-hardening.md, 6.1). Activations take
        // this lock so two of them cannot both see none active.
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext('festivals:activation'))`,
        );
        const [alreadyActive] = await tx
          .select({ name: festivals.name })
          .from(festivals)
          .where(
            and(eq(festivals.status, "active"), not(eq(festivals.id, festivalId))),
          )
          .limit(1);
        if (alreadyActive) {
          return {
            error: `${alreadyActive.name} ya está activo. Desactívalo o archívalo antes de activar este festival.`,
          };
        }
      }

      const transition = await transitionFestivalStatus(
        {
          festivalId,
          toStatus: active ? "active" : "draft",
          actorUserId: actor.id,
        },
        tx,
      );

      if (!active) {
        await tx
          .update(festivals)
          .set({
            publicRegistration: false,
            eventDayRegistration: false,
            updatedAt: new Date(),
          })
          .where(eq(festivals.id, festivalId));
      }

      return {
        associatedSanctionIds: transition.associatedSanctionIds,
        changed: transition.changed,
      };
    });

    if ("error" in outcome) {
      return { success: false, message: outcome.error };
    }
    associatedSanctionIds = outcome.associatedSanctionIds;
    changed = outcome.changed;
  } catch (error) {
    console.error("Error updating festival status", error);
    return { success: false, message: "Error al actualizar el festival" };
  }

  revalidateFestivalPages(festivalId, associatedSanctionIds);
  return {
    success: true,
    // False when the festival was already in the requested state, e.g. a
    // second admin's stale screen: the caller then skips the invitation.
    changed,
    message: !changed
      ? active
        ? "El festival ya estaba activo"
        : "El festival ya estaba desactivado"
      : active
        ? "Festival activado"
        : "Festival desactivado",
  };
}

export async function archiveFestival(festivalId: number) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }
  if (!Number.isInteger(festivalId) || festivalId <= 0) {
    return { success: false, message: "Festival inválido" };
  }

  try {
    await db.transaction(async (tx) => {
      await transitionFestivalStatus(
        {
          festivalId,
          toStatus: "archived",
          actorUserId: actor.id,
        },
        tx,
      );

      await tx
        .update(festivals)
        .set({
          publicRegistration: false,
          eventDayRegistration: false,
          updatedAt: new Date(),
        })
        .where(eq(festivals.id, festivalId));
    });
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al actualizar el festival" };
  }

  revalidatePath("/dashboard/festivals", "layout");
  revalidatePath(`/festivals/${festivalId}`, "layout");
  return { success: true, message: "Festival archivado" };
}

/**
 * The verified participants of the festival's categories, for the
 * "Participantes habilitados" page. Server-only: it returns whole profiles.
 */
export async function getFestivalAvailableUsers(festivalId: number) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor || !isValidFestivalId(festivalId)) {
    return [];
  }

  try {
    const sectors = await db.query.festivalSectors.findMany({
      with: {
        stands: true,
      },
      where: eq(festivalSectors.festivalId, festivalId),
    });

    const categories = [
      ...new Set(
        sectors.flatMap((sector) =>
          getFestivalSectorAllowedCategories(sector, true),
        ),
      ),
    ];
    if (categories.length === 0) return [];

    return await db
      .select()
      .from(users)
      .where(
        and(eq(users.status, "verified"), inArray(users.category, categories)),
      );
  } catch (error) {
    console.error("Error fetching festival available users", error);
    throw error;
  }
}

/**
 * Opens or closes acreditación: the public form where visitors get their free
 * ticket (`/festivals/[id]/registration`). It only opens on an active
 * festival, since that form refuses every other status.
 *
 * Closing it also closes registro en puerta, which depends on it. Opening it
 * mails nobody by itself; the dashboard then offers to invite past visitors
 * through `sendInvitationBatch`.
 */
export async function updateFestivalRegistration(
  festivalId: FestivalBase["id"],
  enabled: FestivalBase["publicRegistration"],
) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }
  if (!isValidFestivalId(festivalId) || typeof enabled !== "boolean") {
    return { success: false, message: "Festival inválido" };
  }

  let changed = false;
  try {
    const error = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          status: festivals.status,
          publicRegistration: festivals.publicRegistration,
        })
        .from(festivals)
        .where(eq(festivals.id, festivalId))
        .for("update");

      if (!current) return "Festival no encontrado";
      if (enabled && current.status !== "active") {
        return "Activa el festival antes de abrir la acreditación.";
      }
      changed = current.publicRegistration !== enabled;

      await tx
        .update(festivals)
        .set({
          publicRegistration: enabled,
          ...(enabled ? {} : { eventDayRegistration: false }),
          updatedAt: new Date(),
        })
        .where(eq(festivals.id, festivalId));
      return null;
    });

    if (error) return { success: false, message: error };
  } catch (error) {
    console.error("Error updating festival registration", error);
    return { success: false, message: "Error al actualizar el festival" };
  }

  revalidateFestivalPages(festivalId);
  return {
    success: true,
    // False when acreditación was already in that state: the caller then
    // skips the invitation, so a stale screen cannot mail everyone again.
    changed,
    message: !changed
      ? enabled
        ? "La acreditación ya estaba abierta"
        : "La acreditación ya estaba cerrada"
      : enabled
        ? "Acreditación abierta"
        : "Acreditación cerrada",
  };
}

/**
 * Registro en puerta: whether a visitor can create a ticket on the day of the
 * event. Changes only this flag, so a screen opened before someone else edited
 * the festival cannot write its stale copy of everything else back.
 */
export async function updateFestivalEventDayRegistration(
  festivalId: FestivalBase["id"],
  enabled: FestivalBase["eventDayRegistration"],
) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }
  if (!isValidFestivalId(festivalId) || typeof enabled !== "boolean") {
    return { success: false, message: "Festival inválido" };
  }

  try {
    const error = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          status: festivals.status,
          publicRegistration: festivals.publicRegistration,
        })
        .from(festivals)
        .where(eq(festivals.id, festivalId))
        .for("update");

      if (!current) return "Festival no encontrado";
      if (
        enabled &&
        (current.status !== "active" || !current.publicRegistration)
      ) {
        return "Abre la acreditación antes de habilitar el registro en puerta.";
      }

      await tx
        .update(festivals)
        .set({ eventDayRegistration: enabled, updatedAt: new Date() })
        .where(eq(festivals.id, festivalId));
      return null;
    });

    if (error) return { success: false, message: error };
  } catch (error) {
    console.error("Error updating event day registration", error);
    return { success: false, message: "Error al actualizar el festival" };
  }

  revalidateFestivalPages(festivalId);
  return {
    success: true,
    message: enabled
      ? "Registro en puerta habilitado"
      : "Registro en puerta deshabilitado",
  };
}

export async function updateFestivalParticipantTerms(
  festivalId: FestivalBase["id"],
  participantTermsEnabled: FestivalBase["participantTermsEnabled"],
) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }
  if (
    !isValidFestivalId(festivalId) ||
    typeof participantTermsEnabled !== "boolean"
  ) {
    return { success: false, message: "Festival inválido" };
  }

  try {
    const updatedFestival = await db.transaction(async (tx) => {
      const locked = await lockFestivalRow(tx, festivalId);
      if (!locked) return null;
      await lockFestivalTermsDocument(tx);
      const [row] = await tx
        .update(festivals)
        .set({ participantTermsEnabled, updatedAt: new Date() })
        .where(eq(festivals.id, festivalId))
        .returning({ festivalId: festivals.id });
      return row ?? null;
    });

    if (!updatedFestival) {
      return { success: false, message: "Festival no encontrado" };
    }
  } catch (error) {
    console.error("Error updating festival participant terms", error);
    return {
      success: false,
      message: "Error al actualizar los términos para participantes",
    };
  }

  revalidatePath("/dashboard/festivals");
  revalidatePath(`/dashboard/festivals/${festivalId}`);
  revalidatePath("/festivals", "layout");
  return {
    success: true,
    message: participantTermsEnabled
      ? "Los participantes ya pueden acceder a los términos y condiciones"
      : "Se deshabilitó el acceso a los términos y condiciones para participantes",
  };
}

export async function fetchFestivalParticipants(
  festivalId: number,
  confirmedOnly = false,
): Promise<ParticipationWithParticipantWithInfractionsAndReservations[]> {
  const whereCondition = confirmedOnly
    ? and(
        eq(standReservations.festivalId, festivalId),
        eq(standReservations.status, "accepted"),
      )
    : eq(standReservations.festivalId, festivalId);

  try {
    const participantsWithReservationsSubquery = db
      .select({ id: standReservations.id })
      .from(standReservations)
      .where(whereCondition);

    return await db.query.reservationParticipants.findMany({
      where: inArray(
        reservationParticipants.reservationId,
        participantsWithReservationsSubquery,
      ),
      with: {
        user: {
          with: {
            infractions: {
              where: eq(infractions.festivalId, festivalId),
              with: {
                type: true,
              },
            },
          },
        },
        reservation: {
          with: {
            stand: true,
            // A full table holds two stands; `stand` alone names only the one
            // the participant picked first.
            members: { with: { stand: true } },
            festival: true,
          },
        },
      },
    });
  } catch (error) {
    // Rethrown, not swallowed. Returning [] asserted the festival had no
    // participants, so a query that could not run rendered as an empty table
    // and read as a plausible answer — that is how an unresolvable `users`
    // relation sat here undetected. The route's error boundary says what
    // happened instead.
    console.error("Error fetching festival participants", error);
    throw error;
  }
}

/**
 * Fetch all participants that have enrolled in a festival
 * @param festivalId - The id of the festival
 * @returns An array of profiles
 */
export async function fetchEnrolledParticipants(
  festivalId: number,
): Promise<BaseProfile[]> {
  try {
    const participantsWithReservationsSubquery = db
      .select({ userId: reservationParticipants.userId })
      .from(reservationParticipants)
      .leftJoin(
        standReservations,
        eq(standReservations.id, reservationParticipants.reservationId),
      )
      .where(and(eq(standReservations.festivalId, festivalId)));

    const queryResult = await db
      .selectDistinctOn([userRequests.userId], {
        users: users,
      })
      .from(userRequests)
      .leftJoin(users, eq(users.id, userRequests.userId))
      .where(
        and(
          eq(userRequests.type, "festival_participation"),
          eq(userRequests.festivalId, festivalId),
          not(
            inArray(
              userRequests.userId,
              // --- SQL Query equivalent to the subquery
              // sql`(
              //   select participations.user_id from participations
              //   left join stand_reservations on participations.reservation_id = stand_reservations.id
              //   where stand_reservations.festival_id = ${festivalId} and stand_reservations.status != 'rejected'
              // )`,
              participantsWithReservationsSubquery,
            ),
          ),
        ),
      );

    return queryResult
      .map((userRequest) => userRequest.users)
      .filter((user): user is NonNullable<typeof user> => user !== null);
  } catch (error) {
    // Same reasoning as `fetchFestivalParticipants`: this feeds the other tab
    // of the same table, and an empty list there is indistinguishable from
    // nobody having enrolled.
    console.error("Error fetching enrolled participants", error);
    throw error;
  }
}

export async function fetchProfileEnrollmentInFestival(
  profileId: number,
  festivalId: number,
) {
  try {
    return await db.query.userRequests.findFirst({
      where: and(
        eq(userRequests.userId, profileId),
        eq(userRequests.festivalId, festivalId),
        eq(userRequests.type, "festival_participation"),
      ),
    });
  } catch (error) {
    console.error("Error fetching profile enrollment in festival", error);
    throw error;
  }
}

export async function fetchAllFestivalEnrolledUsers(
  festivalId: number,
): Promise<BaseProfile[]> {
  try {
    const result = await db
      .selectDistinctOn([userRequests.userId], { user: users })
      .from(userRequests)
      .leftJoin(users, eq(users.id, userRequests.userId))
      .where(
        and(
          eq(userRequests.type, "festival_participation"),
          eq(userRequests.festivalId, festivalId),
          eq(userRequests.status, "accepted"),
        ),
      );

    return result
      .map((row) => row.user)
      .filter((user): user is NonNullable<typeof user> => user !== null);
  } catch (error) {
    console.error("Error fetching all festival enrolled users", error);
    throw error;
  }
}
