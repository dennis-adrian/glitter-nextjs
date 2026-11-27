import NewFestivalForm from "@/app/components/festivals/forms/new-festival";
import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";

export default function Page() {
  return (
    <div className="container p-4 md:p-6">
      {/* The installed app's top bar carries back and the title. */}
      <PageBreadcrumbs className="mb-6" />

      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold" data-installed-title="">
          Nuevo Festival
        </h1>
        <NewFestivalForm />
      </div>
    </div>
  );
}
