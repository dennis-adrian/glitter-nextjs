import { fetchAllFestivalEnrolledUsers } from "@/app/lib/festivals/actions";
import { fetchFestivalSectors } from "@/app/lib/festival_sectors/actions";
import { fetchExternalParticipants } from "@/app/lib/external_participants/actions";
import CreateReservationForm from "./form";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

export default async function NewReservationPage({
  params,
}: {
  params: Promise<z.infer<typeof ParamsSchema>>;
}) {
  const { id } = ParamsSchema.parse(await params);
  const [enrolledUsers, sectors, externalParticipants] = await Promise.all([
    fetchAllFestivalEnrolledUsers(id),
    fetchFestivalSectors(id),
    fetchExternalParticipants(),
  ]);

  return (
    <div className="container p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Agregar reserva</h1>
      </div>
      <CreateReservationForm
        festivalId={id}
        users={enrolledUsers}
        sectors={sectors}
        externalParticipants={externalParticipants}
      />
    </div>
  );
}
