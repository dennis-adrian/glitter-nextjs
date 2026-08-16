import { gzipSync } from "zlib";
import { fetchFestivalSectors, fetchConfirmedProfilesByFestivalId } from "@/app/lib/festival_sectors/actions";
import { fetchFestivalActivitiesByFestivalId } from "@/app/lib/festivals/actions";
import { stripHiddenReservationsFromSectors } from "@/app/lib/reservations/reveal";
import { isNewProfile } from "@/app/lib/utils";

const size = (v: unknown) => {
  const s = JSON.stringify(v);
  const raw = Buffer.byteLength(s);
  const gz = gzipSync(Buffer.from(s)).length;
  return `${(raw / 1024).toFixed(1)} KB raw / ${(gz / 1024).toFixed(1)} KB gzip`;
};

function toPublicMapSectors(sectors: any[]) {
  return sectors.map((sector) => ({
    ...sector,
    stands: sector.stands.map((stand: any) => ({
      ...stand,
      reservations: stand.reservations.map((reservation: any) => ({
        ...reservation,
        participants: reservation.participants.map((participant: any) => ({
          ...participant,
          user: {
            id: participant.user.id,
            displayName: participant.user.displayName,
            imageUrl: participant.user.imageUrl,
            category: participant.user.category,
            userSocials: [],
            profileSubcategories: participant.user.profileSubcategories ?? [],
          },
        })),
        externalParticipants: reservation.externalParticipants,
      })),
    })),
  }));
}

async function main() {
  const id = Number(process.argv[2] ?? 484);
  const [rawSectors, activities, participants] = await Promise.all([
    fetchFestivalSectors(id),
    fetchFestivalActivitiesByFestivalId(id),
    fetchConfirmedProfilesByFestivalId(id),
  ]);
  const sectors = toPublicMapSectors(stripHiddenReservationsFromSectors(rawSectors));
  const publicParticipants = participants.map((p: any) => ({
    id: p.id,
    displayName: p.displayName || "Participante",
    imageUrl: p.imageUrl,
    category: p.category,
    stands: p.stands.map((s: any) => ({ id: s.id, label: s.label, standNumber: s.standNumber })),
    hasStamp: p.participations.some((x: any) => x.reservation.festivalId === id && x.hasStamp),
    isNew: isNewProfile({ participations: p.participations }),
  }));
  const publicActivities = activities.filter((a: any) => a.accessLevel === "public");

  console.error("==== what crosses the server->client boundary ====");
  console.error("sectors prop      :", size(sectors));
  console.error("participants prop :", size(publicParticipants), `(${publicParticipants.length})`);
  console.error("activities (public, pre-shape):", size(publicActivities), `(${publicActivities.length})`);
  console.error("");
  console.error("==== inside the sectors prop ====");
  const stands = sectors.flatMap((s: any) => s.stands);
  console.error("stands:", stands.length);
  console.error("  standSubcategories:", size(stands.map((s: any) => s.standSubcategories)));
  console.error("  reservations:", size(stands.map((s: any) => s.reservations)));
  console.error("  mapElements:", size(sectors.map((s: any) => s.mapElements)));
  const oneStand = stands.find((s: any) => s.reservations.length > 0);
  console.error("  sample occupied stand:", JSON.stringify(oneStand, null, 1).slice(0, 1800));
  process.exit(0);
}
main();
