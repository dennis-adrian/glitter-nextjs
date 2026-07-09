import ParticipantsTableFilters from "@/app/components/users/filters/participants-table-filters";
import ParticipantSummaryBar from "@/app/components/users/participant-summary-bar";
import TableFiltersSkeleton from "@/app/components/users/skeletons/filters";
import TableSkeleton from "@/app/components/users/skeletons/table";
import ParticipantsTable from "@/app/components/users/participants-table";
import {
  ParticipantSearchParamsSchema,
  ParticipantSearchParamsSchemaType,
} from "@/app/dashboard/users/schemas";
import {
  fetchParticipantAggregates,
  fetchParticipantProfiles,
} from "@/app/lib/participants/actions";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export default async function Page(props: {
  searchParams: Promise<ParticipantSearchParamsSchemaType>;
}) {
  const searchParams = await props.searchParams;
  const validatedSearchParams =
    ParticipantSearchParamsSchema.safeParse(searchParams);
  if (!validatedSearchParams.success) notFound();

  const {
    limit,
    offset,
    includeAdmins,
    status,
    category,
    query,
    sort,
    direction,
    profileCompletion,
    pauseEligible,
  } = validatedSearchParams.data;

  const listFilters = {
    limit: limit || 10,
    offset: offset || 0,
    includeAdmins,
    status,
    category,
    query,
    sort,
    direction,
    profileCompletion,
    pauseEligible,
  };

  const fetchParticipantsPromise = fetchParticipantProfiles(listFilters);
  const fetchParticipantAggregatesPromise = fetchParticipantAggregates({
    includeAdmins,
    status,
    category,
    query,
    profileCompletion,
    pauseEligible,
  });

  return (
    <div className="container mx-auto min-h-full min-w-0 overflow-x-hidden p-3 md:p-6">
      <h1 className="mb-2 text-xl font-bold sm:text-2xl md:text-3xl">
        Participantes
      </h1>
      <div className="flex min-w-0 flex-col gap-3 sm:gap-4 group">
        <Suspense fallback={<TableFiltersSkeleton />}>
          <ParticipantsTableFilters />
        </Suspense>
        <Suspense
          fallback={
            <div className="h-10 animate-pulse rounded-lg border bg-muted" />
          }
        >
          <ParticipantSummarySection
            fetchParticipantAggregatesPromise={
              fetchParticipantAggregatesPromise
            }
          />
        </Suspense>
        <Suspense fallback={<TableSkeleton />}>
          <ParticipantsTable
            fetchParticipantsPromise={fetchParticipantsPromise}
            fetchParticipantAggregatesPromise={
              fetchParticipantAggregatesPromise
            }
          />
        </Suspense>
      </div>
    </div>
  );
}

async function ParticipantSummarySection({
  fetchParticipantAggregatesPromise,
}: {
  fetchParticipantAggregatesPromise: ReturnType<
    typeof fetchParticipantAggregates
  >;
}) {
  const aggregates = await fetchParticipantAggregatesPromise;
  return <ParticipantSummaryBar aggregates={aggregates} />;
}
