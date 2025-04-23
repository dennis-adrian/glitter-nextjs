import CollaboratorsTable from "@/app/components/organisms/collaborators/collaborators-table";
import { fetchReservationCollaborationsByFestivalId } from "@/app/lib/collaborators/actions";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

export default async function Page({
  params,
}: {
  params: Promise<z.infer<typeof ParamsSchema>>;
}) {
  const { id } = await params;
  const collaborators = await fetchReservationCollaborationsByFestivalId(id);

  return (
    <div className="container p-4 md:p-6">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">
        Colaboradores del Festival
      </h1>
      <CollaboratorsTable collaborators={collaborators} />
    </div>
  );
}
