import VerifyTicketForm from "@/app/dashboard/festivals/[id]/tickets/verification/form";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

export default function Page({ params }: { params: { id: string } }) {
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) notFound();

  return (
    <div className="container">
      <h1 className="font-2xl font-semibold">Verificar Entradas</h1>
      <VerifyTicketForm festivalId={validatedParams.data.id} />
    </div>
  );
}
