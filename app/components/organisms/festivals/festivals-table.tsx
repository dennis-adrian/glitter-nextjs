import { columns } from "@/app/components/organisms/festivals/columns";
import { columnTitles } from "@/app/components/reservations/columns";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";

type FestivalsTableProps = {
  festivals: FestivalWithDates[];
};

export default function FestivalsTable({ festivals }: FestivalsTableProps) {
  return (
    <DataTable columns={columns} data={festivals} columnTitles={columnTitles} />
  );
}
