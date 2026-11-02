"use client";

import { UserIcon, XIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import {
  narrowedNote,
  overlapText,
  peopleCountText,
  realSkippedCount,
  TOO_LARGE_TEXT,
  type ComposerEnv,
} from "@/app/components/comunicados/admin/composer/composer-copy";
import ListKindIcon from "@/app/components/comunicados/admin/composer/list-kind-icon";
import ListSourcePicker from "@/app/components/comunicados/admin/composer/list-source-picker";
import PersonPicker from "@/app/components/comunicados/admin/composer/person-picker";
import RetryButton from "@/app/components/comunicados/admin/composer/retry-button";
import SkippedDialog from "@/app/components/comunicados/admin/composer/skipped-dialog";
import type {
  ComposerFestivalOption,
  ComposerListOption,
  ComposerPerson,
  ComposerSourceNames,
} from "@/app/components/comunicados/admin/composer/types";
import { Badge } from "@/app/components/ui/badge";
import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Skeleton } from "@/app/components/ui/skeleton";
import type {
  ComunicadoAudiencePreview,
  ComunicadoAudienceSourcePreview,
} from "@/app/lib/comunicados/audience";
import {
  COMUNICADO_MAX_PEOPLE,
  COMUNICADO_MAX_SOURCES,
  type ComunicadoAudience,
  isEmptyComunicadoAudience,
} from "@/app/lib/comunicados/definitions";
import {
  confirmadosListName,
  formatAudienceCount,
  skippedCountText,
} from "@/app/lib/distribution_lists/definitions";
import { cn } from "@/app/lib/utils";

export type SourceKind = "festival" | "list" | "person";

type RecipientsCardProps = {
  audience: ComunicadoAudience;
  names: ComposerSourceNames;
  festivals: ComposerFestivalOption[];
  lists: ComposerListOption[];
  preview: ComunicadoAudiencePreview | null;
  /** The preview answers an earlier audience; a newer one is on its way. */
  previewStale: boolean;
  /** Why the live count could not be read, shown in its place. */
  previewError: string | null;
  /** Asks for the count again now, instead of after the next pause. */
  onRetryPreview: () => void;
  env: ComposerEnv;
  onAddFestival: (festivalId: number) => void;
  onAddList: (listId: number) => void;
  onAddPerson: (person: ComposerPerson) => void;
  onRemove: (kind: SourceKind, id: number) => void;
  disabled?: boolean;
};

/** "312 pueden recibirlo hoy · 8 no lo reciben", for one source. */
function sourceCountLine(source: ComunicadoAudienceSourcePreview | undefined) {
  if (!source) return null;
  if (source.problem) return null;
  const line =
    source.count.eligible === 1
      ? "1 puede recibirlo hoy"
      : `${formatAudienceCount(source.count.eligible)} pueden recibirlo hoy`;
  return source.count.skipped > 0
    ? `${line} · ${skippedCountText(source.count.skipped)}`
    : line;
}

/**
 * "Destinatarios" (docs/IMPLEMENTATION-comunicados.md G4, B4): the lists and
 * the people picked by name, each with who can receive it today, and the
 * live summary of everyone together, each person counted once.
 */
