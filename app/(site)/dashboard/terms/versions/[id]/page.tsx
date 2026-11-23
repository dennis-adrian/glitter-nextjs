import { notFound, redirect } from "next/navigation";

import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";
import { ScreenTitle } from "@/app/components/navbar/screen-bar";
import FestivalTermsVersionPreview from "@/app/components/festival-terms/version-preview";
import { fetchFestivalTermsVersionById } from "@/app/lib/festival-terms/queries";
import { formatDateWithTime } from "@/app/lib/formatters";
import { requireAdmin } from "@/app/lib/users/helpers";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function FestivalTermsVersionPage({ params }: PageProps) {
  const profile = await requireAdmin();
  if (!profile) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const versionId = Number(id);
  if (!Number.isInteger(versionId) || versionId <= 0) notFound();

  const version = await fetchFestivalTermsVersionById(versionId);
  if (!version) notFound();

  const statusLabel =
    version.status === "published"
      ? "publicada"
      : version.status === "archived"
        ? "archivada"
        : "borrador";

  return (
    <div className="container space-y-6 p-4 md:p-6">
      <ScreenTitle title={`Versión ${version.versionNumber} ${statusLabel}`} />
      <div>
        <PageBreadcrumbs />
        <h1 className="text-2xl font-semibold" data-installed-title="">
          Versión {version.versionNumber}{" "}
          <span className="text-base font-normal text-muted-foreground">
            {statusLabel}
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {version.publishedAt
            ? `Publicada ${formatDateWithTime(version.publishedAt)}`
            : `Creada ${formatDateWithTime(version.createdAt)}`}
          {version.changelog ? ` · ${version.changelog}` : ""}
        </p>
      </div>
      <FestivalTermsVersionPreview version={version} />
    </div>
  );
}
