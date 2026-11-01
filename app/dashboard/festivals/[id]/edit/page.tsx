import { notFound } from "next/navigation";
import UpdateFestivalForm from "@/app/components/festivals/forms/update-festival";
import { fetchFestivalWithDatesAndSectors } from "@/app/lib/festivals/actions";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const festival = await fetchFestivalWithDatesAndSectors(Number(params.id));
  if (!festival) return notFound();

  return (
    <div className="container p-4 md:p-6">
      {/* The installed app's top bar carries back and the title. */}
      <Breadcrumb className="mb-4" data-installed-hidden="">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard/festivals">
              Festivales
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/dashboard/festivals/${festival.id}`}>
              {festival.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Editar</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
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
