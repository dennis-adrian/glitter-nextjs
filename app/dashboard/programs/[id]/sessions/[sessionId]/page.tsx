import { notFound, redirect } from "next/navigation";

import SessionDetailView from "@/app/components/dashboard/programs/session-detail-view";
import { fetchSessionForAdmin } from "@/app/lib/programs/data";
import { sessionAdminPath } from "@/app/lib/programs/paths";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

type Props = {
  params: Promise<{ id: string; sessionId: string }>;
};

export default async function SessionDetailPage({ params }: Props) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const { id, sessionId: rawSessionId } = await params;
  const programId = Number(id);
  const sessionId = Number(rawSessionId);
  if (!Number.isInteger(programId) || !Number.isInteger(sessionId)) notFound();

  const session = await fetchSessionForAdmin(sessionId);
  if (!session) notFound();

  // A standalone session, or one filed under another program, has exactly one
  // admin address; send an old or hand-typed link there instead of a 404.
  if (session.programId !== programId) redirect(sessionAdminPath(session));

  return (
    <SessionDetailView
      session={session}
      // The upload endpoint accepts admins only.
      canUploadImages={profile.role === "admin"}
    />
  );
}