export default function RecipientsCard({
  audience,
  names,
  festivals,
  lists,
  preview,
  previewStale,
  previewError,
  onRetryPreview,
  env,
  onAddFestival,
  onAddList,
  onAddPerson,
  onRemove,
  disabled = false,
}: RecipientsCardProps) {
  const [skippedOpen, setSkippedOpen] = useState(false);
  const sourceCount = audience.festivals.length + audience.lists.length;
  const sourcesFull =
    sourceCount >= COMUNICADO_MAX_SOURCES
      ? `Elegí hasta ${COMUNICADO_MAX_SOURCES} listas entre festivales y guardadas.`
      : null;
  const peopleFull =
    audience.people.length >= COMUNICADO_MAX_PEOPLE
      ? `Elegí hasta ${COMUNICADO_MAX_PEOPLE} personas por nombre.`
      : null;
  const empty = isEmptyComunicadoAudience(audience);
  const sourcePreview = (
    kind: "festival" | "list" | "people",
    id: number | null,
  ) =>
    preview?.sources.find(
      (source) =>
        source.kind === kind && (kind === "people" || source.id === id),
    );
  const peopleSource = sourcePreview("people", null);
  // No count is coming while the error shows: no row waits for one.
  const loading = !preview && !previewError;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Destinatarios</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <ListSourcePicker
            festivals={festivals}
            lists={lists}
            chosen={audience}
            fullReason={sourcesFull}
            onPickFestival={onAddFestival}
            onPickList={onAddList}
            disabled={disabled}
          />
          <PersonPicker
            chosenIds={audience.people}
            fullReason={peopleFull}
            onPick={onAddPerson}
            disabled={disabled}
          />
        </div>

        {empty ? (
          <p className="text-sm text-muted-foreground">
            Todavía no elegiste destinatarios.
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Destinatarios elegidos">
            {audience.festivals.map((festivalId) => {
              const source = sourcePreview("festival", festivalId);
              const name = names.festivals[festivalId];
              const label = name
                ? confirmadosListName(name)
                : (source?.label ?? `Festival #${festivalId}`);
              return (
                <SourceRow
                  key={`festival-${festivalId}`}
                  label={label}
                  detail={sourceCountLine(source)}
                  problem={source?.problem ?? null}
                  loading={loading}
                  onRemove={() => onRemove("festival", festivalId)}
                  disabled={disabled}
                />
              );
            })}
            {audience.lists.map((listId) => {
              const source = sourcePreview("list", listId);
              const list = names.lists[listId];
              return (
                <SourceRow
                  key={`list-${listId}`}
                  icon={list ? <ListKindIcon kind={list.kind} /> : undefined}
                  label={list?.name ?? source?.label ?? `Lista #${listId}`}
                  tag={list?.archived ? "Archivada" : undefined}
                  detail={sourceCountLine(source)}
                  problem={source?.problem ?? null}
                  loading={loading}
                  onRemove={() => onRemove("list", listId)}
                  disabled={disabled}
                />
              );
            })}
            {audience.people.length > 0 && (
              <li className="rounded-lg border px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <UserIcon
                      className="h-4 w-4 text-muted-foreground"
                      aria-hidden
                    />
                    Por nombre
                  </span>
                  <SourceDetail
                    detail={sourceCountLine(peopleSource)}
                    loading={loading}
                  />
                </div>
                <ul
                  className="mt-2 flex flex-wrap gap-2"
                  aria-label="Personas elegidas por nombre"
                >
                  {audience.people.map((personId) => {
                    const person = names.people[personId];
                    const name = person?.name ?? `Persona #${personId}`;
                    return (
                      <li
                        key={personId}
                        className="flex max-w-full items-center gap-1.5 rounded-full border bg-background py-1 pl-3 pr-1 text-sm"
                      >
                        <span className="truncate">{name}</span>
                        {person?.isAdmin && (
                          <Badge variant="secondary" size="sm">
                            Administración
                          </Badge>
                        )}
                        {!person && (
                          <Badge variant="amber" size="sm">
                            Ya no existe
                          </Badge>
                        )}
                        {person?.skipReason && (
                          <Badge variant="amber" size="sm">
                            {person.skipReason}
                          </Badge>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-full"
                          disabled={disabled}
                          onClick={() => onRemove("person", personId)}
                          aria-label={`Quitar a ${name}`}
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            )}
          </ul>
        )}

        {!empty && (
          <AudienceSummary
            preview={preview}
            stale={previewStale}
            error={previewError}
            onRetry={onRetryPreview}
            env={env}
            hasPeople={audience.people.length > 0}
            onShowSkipped={() => setSkippedOpen(true)}
          />
        )}

        {preview && !empty && (
          <SkippedDialog
            open={skippedOpen}
            onOpenChange={setSkippedOpen}
            audience={audience}
            preview={preview}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SourceDetail({
  detail,
  loading,
}: {
  detail: string | null;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-4 w-36" />;
  if (!detail) return null;
  return (
    <span className="text-xs tabular-nums text-muted-foreground">{detail}</span>
  );
}

function SourceRow({
  icon,
  label,
  tag,
  detail,
  problem,
  loading,
  onRemove,
  disabled,
}: {
  icon?: ReactNode;
  label: string;
  tag?: string;
  detail: string | null;
  problem: string | null;
  loading: boolean;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <li className="flex items-start gap-2 rounded-lg border py-2 pl-3 pr-1">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {icon}
          <span className="min-w-0 truncate text-sm font-medium">{label}</span>
          {tag && (
            <Badge variant="dark" size="sm">
              {tag}
            </Badge>
          )}
        </div>
        {problem ? (
          <p className="text-xs text-amber-800 dark:text-amber-300">
            {problem}
          </p>
        ) : (
          <SourceDetail detail={detail} loading={loading} />
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-full"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Quitar ${label}`}
      >
        <XIcon className="h-4 w-4" />
      </Button>
    </li>
  );
}

/**
 * "**1.240 personas** · 85 están en más de una lista (cuentan una vez) · 14
 * no lo reciben [Ver por qué]".
 */
function AudienceSummary({
  preview,
  stale,
  error,
  onRetry,
  env,
  hasPeople,
  onShowSkipped,
}: {
  preview: ComunicadoAudiencePreview | null;
  stale: boolean;
  error: string | null;
  onRetry: () => void;
  env: ComposerEnv;
  hasPeople: boolean;
  onShowSkipped: () => void;
}) {
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm text-red-600 dark:text-red-400" role="status">
          {error}
        </p>
        <RetryButton onRetry={onRetry} />
      </div>
    );
  }
  if (!preview) {
    return (
      <div aria-busy="true">
        <Skeleton className="h-5 w-64" />
      </div>
    );
  }
  const skipped = realSkippedCount(preview);
  const whyButton = (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto px-0 py-0 text-sm"
      onClick={onShowSkipped}
    >
      Ver por qué
    </Button>
  );

  return (
    <div
      className={cn("space-y-2 transition-opacity", stale && "opacity-60")}
      aria-busy={stale}
    >
      <p className="text-sm" role="status">
        <strong className="font-semibold tabular-nums">
          {peopleCountText(preview.eligible)}
        </strong>
        {preview.overlap > 0 && (
          <span className="text-muted-foreground">
            {" "}
            · {overlapText(preview.overlap)}
          </span>
        )}
        {skipped > 0 && (
          <span className="text-muted-foreground">
            {" "}
            · {skippedCountText(skipped)}{" "}
          </span>
        )}
        {skipped > 0 && whyButton}
      </p>
      {preview.tooLarge && <Banner variant="warning">{TOO_LARGE_TEXT}</Banner>}
      {preview.narrowed && (
        <p className="text-xs text-muted-foreground">
          {narrowedNote(preview, env, hasPeople)}{" "}
          {skipped === 0 && preview.skippedTotal > 0 && whyButton}
        </p>
      )}
    </div>
  );
}
