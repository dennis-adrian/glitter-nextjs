import Link from "next/link";
import { redirect } from "next/navigation";

import SessionForm from "@/app/components/dashboard/programs/session-form";
import { fetchFestivals } from "@/app/lib/festivals/actions";
import { fetchSessionTopics, fetchVenues } from "@/app/lib/programs/data";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

export default async function NewStandaloneSessionPage() {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const [venues, topics, festivals] = await Promise.all([
    fetchVenues(),
    fetchSessionTopics(),
    fetchFestivals(),
  ]);

  return (
    <div className="container max-w-2xl p-3 md:p-6 flex flex-col gap-6">
      <div className="space-y-1">
        <Link
          href="/dashboard/programs"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Programas
        </Link>
        <h1 className="text-2xl font-bold">Nueva charla o taller suelto</h1>
        <p className="text-sm text-muted-foreground">
          Una sesión que no pertenece a ningún programa. Se vende por su cuenta
          y no acepta códigos promocionales.
        </p>
      </div>
      <SessionForm
        programId={null}
        // The upload endpoint accepts admins only.
        canUploadImages={profile.role === "admin"}
        venues={venues}
        topics={topics}
        festivals={festivals.map((festival) => ({
          id: festival.id,
          name: festival.name,
        }))}
      />
    </div>
  );
}
