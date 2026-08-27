import type { ProfileType } from "@/app/api/users/definitions";
import type { FestivalBase } from "@/app/lib/festivals/definitions";
import type { userRequests } from "@/db/schema";

type TermsRequest = Pick<
  typeof userRequests.$inferSelect,
  "festivalId" | "type" | "status" | "termsVersionId"
>;

type ProfileWithRequests = {
  userRequests?: TermsRequest[] | ProfileType["userRequests"];
};

export function getFestivalParticipationRequest(
  profile: ProfileWithRequests | null | undefined,
  festivalId: number,
): TermsRequest | undefined {
  return profile?.userRequests?.find(
    (request) =>
      request.festivalId === festivalId &&
      request.type === "festival_participation",
  );
}

export function hasAcceptedCurrentFestivalTerms(
  profile: ProfileWithRequests | null | undefined,
  festivalId: number,
  currentVersionId: number | null | undefined,
): boolean {
  if (currentVersionId == null) return false;
  const request = getFestivalParticipationRequest(profile, festivalId);
  return request?.termsVersionId === currentVersionId;
}

export function needsFestivalTermsReacceptance(
  festival: Pick<FestivalBase, "id" | "status">,
  profile: ProfileWithRequests | null | undefined,
  currentVersionId: number | null | undefined,
): boolean {
  if (festival.status !== "active") return false;
  const request = getFestivalParticipationRequest(profile, festival.id);
  if (!request) return false;
  if (currentVersionId == null) return false;
  return request.termsVersionId !== currentVersionId;
}

export type EnrollmentTermsWrite =
  | { type: "error"; message: string }
  | { type: "insert" }
  | { type: "reaccept" }
  | { type: "noop" };

export function nextEnrollmentTermsWrite(
  existing: { termsVersionId: number | null } | null | undefined,
  publishedVersionId: number | null | undefined,
): EnrollmentTermsWrite {
  if (publishedVersionId == null) {
    return {
      type: "error",
      message:
        "No hay una versión publicada de los términos y condiciones. Intentá de nuevo más tarde.",
    };
  }
  if (!existing) return { type: "insert" };
  if (existing.termsVersionId === publishedVersionId) return { type: "noop" };
  return { type: "reaccept" };
}
