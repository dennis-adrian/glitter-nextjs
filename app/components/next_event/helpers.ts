import {
  ProfileType,
  ProfileWithParticipationsAndRequests,
} from "@/app/api/users/definitions";

export function isProfileInFestival(
  festivalId: number,
  profile?: ProfileType | ProfileWithParticipationsAndRequests | null,
) {
  if (!profile) return false;

  return profile?.userRequests?.some(
    (request) =>
      request.festivalId === festivalId && request.status === "accepted",
  );
}
