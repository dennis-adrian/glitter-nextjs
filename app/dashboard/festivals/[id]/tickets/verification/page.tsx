import VerifyTicketForm from "@/app/dashboard/festivals/[id]/tickets/verification/form";
import VerifiedTickets from "@/app/dashboard/festivals/[id]/tickets/verification/verified-tickets";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

export default function Page({ params }: { params: { id: string } }) {
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) notFound();

  return (
    <div className="container px-4 md:px-6">
      <h1 className="text-xl md:text-2xl font-semibold mb-4">
        Verificar Entradas
      </h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <VerifyTicketForm festivalId={validatedParams.data.id} />
        <VerifiedTickets festivalId={validatedParams.data.id} />
      </div>
    </div>
  );
}
