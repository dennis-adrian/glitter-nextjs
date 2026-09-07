import { columns, columnTitles } from "./columns";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { fetchExternalParticipants } from "@/app/lib/external_participants/actions";

export default async function ExternalParticipantsTable() {
  const externalParticipants = await fetchExternalParticipants();

  return (
    <DataTable
      columns={columns}
      data={externalParticipants}
      columnTitles={columnTitles}
      filters={[]}
    />
  );
}
