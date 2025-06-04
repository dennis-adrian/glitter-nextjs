import { notFound } from "next/navigation";
import UpdateFestivalForm from "@/app/components/festivals/forms/update-festival";
import { fetchFestivalWithDatesAndSectors } from "@/app/lib/festivals/actions";

export default async function Page(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const festival = await fetchFestivalWithDatesAndSectors(Number(params.id));
  if (!festival) return notFound();

  return (
    <div className="container">
      <h1 className="text-2xl font-bold md:text-3xl mb-2">Editar Festival</h1>
      <UpdateFestivalForm festival={festival} />
    </div>
  );
}