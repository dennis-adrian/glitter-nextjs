import FestivalCard from "@/app/components/festivals/festival-card";
import { getFestivalById } from "@/app/lib/festivals/helpers";
import { notFound } from "next/navigation";
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
  const festival = await getFestivalById(id);

  if (!festival) {
    return notFound();
  }

  return (
    <div className="container">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">
        Detalles del festival
      </h1>
      <FestivalCard festival={festival} />
    </div>
  );
}
