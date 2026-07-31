import { notFound, redirect } from "next/navigation";

import SessionForm from "@/app/components/dashboard/programs/session-form";
import {
  fetchProgramForAdmin,
  fetchSessionTopics,
  fetchVenues,
} from "@/app/lib/programs/data";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function NewSessionPage({ params }: Props) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const { id } = await params;
  const programId = Number(id);
  if (!Number.isInteger(programId)) notFound();

  const [program, venues, topics] = await Promise.all([
    fetchProgramForAdmin(programId),
    fetchVenues(),
    fetchSessionTopics(),
  ]);

  if (!program) notFound();

  return (
    <div className="container max-w-2xl p-3 md:p-6 flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Nueva sesión</h1>
        <p className="text-sm text-muted-foreground">{program.name}</p>
      </div>
      <SessionForm programId={program.id} venues={venues} topics={topics} />
    </div>
  );
}
