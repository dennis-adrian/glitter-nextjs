import type { ProfileType } from "@/app/api/users/definitions";
import type { FestivalBase } from "@/app/lib/festivals/definitions";
import type { userRequests } from "@/db/schema";

type TermsRequest = Pick<
  typeof userRequests.$inferSelect,
  "festivalId" | "type" | "status" | "termsVersionId"
> &
  Partial<
    Pick<typeof userRequests.$inferSelect, "id" | "updatedAt" | "createdAt">
  >;

type ProfileWithRequests = {
  userRequests?: TermsRequest[] | ProfileType["userRequests"];
};

function requestRecencyMs(request: TermsRequest): number {
  const ts = request.updatedAt ?? request.createdAt;
  if (ts == null) return Number.NEGATIVE_INFINITY;
  return ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
}

/** Current festival_participation row: latest by updatedAt, then createdAt, then id. */
export function getFestivalParticipationRequest(
  profile: ProfileWithRequests | null | undefined,
  festivalId: number,
): TermsRequest | undefined {
  const matches = profile?.userRequests?.filter(
    (request) =>
      request.festivalId === festivalId &&
      request.type === "festival_participation",
  );
  if (!matches?.length) return undefined;

  return matches.reduce((latest, request) => {
    const latestMs = requestRecencyMs(latest);
    const requestMs = requestRecencyMs(request);
    if (requestMs > latestMs) return request;
    if (requestMs < latestMs) return latest;
    const latestId = latest.id ?? Number.NEGATIVE_INFINITY;
    const requestId = request.id ?? Number.NEGATIVE_INFINITY;
    return requestId > latestId ? request : latest;
  });
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
