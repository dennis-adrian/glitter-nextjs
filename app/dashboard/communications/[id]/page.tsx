import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import ComunicadoComposer from "@/app/components/comunicados/admin/composer/composer";
import type {
  ComposerDraft,
  ComposerSourceNames,
} from "@/app/components/comunicados/admin/composer/types";
import ComunicadoReport from "@/app/components/comunicados/admin/report/comunicado-report";
import ScheduledComunicado, {
  type ScheduledComunicadoData,
} from "@/app/components/comunicados/admin/scheduled/scheduled-comunicado";
import { requireCommunicationsAdmin } from "@/app/lib/communications/access";
import {
  comunicadoAudienceLabel,
  type ComposerComunicado,
  fetchComunicadoCopySourceTitle,
  fetchComunicadoForComposer,
} from "@/app/lib/comunicados/queries";
import {
  fetchComunicadoRecipients,
  fetchComunicadoReport,
} from "@/app/lib/comunicados/report";
import { parseRecipientFilter } from "@/app/lib/comunicados/report-labels";
import { isScheduleOverdue } from "@/app/lib/comunicados/schedule-rules";
import {
  fetchFestivalLists,
  fetchSavedLists,
} from "@/app/lib/distribution_lists/queries";
import { isFeatureLaunched } from "@/app/lib/feature_flags/helpers";
import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";
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
 * A scheduled one as its page shows it (D4). Dates travel as ISO strings to
 * the client. The festival an essential email names is the audience's one
 * festival: B7 allows nothing else, and scheduling checked it.
 */
function scheduledOf(comunicado: ComposerComunicado): ScheduledComunicadoData {
  return {
    id: comunicado.id,
    version: comunicado.version,
    title: comunicado.title,
    doc: comunicado.doc,
    actionLabel: comunicado.actionLabel,
    actionPath: comunicado.actionPath,
    sendEmail: comunicado.sendEmail,
    sendPush: comunicado.sendPush,
    essential: comunicado.essential,
    essentialReason: comunicado.essentialReason,
    essentialFestivalName:
      comunicado.essential && comunicado.sendEmail
        ? (comunicado.sources.festivals[0]?.name ?? null)
        : null,
    scheduledAt: comunicado.scheduledAt!.toISOString(),
    scheduledByName: comunicado.scheduledByName,
  };
}

/** "Para: Confirmados · Glitter Navidad 2026 y 3 personas", as the list says it. */
function audienceLabelOf(comunicado: ComposerComunicado) {
  return comunicadoAudienceLabel(comunicado.audience, {
    festivals: new Map(
      comunicado.sources.festivals.map((festival) => [
        festival.id,
        festival.name,
      ]),
    ),
    lists: new Map(
      comunicado.sources.lists.map((list) => [list.id, list.name]),
    ),
  });
}

/**
 * One comunicado (docs/IMPLEMENTATION-comunicados.md G1, G4, G6). A draft
 * opens the composer, a scheduled one its read-only page (E1, E6) and a sent
 * one its report. "Duplicar" opens its copy with `?copia={sourceId}`, which
 * the composer names in a banner (D5).
 */
export default async function ComunicadoPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    filter?: string | string[];
    q?: string | string[];
    page?: string | string[];
    copia?: string | string[];
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

  if (comunicado.status === "scheduled") {
    return (
      <ScheduledComunicado
        // A change of date brings a new version: the dialogs start over.
        key={`${comunicado.id}:${comunicado.version}`}
        comunicado={scheduledOf(comunicado)}
        audienceLabel={audienceLabelOf(comunicado)}
        overdue={isScheduleOverdue(comunicado.scheduledAt!, new Date())}
        env={serverEnv.VERCEL_ENV}
      />
    );
  }

  const copia = idSchema.safeParse((await props.searchParams).copia);
  const [festivals, lists, notificationsLaunched, pushLaunched, copiedFrom] =
    await Promise.all([
      fetchFestivalLists(),
      fetchSavedLists(),
      isFeatureLaunched("notifications"),
      isFeatureLaunched("push_notifications"),
      copia.success ? fetchComunicadoCopySourceTitle(copia.data) : null,
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
        copiedFromTitle={copiedFrom}
      />
    </div>
  );
}
