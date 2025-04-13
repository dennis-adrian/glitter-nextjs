import FestivalCard from "@/app/components/festivals/festival-card";
import { getFestivalById } from "@/app/data/festivals/actions";
import { notFound } from "next/navigation";

export default async function FestivalDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const festival = await getFestivalById(Number(params.id));

  if (!festival) {
    return notFound();
  }

  return (
    <div className="container p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold md:text-3xl">Detalles del Festival</h1>
        <p className="text-muted-foreground">
          Información detallada del festival seleccionado
        </p>
      </div>
      
      <div className="max-w-3xl mx-auto">
        <FestivalCard festival={festival} />
      </div>
    </div>
  );
}