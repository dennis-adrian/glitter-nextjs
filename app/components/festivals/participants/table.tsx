import {
  columns as participatingColumns,
  columnTitles as participatingColumnTitles,
} from "@/app/components/festivals/participants/columns";
import {
  columns as enrolledColumns,
  columnTitles as enrolledColumnTitles,
} from "@/app/components/festivals/participants/enrolledColumns";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import {
  fetchEnrolledParticipants,
  fetchFestivalParticipants,
} from "@/app/data/festivals/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function ParticipantsTable({
  festivalId,
}: {
  festivalId: number;
}) {
  const participants = await fetchFestivalParticipants(festivalId);
  const enrolledUsers = await fetchEnrolledParticipants(festivalId);

  return (
    <Tabs defaultValue="participating" className="my-4">
      <TabsList>
        <TabsTrigger value="participating">Con Reserva</TabsTrigger>
        <TabsTrigger value="enrolled">Sin Reserva</TabsTrigger>
      </TabsList>
      <TabsContent value="participating">
        <DataTable
          columnTitles={participatingColumnTitles}
          columns={participatingColumns}
          data={participants}
        />
      </TabsContent>
      <TabsContent value="enrolled">
        <DataTable
          columnTitles={enrolledColumnTitles}
          columns={enrolledColumns}
          data={enrolledUsers}
        />
      </TabsContent>
    </Tabs>
  );
}
