import { notFound } from "next/navigation";
import UpdateFestivalForm from "@/app/components/festivals/forms/update-festival";
import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";
import { fetchFestivalWithDatesAndSectors } from "@/app/lib/festivals/actions";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const festival = await fetchFestivalWithDatesAndSectors(Number(params.id));
  if (!festival) return notFound();

  return (
    <div className="container p-4 md:p-6">
      {/* The installed app's top bar carries back and the title. */}
      <PageBreadcrumbs
        className="mb-4"
        labels={{ [`/dashboard/festivals/${festival.id}`]: festival.name }}
      />
      <h1
        className="mb-2 text-2xl font-bold md:text-3xl"
        data-installed-title=""
      >
        Editar Festival
      </h1>
      <UpdateFestivalForm festival={festival} />
    </div>
  );
}
