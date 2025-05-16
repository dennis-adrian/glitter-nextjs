import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import { ColumnDef } from "@tanstack/react-table";

export const columnTitles = {
	id: "ID",
};

export const columns: ColumnDef<OrderWithRelations>[] = [
	{
		accessorKey: "id",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.id} />
		),
	},
];
