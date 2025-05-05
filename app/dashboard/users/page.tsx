import { getCurrentUserProfile } from "@/app/lib/users/helpers";

import UsersTableFilters from "@/app/components/users/filters/users-table-filters";
import TableFiltersSkeleton from "@/app/components/users/skeletons/filters";
import TableSkeleton from "@/app/components/users/skeletons/table";
import UsersTable from "@/app/components/users/table";
import {
	SearchParamsSchema,
	SearchParamsSchemaType,
} from "@/app/dashboard/users/schemas";
import {
	fetchUserProfiles,
	fetchUsersAggregates,
} from "@/app/lib/users/actions";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export default async function Page(props: {
	searchParams: Promise<SearchParamsSchemaType>;
}) {
	const searchParams = await props.searchParams;
	const validatedSearchParams = SearchParamsSchema.safeParse(searchParams);
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
	} = validatedSearchParams.data;

	const fetchUsersPromise = fetchUserProfiles({
		limit: limit || 10,
		offset: offset || 0,
		includeAdmins,
		status,
		category,
		query,
		sort,
		direction,
		profileCompletion,
	});
	const fetchUsersAggregatesPromise = fetchUsersAggregates({
		includeAdmins,
		status,
		category,
		query,
		profileCompletion,
	});

	return (
		<div className="container mx-auto min-h-full p-3 md:p-6">
			<h1 className="mb-2 text-2xl font-bold md:text-3xl">Usuarios</h1>
			<div className="flex flex-col gap-4 group">
				<Suspense fallback={<TableFiltersSkeleton />}>
					<UsersTableFilters />
				</Suspense>
				<Suspense fallback={<TableSkeleton />}>
					<UsersTable
						fetchUsersPromise={fetchUsersPromise}
						fetchUsersAggregatesPromise={fetchUsersAggregatesPromise}
					/>
				</Suspense>
			</div>
		</div>
	);
}
