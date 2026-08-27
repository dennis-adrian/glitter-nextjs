import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { getFestivalTermsAdminState } from "@/app/lib/festival-terms/actions";
import { formatDateWithTime, formatFullDate } from "@/app/lib/formatters";
import { requireAdmin } from "@/app/lib/users/helpers";

export default async function FestivalTermsDashboardPage() {
  const profile = await requireAdmin();
  if (!profile) {
    redirect("/dashboard");
  }

  const state = await getFestivalTermsAdminState();
  if (!state.success) {
    redirect("/dashboard");
  }

  const { published, draft, versions } = state;

  return (
    <div className="container space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Términos y condiciones</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Documento global para la inscripción a festivales. Los
            participantes no ven el número de versión; cada festival nuevo pide
            aceptación, y una publicación nueva obliga a reaceptar en festivales
            activos.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/terms/edit">
            {draft ? "Continuar borrador" : "Editar términos"}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Versión publicada</CardTitle>
            <CardDescription>
              {published
                ? `v${published.versionNumber}`
                : "Todavía no hay una versión publicada"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {published ? (
              <>
                <p>
                  Publicada:{" "}
                  {published.publishedAt
                    ? formatDateWithTime(published.publishedAt)
                    : "—"}
                </p>
                {published.publishedBy?.displayName ? (
                  <p>Por {published.publishedBy.displayName}</p>
                ) : null}
                {published.changelog ? (
                  <p className="text-muted-foreground">{published.changelog}</p>
                ) : null}
                <Button asChild variant="outline" size="sm">
                  <Link href={`/dashboard/terms/versions/${published.id}`}>
                    Ver contenido
                  </Link>
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">
                Publicá un borrador para que los participantes puedan aceptar
                términos.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Borrador</CardTitle>
            <CardDescription>
              {draft ? `v${draft.versionNumber}` : "No hay un borrador abierto"}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {draft ? (
              <p>
                Última edición: {formatDateWithTime(draft.updatedAt)}. Los
                cambios no se muestran a los participantes hasta publicar.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Al editar se crea un borrador a partir de la versión publicada.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
          <CardDescription>
            Solo visible para administradores. Cada publicación queda guardada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Versión</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 pr-3 font-medium">Publicada</th>
                  <th className="py-2 pr-3 font-medium">Nota</th>
                  <th className="py-2 font-medium">Secciones</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <tr key={version.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <Link
                        href={`/dashboard/terms/versions/${version.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        v{version.versionNumber}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      {version.status === "published"
                        ? "Publicada"
                        : version.status === "archived"
                          ? "Archivada"
                          : "Borrador"}
                    </td>
                    <td className="py-2 pr-3">
                      {version.publishedAt
                        ? formatFullDate(version.publishedAt)
                        : "—"}
                    </td>
                    <td className="max-w-sm truncate py-2 pr-3 text-muted-foreground">
                      {version.changelog || "—"}
                    </td>
                    <td className="py-2">{version.sectionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
