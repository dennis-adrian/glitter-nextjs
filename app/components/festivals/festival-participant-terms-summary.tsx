import Link from "next/link";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  fetchDraftFestivalTermsVersion,
  fetchPublishedFestivalTermsVersion,
} from "@/app/lib/festival-terms/queries";
import type { FestivalBase } from "@/app/lib/festivals/definitions";
import { formatDateWithTime } from "@/app/lib/formatters";

type FestivalParticipantTermsSummaryProps = {
  festivalStatus: FestivalBase["status"];
  participantTermsEnabled: FestivalBase["participantTermsEnabled"];
};

export default async function FestivalParticipantTermsSummary(
  props: FestivalParticipantTermsSummaryProps,
) {
  const [published, draft] = await Promise.all([
    fetchPublishedFestivalTermsVersion(),
    fetchDraftFestivalTermsVersion(),
  ]);

  const isPublicFestival =
    props.festivalStatus === "published" || props.festivalStatus === "active";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Términos para participantes</CardTitle>
        <CardDescription>
          Documento global compartido por todos los festivales. Cuando está
          publicado, los participantes pueden leerlo en la página de términos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="space-y-3 text-sm">
          <div className="space-y-0.5">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Versión publicada
            </dt>
            <dd>
              {published ? (
                <>
                  v{published.versionNumber}
                  {published.publishedAt ? (
                    <span className="text-muted-foreground">
                      {` · ${formatDateWithTime(published.publishedAt)}`}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">
                  Todavía no hay una versión publicada
                </span>
              )}
            </dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Borrador
            </dt>
            <dd className={draft ? undefined : "text-muted-foreground"}>
              {draft
                ? `v${draft.versionNumber} en edición`
                : "No hay un borrador abierto"}
            </dd>
          </div>
        </dl>

        {isPublicFestival && !published ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Este festival ya es visible para participantes, pero los términos
            globales todavía no están publicados.
          </p>
        ) : null}

        {isPublicFestival && published && !props.participantTermsEnabled ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Hay términos publicados, pero el acceso está deshabilitado para
            este festival. Actívalo en &quot;Términos para participantes&quot;,
            en Estado y acceso.
          </p>
        ) : null}

        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href="/dashboard/terms">
            {published ? "Gestionar términos" : "Publicar términos"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
