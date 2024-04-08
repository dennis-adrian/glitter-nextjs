import { stands } from "@/db/schema";

export type StandPosition = {
  id: number;
  left: number;
  top: number;
};

export type ElementSize = {
  wide: number;
  narrow: number;
};

export type StandBase = typeof stands.$inferSelect;
export type StandZone = StandBase["zone"];
