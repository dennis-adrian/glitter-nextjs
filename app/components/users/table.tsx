import { BaseProfile, UserCategory } from "@/app/api/users/definitions";
import UsersTableComponent from "@/app/components/users/users-table";
import UsersTableFilters from "@/app/components/users/filters/users-table-filters";
import UsersTablePagination from "@/app/components/users/users-table-pagination";
import {
  fetchUserProfiles,
  fetchUsersAggregates,
} from "@/app/lib/users/actions";

type UsersTableProps = {
  includeAdmins?: boolean;
  status?: BaseProfile["status"][];
  category?: UserCategory[];
  query?: string;
  columnVisbility?: Record<string, boolean>;
  limit: number;
  offset: number;
};
export default async function UsersTable({
  limit,
  offset,
  status,
  includeAdmins,
  category,
  query,
}: UsersTableProps) {
  const users = await fetchUserProfiles({
    limit,
    offset,
    includeAdmins,
    status,
    category,
    query: query,
  });
  const aggregates = await fetchUsersAggregates({
    includeAdmins,
    status,
    category,
  });

  const canNextPage = offset + limit < aggregates.total;
  const canPreviousPage = offset > 0;
  const pageCount = Math.ceil(aggregates.total / limit);

  return (
    <>
      <UsersTableFilters />
      <UsersTableComponent users={users} />
      <UsersTablePagination
        canNextPage={canNextPage}
        canPreviousPage={canPreviousPage}
        pageIndex={Math.floor(offset / limit) + 1}
        pageCount={pageCount}
        pageSize={limit.toString()}
        rowCount={users.length || 0}
        total={aggregates.total || 0}
      />
    </>
  );
}
