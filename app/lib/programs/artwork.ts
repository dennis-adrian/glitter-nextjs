import type { SessionType } from "@/app/lib/programs/definitions";

export const DEFAULT_PROGRAM_ARTWORK =
  "/img/programs/glitter-week-education-hero.webp";

const DEFAULT_SESSION_ARTWORK: Record<SessionType, string> = {
  talk: "/img/programs/glitter-week-education-talk.webp",
  workshop: "/img/programs/glitter-week-education-workshop.webp",
};

/**
 * Published artwork always wins. The illustrated defaults keep an unfinished
 * catalog feeling intentional while the team commissions each session poster.
 */
export function resolveSessionArtwork(input: {
  imageUrl: string | null;
  type: SessionType;
}): string {
  return input.imageUrl ?? DEFAULT_SESSION_ARTWORK[input.type];
}
