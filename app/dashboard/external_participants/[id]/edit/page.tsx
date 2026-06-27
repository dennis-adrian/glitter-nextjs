import ExternalParticipantForm from "@/app/components/organisms/external_participants/external-participant-form";
import ResourceNotFound from "@/app/components/resource-not-found";
import { fetchExternalParticipant } from "@/app/lib/external_participants/actions";
import { z } from "zod";

const ParamsSchema = z.object({ id: z.coerce.number() });

export default async function EditExternalParticipantPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) return <ResourceNotFound />;

  const result = await fetchExternalParticipant(validatedParams.data.id);
  if ("error" in result) throw result.error;
  if (!result.found) return <ResourceNotFound />;

  return (
    <div className="container p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-bold">Editar participante externo</h1>
      <ExternalParticipantForm externalParticipant={result.participant} />
    </div>
  );
}
