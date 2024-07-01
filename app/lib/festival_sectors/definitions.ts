import {
  StandBase,
  StandWithReservationsWithParticipants,
} from "@/app/api/stands/definitions";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { festivalDates, festivalSectors } from "@/db/schema";

export type FestivalSectorBase = typeof festivalSectors.$inferSelect;
export type FestivalSectorWithStands = typeof festivalSectors.$inferSelect & {
  stands: StandBase[];
};

export type FestivalSectorWithStandsWithReservationsWithParticipants =
  typeof festivalSectors.$inferSelect & {
    stands: StandWithReservationsWithParticipants[];
  };
