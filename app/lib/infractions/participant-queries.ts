import { desc, eq } from "drizzle-orm";

import type {
  SanctionFestivalScope,
  SanctionStatus,
  SanctionType,
  ValidityUnit,
} from "@/app/lib/sanctions/definitions";
import { db } from "@/db";
import { infractions, infractionTypes, sanctions } from "@/db/schema";

export type ParticipantInfraction = {
  id: number;
  description: string | null;
  status: (typeof infractions.$inferSelect)["status"];
  createdAt: Date;
  resolvedAt: Date | null;
  type: {
    id: number;
    label: string;
    description: string | null;
    severity: (typeof infractionTypes.$inferSelect)["severity"];
  };
  festival: {
    id: number;
    name: string;
  } | null;
  sanctionId: number | null;
};

export type ParticipantSanctionFestival = {
  festivalId: number;
  festivalName: string;
  qualifiedAt: Date;
  reservationEligibleAt: Date | null;
  countedAt: Date | null;
  countsTowardDuration: boolean;
};

export type ParticipantSanction = {
  id: number;
  type: SanctionType;
  status: SanctionStatus;
  description: string | null;
  festivalScope: SanctionFestivalScope;
  validityDuration: number | null;
  validityUnit: ValidityUnit;
  startsAt: Date;
  endsAt: Date | null;
  reservationDelayMinutes: number | null;
  revokedAt: Date | null;
  revocationReason: string | null;
  infractionIds: number[];
  festivals: ParticipantSanctionFestival[];
  countedFestivals: number;
  remainingFestivals: number | null;
};

export type ParticipantDisciplinaryHistory = {
  infractions: ParticipantInfraction[];
  sanctions: ParticipantSanction[];
};

/**
 * Public disciplinary history for a participant.
 * Never includes notes, evidence, or audit events.
 */
export async function fetchParticipantDisciplinaryHistory(
  userId: number,
): Promise<ParticipantDisciplinaryHistory> {
  const [infractionRows, sanctionRows] = await Promise.all([
    db.query.infractions.findMany({
      where: eq(infractions.userId, userId),
      columns: {
        id: true,
        description: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
      },
      with: {
        type: {
          columns: {
            id: true,
            label: true,
            description: true,
            severity: true,
          },
        },
        festival: {
          columns: { id: true, name: true },
        },
        sanctionLinks: {
          columns: { sanctionId: true },
        },
      },
      orderBy: [desc(infractions.createdAt)],
    }),
    db.query.sanctions.findMany({
      where: eq(sanctions.userId, userId),
      columns: {
        id: true,
        type: true,
        status: true,
        description: true,
        festivalScope: true,
        validityDuration: true,
        validityUnit: true,
        startsAt: true,
        endsAt: true,
        reservationDelayMinutes: true,
        revokedAt: true,
        revocationReason: true,
      },
      with: {
        sanctionInfractions: {
          columns: { infractionId: true },
        },
        sanctionFestivals: {
          columns: {
            festivalId: true,
            qualifiedAt: true,
            reservationEligibleAt: true,
            countedAt: true,
            countsTowardDuration: true,
          },
          with: {
            festival: {
              columns: { id: true, name: true },
            },
          },
        },
      },
      orderBy: [desc(sanctions.createdAt)],
    }),
  ]);

  const participantInfractions: ParticipantInfraction[] = infractionRows.map(
    (row) => ({
      id: row.id,
      description: row.description,
      status: row.status,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
      type: row.type,
      festival: row.festival,
      sanctionId: row.sanctionLinks[0]?.sanctionId ?? null,
    }),
  );

  const participantSanctions: ParticipantSanction[] = sanctionRows.map(
    (row) => {
      const countedFestivals = row.sanctionFestivals.filter(
        (item) => item.countsTowardDuration && item.countedAt != null,
      ).length;

      const remainingFestivals =
        row.validityUnit === "festivals" && row.validityDuration != null
          ? Math.max(row.validityDuration - countedFestivals, 0)
          : null;

      return {
        id: row.id,
        type: row.type,
        status: row.status,
        description: row.description,
        festivalScope: row.festivalScope,
        validityDuration: row.validityDuration,
        validityUnit: row.validityUnit,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        reservationDelayMinutes: row.reservationDelayMinutes,
        revokedAt: row.revokedAt,
        revocationReason: row.revocationReason,
        infractionIds: row.sanctionInfractions.map((link) => link.infractionId),
        festivals: row.sanctionFestivals.map((item) => ({
          festivalId: item.festivalId,
          festivalName: item.festival.name,
          qualifiedAt: item.qualifiedAt,
          reservationEligibleAt: item.reservationEligibleAt,
          countedAt: item.countedAt,
          countsTowardDuration: item.countsTowardDuration,
        })),
        countedFestivals,
        remainingFestivals,
      };
    },
  );

  return {
    infractions: participantInfractions,
    sanctions: participantSanctions,
  };
}
