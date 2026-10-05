import type { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";

/**
 * Sectors as a page outside the dashboard may hand them to client components.
 *
 * `fetchFestivalSectors` returns each occupant's whole profile — email, phone,
 * birthdate, account ids — and each reservation's whole row. A client prop is
 * serialized into the page whether or not the component reads it, so every
 * occupant here keeps only what a map card renders: name, picture, category and
 * what they make, plus their public social handles when the page shows them.
 * A brand without an account keeps what its card links to, never its contact
 * phone or the account that created it. A reservation keeps what decides
 * whether it occupies the stand and when it surfaces — never its owner, the
 * prices it was booked at or its idempotency key.
 *
 * Occupancy is resolved through membership before this runs
 * (`withMembershipReservationsBySector`), so nothing here needs the membership
 * rows a reservation carries.
 *
 * This does not withhold unrevealed reservations; pair it with
 * `stripHiddenReservationsFromSectors` wherever the viewer is not an admin.
 */
export function toPublicMapSectors(
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[],
  { includeSocials = false }: { includeSocials?: boolean } = {},
): FestivalSectorWithStandsWithReservationsWithParticipants[] {
  return sectors.map((sector) => ({
    ...sector,
    stands: sector.stands.map((stand) => ({
      ...stand,
      reservations: stand.reservations.map((reservation) => ({
        id: reservation.id,
        standId: reservation.standId,
        festivalId: reservation.festivalId,
        status: reservation.status,
        revealAt: reservation.revealAt,
        participants: reservation.participants.map((participant) => ({
          ...participant,
          user: {
            id: participant.user.id,
            displayName: participant.user.displayName,
            imageUrl: participant.user.imageUrl,
            category: participant.user.category,
            userSocials: includeSocials
              ? (participant.user.userSocials ?? []).map((social) => ({
                  id: social.id,
                  userId: social.userId,
                  type: social.type,
                  username: social.username,
                }))
              : [],
            profileSubcategories: participant.user.profileSubcategories ?? [],
          },
        })),
        externalParticipants: (reservation.externalParticipants ?? []).map(
          ({
            id,
            externalParticipantId,
            reservationId,
            externalParticipant,
          }) => ({
            id,
            externalParticipantId,
            reservationId,
            externalParticipant: {
              id: externalParticipant.id,
              displayName: externalParticipant.displayName,
              type: externalParticipant.type,
              customCategoryLabel: externalParticipant.customCategoryLabel,
              description: externalParticipant.description,
              imageUrl: externalParticipant.imageUrl,
              websiteUrl: externalParticipant.websiteUrl,
              instagramUrl: externalParticipant.instagramUrl,
              contactEmail: externalParticipant.contactEmail,
            },
          }),
        ),
      })),
    })),
  })) as unknown as FestivalSectorWithStandsWithReservationsWithParticipants[];
}
