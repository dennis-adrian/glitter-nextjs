import {
  columns,
  columnTitles,
} from "@/app/components/festivals/participants/columns";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { fetchFestivalParticipants } from "@/app/data/festivals/actions";

export default async function ParticipantsTable({
  festivalId,
}: {
  festivalId: number;
}) {
  const participants = await fetchFestivalParticipants(festivalId);
  return (
    <DataTable
      columnTitles={columnTitles}
      columns={columns}
      data={participants}
    />
  );
}
