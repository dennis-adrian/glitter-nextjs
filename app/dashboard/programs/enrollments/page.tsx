import type { Metadata } from "next";
import { redirect } from "next/navigation";

import EnrollmentSearchResults from "@/app/components/dashboard/programs/enrollment/enrollment-search-results";
import Search from "@/app/components/ui/search";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import {
  ENROLLMENT_SEARCH_MIN_LENGTH,
  searchEnrollments,
} from "@/app/lib/programs/purchase-queries";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

export const metadata: Metadata = {
  title: "Buscar inscripciones",
};

type Props = {
  searchParams: Promise<{ query?: string }>;
};

/**
 * Find any enrollment by the person it belongs to.
 *
 * The rest of the dashboard is organised by program → session → occurrence,
 * which is the one thing a caller asking for help does not know. This is the
 * only route to an approved or free enrollment that does not require knowing
 * where it sits in that hierarchy.
 */
export default async function EnrollmentSearchPage({ searchParams }: Props) {
  await requireFeatureEnabled("paid_programs");

  const admin = await requireAdminOrFestivalAdmin();
  if (!admin) redirect("/dashboard");

  const { query: rawQuery } = await searchParams;
  const query = (rawQuery ?? "").trim();
  const results =
    query.length >= ENROLLMENT_SEARCH_MIN_LENGTH
      ? await searchEnrollments(query)
      : [];

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-3 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Inscripciones</h1>
        <p className="text-sm text-muted-foreground">
          Busca a una persona y abre su inscripción para aprobar, reenviar el
          enlace o cancelar.
        </p>
      </header>

      <Search placeholder="Nombre, correo, código de entrada o #123" />

      <EnrollmentSearchResults results={results} query={query} />
    </div>
  );
}
