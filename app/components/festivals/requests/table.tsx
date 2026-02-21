import { fetchFestivalParticipationRequests } from "@/app/api/user_requests/actions";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { columns, columnTitles } from "@/app/components/festivals/requests/columns";

export default async function FestivalRequestsTable({
  festivalId,
}: {
  festivalId: number;
}) {
  const requests = await fetchFestivalParticipationRequests(festivalId);

  return (
    <DataTable
      columnTitles={columnTitles}
      columns={columns}
      data={requests}
      filters={[
        {
          columnId: "status",
          label: "Estado",
          options: [
            { label: "Pendiente", value: "pending" },
            { label: "Aceptada", value: "accepted" },
            { label: "Rechazada", value: "rejected" },
          ],
        },
      ]}
    />
  );
}
