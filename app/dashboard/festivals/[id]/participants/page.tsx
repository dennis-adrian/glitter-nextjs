import ParticipantsTable from "@/app/components/festivals/participants/table";
import TableSkeleton from "@/app/components/users/skeletons/table";
import {
  ParticipantsParamsSchema,
  ParticipantsParamsSchemaType,
} from "@/app/dashboard/festivals/[id]/participants/schemas";
import { notFound } from "next/navigation";
import { Suspense } from "react";

type PageProps = {
  params: ParticipantsParamsSchemaType;
};
export default function Page({ params }: PageProps) {
  const validatedParams = ParticipantsParamsSchema.safeParse(params);
  if (!validatedParams.success) notFound();

  return (
    <div className="container p-4 md:p6">
      <h1 className="text-2xl font-bold">Participantes</h1>
      <Suspense fallback={<TableSkeleton />}>
        <ParticipantsTable festivalId={validatedParams.data.id} />
      </Suspense>
    </div>
  );
}
