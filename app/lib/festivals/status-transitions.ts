import { eq } from "drizzle-orm";

import { associateSanctionsWithActivatedFestival } from "@/app/lib/sanctions/festival-counting";
import { db } from "@/db";
import {
  festivalStatusEvents,
  festivalStatusEnum,
  festivals,
} from "@/db/schema";

export type FestivalStatus = (typeof festivalStatusEnum.enumValues)[number];

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type TransitionFestivalStatusResult = {
  festivalId: number;
  fromStatus: FestivalStatus | null;
  toStatus: FestivalStatus;
  changed: boolean;
  associatedSanctionIds: number[];
};

/**
 * Central festival status mutation. Records festival_status_events and, when
 * transitioning to active, associates qualifying sanctions.
 */
export async function transitionFestivalStatus(
  input: {
    festivalId: number;
    toStatus: FestivalStatus;
    actorUserId?: number | null;
    now?: Date;
  },
  existingTx?: DbTx,
): Promise<TransitionFestivalStatusResult> {
  const run = async (tx: DbTx): Promise<TransitionFestivalStatusResult> => {
    const now = input.now ?? new Date();

    const [festival] = await tx
      .select({
        id: festivals.id,
        status: festivals.status,
      })
      .from(festivals)
      .where(eq(festivals.id, input.festivalId))
      .for("update");

    if (!festival) {
      throw new Error("Festival no encontrado");
    }

    const fromStatus = festival.status;

    if (fromStatus === input.toStatus) {
      return {
        festivalId: festival.id,
        fromStatus,
        toStatus: input.toStatus,
        changed: false,
        associatedSanctionIds: [],
      };
    }

    await tx
      .update(festivals)
      .set({
        status: input.toStatus,
        updatedAt: now,
      })
      .where(eq(festivals.id, festival.id));

    await tx.insert(festivalStatusEvents).values({
      festivalId: festival.id,
      fromStatus,
      toStatus: input.toStatus,
      actorUserId: input.actorUserId ?? null,
      createdAt: now,
    });

    let associatedSanctionIds: number[] = [];
    if (input.toStatus === "active") {
      const association = await associateSanctionsWithActivatedFestival(tx, {
        festivalId: festival.id,
        activatedAt: now,
      });
      associatedSanctionIds = association.associatedSanctionIds;
    }

    return {
      festivalId: festival.id,
      fromStatus,
      toStatus: input.toStatus,
      changed: true,
      associatedSanctionIds,
    };
  };

  if (existingTx) {
    return run(existingTx);
  }

  return db.transaction(run);
}

/**
 * Records the initial status when a festival row is created.
 * Does not qualify sanctions (create is never a transition to active after approval).
 */
export async function recordFestivalCreatedStatus(
  tx: DbTx,
  input: {
    festivalId: number;
    status: FestivalStatus;
    actorUserId?: number | null;
    now?: Date;
  },
) {
  await tx.insert(festivalStatusEvents).values({
    festivalId: input.festivalId,
    fromStatus: null,
    toStatus: input.status,
    actorUserId: input.actorUserId ?? null,
    createdAt: input.now ?? new Date(),
  });
}
