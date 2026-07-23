import {
  durationUnitEnum,
  sanctionEventTypeEnum,
  sanctionFestivalScopeEnum,
  sanctions,
  sanctionStatusEnum,
  sanctionTypeEnum,
} from "@/db/schema";

export type SanctionBase = typeof sanctions.$inferSelect;

export type SanctionStatus = (typeof sanctionStatusEnum.enumValues)[number];

export type SanctionType = (typeof sanctionTypeEnum.enumValues)[number];

export type SanctionFestivalScope =
  (typeof sanctionFestivalScopeEnum.enumValues)[number];

export type ValidityUnit = (typeof durationUnitEnum.enumValues)[number];

export type SanctionEventType =
  (typeof sanctionEventTypeEnum.enumValues)[number];

export type SanctionMutationResult =
  | {
      success: true;
      message: string;
      sanctionId: number;
    }
  | {
      success: false;
      message: string;
      code?: "unauthorized" | "validation" | "not_found" | "conflict";
    };
