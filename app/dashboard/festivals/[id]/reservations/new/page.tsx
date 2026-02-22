import { fetchAllFestivalEnrolledUsers } from "@/app/lib/festivals/actions";
import { fetchFestivalSectors } from "@/app/lib/festival_sectors/actions";
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
  const { id } = await params;
  const [enrolledUsers, sectors] = await Promise.all([
    fetchAllFestivalEnrolledUsers(id),
    fetchFestivalSectors(id),
  ]);

  return (
    <div className="container max-w-lg py-8">
      <h1 className="text-2xl font-bold mb-6">Agregar reserva</h1>
      <CreateReservationForm
        festivalId={id}
        users={enrolledUsers}
        sectors={sectors}
      />
    </div>
  );
}
