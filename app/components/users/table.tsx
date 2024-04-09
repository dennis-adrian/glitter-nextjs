import { ProfileType } from "@/app/api/users/definitions";
import {
  DataTable,
  DataTableInitialState,
} from "@/app/components/ui/data_table/data-table";
import { columnTitles, columns } from "@/components/users/columns";
import { userCategoryOptions } from "@/app/lib/utils";

type UsersTableProps = {
  users: ProfileType[];
  status?: "complete" | "incomplete" | "all";
  columnVisbility?: Record<string, boolean>;
};
export default function UsersTable(props: UsersTableProps) {
  return (
    <DataTable
      columns={columns}
      columnTitles={columnTitles}
      data={props.users}
      filters={[
        {
          columnId: "category",
          options: [
            { value: "none", label: "Sin categoría" },
            ...userCategoryOptions,
          ],
        },
      ]}
      initialState={{
        columnVisibility: {
          fullName: false,
          email: false,
          phoneNumber: false,
          status: false,
          ...props.columnVisbility,
        },
        columnFilters: [
          {
            id: "status",
            value: props.status,
          },
        ],
      }}
    />
  );
}
