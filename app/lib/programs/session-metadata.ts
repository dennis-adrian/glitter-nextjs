import type { Metadata } from "next";

import {
  DEFAULT_PROGRAM_ARTWORK,
  isAllowedProgramArtworkUrl,
} from "@/app/lib/programs/artwork";

/**
 * Metadata for both public session routes: a session inside a program and a
 * standalone one. Pure, so the image order is tested without a database.
 */

type SessionArtworkSource = {
  imageUrl: string | null;
  sessionSpeakers: readonly { speaker: { imageUrl: string | null } }[];
  /** Null for a standalone session. */
  program: { bannerUrl: string | null } | null;
};

type SessionMetadataSource = SessionArtworkSource & {
  title: string;
  description: string | null;
};

/**
 * The image shared on social previews: the session's own artwork, else the
 * first speaker portrait, else the program banner, else the placeholder.
 *
 * Every candidate is host-checked: the schema validates new records, but rows
 * predating it can still hold an arbitrary URL, and an OG image is emitted to
 * third parties.
 */
export function resolveSessionSocialImage(
  session: SessionArtworkSource,
): string {
  if (isAllowedProgramArtworkUrl(session.imageUrl)) return session.imageUrl;

  for (const entry of session.sessionSpeakers) {
    const portrait = entry.speaker.imageUrl;
    if (isAllowedProgramArtworkUrl(portrait)) return portrait;
  }

  const banner = session.program?.bannerUrl;
  if (isAllowedProgramArtworkUrl(banner)) return banner;

  return DEFAULT_PROGRAM_ARTWORK;
}

/** The session is missing when it does not exist or is not published. */
export function buildSessionMetadata(
  session: SessionMetadataSource | null | undefined,
): Metadata {
  if (!session) return { title: "Sesión" };

  const description = session.description ?? undefined;

  return {
    title: session.title,
    description,
    openGraph: {
      title: session.title,
      description,
      images: [resolveSessionSocialImage(session)],
    },
  };
}
