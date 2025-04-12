import { DataTable } from "@/app/components/ui/data_table/data-table";
import { ReservationCollaborationWithRelations } from "@/app/lib/collaborators/definitions";
import { columns, columnTitles } from "./columns";

export default function CollaboratorsTable({
  collaborators,
}: {
  collaborators: ReservationCollaborationWithRelations[];
}) {
  return (
    <DataTable
      columns={columns}
      data={collaborators}
      columnTitles={columnTitles}
    />
  );
}
