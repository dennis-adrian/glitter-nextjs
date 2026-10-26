import { ArrowLeftIcon } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import ComunicadoComposer from "@/app/components/comunicados/admin/composer/composer";
import type {
  ComposerDraft,
  ComposerSourceNames,
} from "@/app/components/comunicados/admin/composer/types";
import ComunicadoReport from "@/app/components/comunicados/admin/report/comunicado-report";
import { Badge } from "@/app/components/ui/badge";
import { Banner } from "@/app/components/ui/banner";
import { buttonVariants } from "@/app/components/ui/button";
import { requireCommunicationsAdmin } from "@/app/lib/communications/access";
import {
  COMUNICADO_STATUS_LABELS,
  COMUNICADO_UNTITLED,
} from "@/app/lib/comunicados/definitions";
import {
  type ComposerComunicado,
  fetchComunicadoForComposer,
} from "@/app/lib/comunicados/queries";
import {
  fetchComunicadoRecipients,
  fetchComunicadoReport,
} from "@/app/lib/comunicados/report";
import { parseRecipientFilter } from "@/app/lib/comunicados/report-labels";
import {
  fetchFestivalLists,
  fetchSavedLists,
} from "@/app/lib/distribution_lists/queries";
import { isFeatureLaunched } from "@/app/lib/feature_flags/helpers";
import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";
import { cn } from "@/app/lib/utils";
import { serverEnv } from "@/env";

export const metadata: Metadata = {
  title: "Comunicado · Comunicaciones",
};

const COMUNICADOS_PATH = "/dashboard/communications";

const idSchema = z.coerce.number().int().positive().max(MAX_SERIAL_ID);
const pageSchema = z.coerce.number().int().positive().catch(1);
const querySchema = z.string().catch("");

function draftOf(comunicado: ComposerComunicado): ComposerDraft {
  return {
    id: comunicado.id,
    version: comunicado.version,
    title: comunicado.title,
    doc: comunicado.doc,
    actionLabel: comunicado.actionLabel,
    actionPath: comunicado.actionPath,
    sendEmail: comunicado.sendEmail,
    sendPush: comunicado.sendPush,
    audience: comunicado.audience,
    audienceUnreadable: comunicado.audienceUnreadable,
    essential: comunicado.essential,
    essentialReason: comunicado.essentialReason,
    scheduleMissed: comunicado.scheduleMissedAt !== null,
    scheduleMissedDetail: comunicado.scheduleMissedDetail,
  };
}

/**
 * One comunicado (docs/IMPLEMENTATION-comunicados.md G1, G4, G6). A draft
 * opens the composer and a sent one its report; a scheduled one gets its
 * own page in the next release, so for now it only says what it is.
 */
export default async function ComunicadoPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    filter?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
}) {
  await requireCommunicationsAdmin();
  const parsed = idSchema.safeParse((await props.params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;

  // A sent comunicado never goes back, so its report is read first: the page
  // refreshes itself while it sends, and the composer's reads would be wasted.
  const report = await fetchComunicadoReport(id);
  if (report) {
    const searchParams = await props.searchParams;
    const filter = parseRecipientFilter(searchParams.filter);
    const query = querySchema.parse(searchParams.q);
    const recipients = await fetchComunicadoRecipients(id, {
      filter,
      query,
      page: pageSchema.parse(searchParams.page),
    });
    if (!recipients) notFound();
    return (
      <ComunicadoReport
        report={report}
        recipients={recipients}
        filter={filter}
        query={query}
        env={serverEnv.VERCEL_ENV}
      />
    );
  }

  const comunicado = await fetchComunicadoForComposer(id);
  // Discarding re-renders this route: back to the list, not a 404.
  if (!comunicado) redirect(COMUNICADOS_PATH);
  // Sent between the two reads: this same page now shows its report.
  if (comunicado.status === "sent") redirect(`${COMUNICADOS_PATH}/${id}`);

  if (comunicado.status !== "draft") {
    return (
      <div className="space-y-4 overflow-y-auto pb-6">
        <Link
          href={COMUNICADOS_PATH}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-3",
          )}
        >
          <ArrowLeftIcon className="mr-1 h-4 w-4" aria-hidden />
          Comunicados
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">
            {comunicado.title.trim() || COMUNICADO_UNTITLED}
          </h2>
          <Badge variant="outline">
            {COMUNICADO_STATUS_LABELS[comunicado.status]}
          </Badge>
        </div>
        <Banner variant="info">
          Este comunicado está programado, así que ya no se puede editar desde
          acá. Su página llega en la próxima versión.
        </Banner>
      </div>
    );
  }

  const [festivals, lists, notificationsLaunched, pushLaunched] =
    await Promise.all([
      fetchFestivalLists(),
      fetchSavedLists(),
      isFeatureLaunched("notifications"),
      isFeatureLaunched("push_notifications"),
    ]);

  // Names for the chips: every festival and saved list on offer, plus what
  // the draft already names (an archived list is no longer on offer).
  const names: ComposerSourceNames = {
    festivals: Object.fromEntries(
      festivals.map((festival) => [festival.festivalId, festival.festivalName]),
    ),
    lists: Object.fromEntries(
      lists.map((list) => [
        list.id,
        { name: list.name, kind: list.kind, archived: false },
      ]),
    ),
    people: {},
  };
  for (const festival of comunicado.sources.festivals) {
    names.festivals[festival.id] = festival.name;
  }
  for (const list of comunicado.sources.lists) {
    names.lists[list.id] = {
      name: list.name,
      kind: list.kind,
      archived: list.archived,
    };
  }
  for (const person of comunicado.sources.people) {
    names.people[person.id] = {
      id: person.id,
      name: person.name,
      email: person.email,
      imageUrl: person.imageUrl,
      isAdmin: person.role === "admin",
      skipReason: person.skipReason,
    };
  }

  return (
    <div className="overflow-y-auto pb-6">
      <ComunicadoComposer
        // A refresh that brings a newer stored version (a save that settled
        // after the composer was left) starts it over from what is stored.
        key={`${comunicado.id}:${comunicado.version}`}
        draft={draftOf(comunicado)}
        festivals={festivals.map((festival) => ({
          festivalId: festival.festivalId,
          name: festival.festivalName,
          count: festival.count,
        }))}
        lists={lists.map((list) => ({
          id: list.id,
          name: list.name,
          kind: list.kind,
          count: list.count,
        }))}
        names={names}
        notificationsLaunched={notificationsLaunched}
        pushLaunched={pushLaunched}
        env={serverEnv.VERCEL_ENV}
      />
    </div>
  );
}
