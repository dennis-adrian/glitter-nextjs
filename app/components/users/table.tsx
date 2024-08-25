import { BaseProfile, UserCategory } from "@/app/api/users/definitions";
import UsersTableComponent from "@/app/components/users/users-table";
import UsersTableFilters from "@/app/components/users/filters/users-table-filters";
import { Suspense } from "react";
import TableSkeleton from "@/app/components/users/skeletons/table";

type UsersTableProps = {
  includeAdmins?: boolean;
  status?: BaseProfile["status"][];
  category?: UserCategory[];
  query?: string;
  columnVisbility?: Record<string, boolean>;
  limit?: number;
  offset?: number;
  sort: keyof BaseProfile;
  direction: "asc" | "desc";
  profileCompletion: "complete" | "incomplete" | "all";
};
export default async function UsersTable(props: UsersTableProps) {
  return (
    <>
      <UsersTableFilters />
      <Suspense fallback={<TableSkeleton />}>
        <UsersTableComponent {...props} />
      </Suspense>
    </>
  );
}
