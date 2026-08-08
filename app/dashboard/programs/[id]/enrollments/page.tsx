import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import ProgramRosterView from "@/app/components/dashboard/programs/enrollments/program-roster-view";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { fetchProgramForAdmin } from "@/app/lib/programs/data";
import { fetchProgramRoster } from "@/app/lib/programs/occurrence-queries";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ProgramEnrollmentsPage({ params }: Props) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const { id } = await params;
  const programId = Number(id);
  if (!Number.isInteger(programId)) notFound();

  const program = await fetchProgramForAdmin(programId);
  if (!program) notFound();

  // Pinned once (invariant 1): every tile, group count, and row on this
  // screen is judged against this same instant.
  const now = new Date();
  const roster = await fetchProgramRoster(programId, { now });

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="space-y-2">
        <Link
          href={`/dashboard/programs/${program.id}`}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          ← {program.name}
        </Link>
        <h1 className="text-2xl font-bold">Inscritos</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todas las sesiones</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgramRosterView roster={roster} />
        </CardContent>
      </Card>
    </div>
  );
}
