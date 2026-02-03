import { notFound } from "next/navigation";
import { z } from "zod";

import { getFestivalById } from "@/app/lib/festivals/helpers";
import { fetchFestivalSectors } from "@/app/lib/festival_sectors/actions";
import StandPositionEditor from "@/app/components/maps/admin/stand-position-editor";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

export default async function StandPositionsPage({
  params,
}: {
  params: Promise<z.infer<typeof ParamsSchema>>;
}) {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return notFound();
  }
  const { id } = parsed.data;
  const [festival, sectors] = await Promise.all([
    getFestivalById(id),
    fetchFestivalSectors(id),
  ]);

  if (!festival) {
    return notFound();
  }

  return (
    <div className="container">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">
        Editor del mapa - {festival.name}
      </h1>
      <p className="text-muted-foreground mb-4">
        Arrastra los espacios para reposicionarlos. Usa scroll para acercar o
        alejar.
      </p>
      <StandPositionEditor festivalId={id} sectors={sectors} />
    </div>
  );
}
