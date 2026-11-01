import NewFestivalForm from "@/app/components/festivals/forms/new-festival";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default function Page() {
  return (
    <div className="container p-4 md:p-6">
      {/* The installed app's top bar carries back and the title. */}
      <div className="mb-6" data-installed-hidden="">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard/festivals">
                Festivales
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Nuevo Festival</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold" data-installed-title="">
          Nuevo Festival
        </h1>
        <NewFestivalForm />
      </div>
    </div>
  );
}
