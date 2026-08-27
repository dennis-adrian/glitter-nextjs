import Link from "next/link";

import { Button } from "@/app/components/ui/button";
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
    <div className="mt-4 rounded-lg border p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-xl">Términos para participantes</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Documento global compartido por todos los festivales. Cuando está
          publicado, los participantes pueden leerlo en la página de términos.
        </p>
      </div>

      <dl className="space-y-2 text-sm">
        <div>
          <dt className="font-medium">Acceso en este festival</dt>
          <dd className="text-muted-foreground">
            {props.participantTermsEnabled
              ? "Habilitado — los participantes pueden ver y aceptar términos"
              : "Deshabilitado — los participantes no pueden acceder a la página de términos"}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Versión publicada</dt>
          <dd className="text-muted-foreground">
            {published ? (
              <>
                v{published.versionNumber}
                {published.publishedAt
                  ? ` · ${formatDateWithTime(published.publishedAt)}`
                  : null}
              </>
            ) : (
              "Todavía no hay una versión publicada"
            )}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Borrador</dt>
          <dd className="text-muted-foreground">
            {draft
              ? `v${draft.versionNumber} en edición`
              : "No hay un borrador abierto"}
          </dd>
        </div>
      </dl>

      {isPublicFestival && !published ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
          Este festival ya es visible para participantes, pero los términos globales
          todavía no están publicados en el CMS.
        </p>
      ) : null}

      {isPublicFestival && published && !props.participantTermsEnabled ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
          Hay términos publicados en el CMS, pero el acceso está deshabilitado
          para este festival. Activá &quot;Términos para participantes&quot; en los
          interruptores de arriba.
        </p>
      ) : null}

      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/terms">
          {published ? "Gestionar términos" : "Publicar términos"}
        </Link>
      </Button>
    </div>
  );
}
