import {
  infractionEvidence,
  infractionEvents,
  infractionNotes,
  infractions,
  infractionStatusEnum,
  infractionTypes,
  sanctions,
} from "@/db/schema";

export type InfractionType = typeof infractionTypes.$inferSelect;

/** @deprecated Prefer RegisterInfractionInput from schema.ts */
export type NewInfraction = typeof infractions.$inferInsert;

export type InfractionBase = typeof infractions.$inferSelect;

export type InfractionStatus = (typeof infractionStatusEnum.enumValues)[number];

export type SanctionBase = typeof sanctions.$inferSelect;

export type InfractionEvent = typeof infractionEvents.$inferSelect;

export type InfractionNote = typeof infractionNotes.$inferSelect;

export type InfractionEvidence = typeof infractionEvidence.$inferSelect;

export type DuplicateInfractionCandidate = Pick<
  InfractionBase,
  | "id"
  | "userId"
  | "typeId"
  | "festivalId"
  | "status"
  | "createdAt"
  | "description"
> & {
  type: Pick<InfractionType, "id" | "label" | "severity">;
};

export type RegisterInfractionResult =
  | {
      success: true;
      message: string;
      infractionId: number;
      reused?: boolean;
    }
  | {
      success: false;
      message: string;
      code?: "duplicate_warning" | "unauthorized" | "validation" | "not_found";
      duplicates?: DuplicateInfractionCandidate[];
    };
