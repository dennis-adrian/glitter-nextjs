import { notFound, redirect } from "next/navigation";

import SessionDetailView from "@/app/components/dashboard/programs/session-detail-view";
import { fetchSessionForAdmin } from "@/app/lib/programs/data";
import { sessionAdminPath } from "@/app/lib/programs/paths";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

type Props = {
  params: Promise<{ sessionId: string }>;
};

/** A standalone session: a talk or workshop that belongs to no program. */
export default async function StandaloneSessionDetailPage({ params }: Props) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const { sessionId: rawSessionId } = await params;
  const sessionId = Number(rawSessionId);
  if (!Number.isInteger(sessionId)) notFound();

  const session = await fetchSessionForAdmin(sessionId);
  if (!session) notFound();

  // A program session lives under its program, where the breadcrumb and the
  // program's publication state make sense.
  if (session.programId !== null) redirect(sessionAdminPath(session));

  return (
    <SessionDetailView
      session={session}
      // The upload endpoint accepts admins only.
      canUploadImages={profile.role === "admin"}
    />
  );
}
