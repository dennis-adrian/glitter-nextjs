import { BaseProfile, ProfileType } from "@/app/api/users/definitions";
import { getProfileStatusLabel } from "@/app/lib/users/utils";
import { userStatusEnum } from "@/db/schema";

export const PARTICIPANT_STATUSES = [
  "verified",
  "paused",
  "banned",
] as const satisfies readonly BaseProfile["status"][];

export const PROFILE_REQUEST_STATUSES = [
  "pending",
  "rejected",
] as const satisfies readonly BaseProfile["status"][];

export const DEFAULT_PARTICIPANT_VISIBLE_STATUSES = [
  "verified",
  "paused",
] as const satisfies readonly BaseProfile["status"][];

export const PARTICIPANT_READ_ONLY_ROUTE_STATUSES = [
  "verified",
  "paused",
] as const satisfies readonly BaseProfile["status"][];

export const DEFAULT_PROFILE_REQUEST_STATUSES = [
  "pending",
  "rejected",
] as const satisfies readonly BaseProfile["status"][];

export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];
export type ProfileRequestStatus = (typeof PROFILE_REQUEST_STATUSES)[number];

export type ParticipantActivitySummary = {
  lastParticipationAt: Date | null;
  lastParticipationFestivalName: string | null;
  lastTermsAcceptedAt: Date | null;
  lastTermsAcceptedFestivalName: string | null;
  acceptedParticipationsCount: number;
  acceptedTermsCount: number;
  isPauseEligible: boolean;
  pauseEligibilityReason: string;
};

export type ParticipantProfile = ProfileType & {
  activitySummary: ParticipantActivitySummary;
};

export type ParticipantAggregates = {
  total: number;
  active: number;
  paused: number;
  banned: number;
  totalParticipants: number;
  pauseEligible: number;
};

export type ParticipantSortField =
  | keyof BaseProfile
  | "lastParticipationAt"
  | "lastTermsAcceptedAt";

export const participantStatusOptions = PARTICIPANT_STATUSES.map((value) => ({
  value,
  label: getProfileStatusLabel(value),
}));

export function isParticipantStatus(
  status: (typeof userStatusEnum.enumValues)[number],
): status is ParticipantStatus {
  return (PARTICIPANT_STATUSES as readonly string[]).includes(status);
}

export function isProfileRequestStatus(
  status: (typeof userStatusEnum.enumValues)[number],
): status is ProfileRequestStatus {
  return (PROFILE_REQUEST_STATUSES as readonly string[]).includes(status);
}
