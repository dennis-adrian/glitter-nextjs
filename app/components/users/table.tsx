import { ProfileType, UsersAggregates } from "@/app/api/users/definitions";
import UsersTableComponent from "@/app/components/users/users-table";
import UsersTablePagination from "@/app/components/users/users-table-pagination";

type UsersTableProps = {
  aggregates: UsersAggregates;
  users: ProfileType[];
  status?: "complete" | "missingFields";
  columnVisbility?: Record<string, boolean>;
  limit: number;
  offset: number;
};
export default function UsersTable(props: UsersTableProps) {
  const canNextPage = props.offset + props.limit < props.aggregates.total;
  const canPreviousPage = props.offset > 0;
  const pageCount = Math.ceil(props.aggregates.total / props.limit);
  console.log("total", props.aggregates.total);

  return (
    <>
      <UsersTableComponent {...props} />
      <UsersTablePagination
        canNextPage={canNextPage}
        canPreviousPage={canPreviousPage}
        pageIndex={Math.floor(props.offset / props.limit) + 1}
        pageCount={pageCount}
        pageSize={props.limit.toString()}
        rowCount={props.users.length || 0}
        total={props.aggregates.total || 0}
      />
    </>
  );
}
