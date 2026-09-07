import InfractionsFilters from "@/app/components/infractions/filters";
import InfractionsList from "@/app/components/infractions/list";
import RegisterInfractionButton from "@/app/components/infractions/register-button";
import { Button } from "@/app/components/ui/button";
import TableSkeleton from "@/app/components/users/skeletons/table";
import { InfractionSearchParamsSchema } from "@/app/dashboard/infractions/schemas";
import { fetchAllInfractionTypes } from "@/app/lib/infraction-types/actions";
import { fetchInfractionTypes } from "@/app/lib/infractions/actions";
import {
  fetchFestivalsForInfractionFilters,
  fetchInfractionsPage,
} from "@/app/lib/infractions/queries";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DateTime } from "luxon";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { Settings2Icon } from "lucide-react";
import Link from "next/link";

export default async function InfractionsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const validated = InfractionSearchParamsSchema.safeParse(searchParams);
  if (!validated.success) notFound();

  const filters = validated.data;
  const recentlyResolvedFrom = DateTime.now()
    .setZone(STORE_TIMEZONE)
    .minus({ days: 30 })
    .toISODate();
  const [activeInfractionTypes, allInfractionTypes, festivals] =
    await Promise.all([
      fetchInfractionTypes(),
      fetchAllInfractionTypes(),
      fetchFestivalsForInfractionFilters(),
    ]);

  const fetchPromise = fetchInfractionsPage(filters);

  return (
    <div className="container mx-auto min-h-full min-w-0 overflow-x-hidden p-3 md:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold sm:text-2xl md:text-3xl">
          Infracciones
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/infractions/types">
              <Settings2Icon className="mr-2 size-4" />
              Gestionar tipos
            </Link>
          </Button>
          <RegisterInfractionButton
            infractionTypes={activeInfractionTypes}
            festivals={festivals.map((festival) => ({
              id: festival.id,
              name: festival.name,
            }))}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
        <Suspense
          fallback={<div className="h-20 animate-pulse rounded-lg bg-muted" />}
        >
          <InfractionsFilters
            infractionTypes={allInfractionTypes}
            festivals={festivals.map((festival) => ({
              id: festival.id,
              name: festival.name,
            }))}
          />
        </Suspense>

        <div className="flex flex-wrap gap-2 text-sm">
          <PresetLink
            href="/dashboard/infractions?status=pending&limit=25&offset=0"
            label="Pendientes"
          />
          <PresetLink
            href="/dashboard/infractions?status=under_review&limit=25&offset=0"
            label="En revisión"
          />
          <PresetLink
            href={`/dashboard/infractions?status=resolved&resolvedFrom=${recentlyResolvedFrom}&limit=25&offset=0`}
            label="Resueltas recientemente"
          />
          <PresetLink
            href="/dashboard/infractions?status=voided&limit=25&offset=0"
            label="Anuladas"
          />
          <PresetLink
            href="/dashboard/infractions?hasSanction=true&sanctionStatus=active&limit=25&offset=0"
            label="Con sanción activa"
          />
          <PresetLink
            href="/dashboard/infractions?hasSanction=false&limit=25&offset=0"
            label="Sin sanción"
          />
        </div>

        <Suspense fallback={<TableSkeleton />}>
          <InfractionsList
            fetchPromise={fetchPromise}
            limit={filters.limit}
            offset={filters.offset}
          />
        </Suspense>
      </div>
    </div>
  );
}

function PresetLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="rounded-full border px-3 py-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      {label}
    </a>
  );
}
