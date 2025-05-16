import {
  ProfileType,
  ProfileWithParticipationsAndRequests,
} from "@/app/api/users/definitions";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { SearchOption } from "@/app/components/ui/search-input/search-content";
import { getParticipantsOptions } from "@/app/api/reservations/helpers";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import { FestivalWithDates, FestivalWithUserRequests } from "@/app/lib/festivals/definitions";

export function getFestivalDateLabel(festival: FestivalWithDates) {
  const dates = festival.festivalDates;

  const startDate = formatDate(dates[0]?.startDate);
  const endDate = formatDate(dates[dates.length - 1]?.startDate);

  if (dates.length === 1) {
    return startDate.toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY);
  }

  return `${startDate.toLocaleString(
    DateTime.DATE_MED_WITH_WEEKDAY,
  )} a ${endDate.toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)}`;
}

export function profileHasReservation(
  profile: ProfileType | ProfileWithParticipationsAndRequests,
  festivalId: number,
) {
  return profile?.participations?.some((participation) => {
    return participation?.reservation?.festivalId === festivalId;
  });
}

export function profileHasConfirmedReservation(
  profile: ProfileType | ProfileWithParticipationsAndRequests,
  festivalId: number,
) {
  return profile?.participations?.some((participation) => {
    return (
      participation?.reservation?.festivalId === festivalId &&
      participation?.reservation?.status === "accepted"
    );
  });
}

export function getSearchArtistOptions(
  festival: FestivalWithUserRequests,
  profile: ProfileType,
): SearchOption[] {
  const festivalArtists = festival.userRequests.map((request) => request.user);
  const filteredArtists = festivalArtists.filter((artist) => {
    return (
      !profileHasReservation(artist, festival.id) &&
      isProfileInFestival(festival.id, artist) &&
      artist.category === "illustration"
    );
  });

  return getParticipantsOptions(filteredArtists);
}
