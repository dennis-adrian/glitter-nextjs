import { notFound } from "next/navigation";
import UpdateFestivalForm from "@/app/components/festivals/forms/update-festival";
import { fetchFestivalWithDates } from "@/app/data/festivals/actions";

export default async function Page({ params }: { params: { id: string } }) {
  const festival = await fetchFestivalWithDates(Number(params.id));
  if (!festival) return notFound();

  return (
    <div className="container p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-6">Editar Festival</h1>
      <UpdateFestivalForm festival={festival} />
    </div>
  );
}