import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import ComunicadoEditor from "@/app/components/comunicados/admin/edit/comunicado-editor";
import { requireCommunicationsAdmin } from "@/app/lib/communications/access";
import { fetchComunicadoForComposer } from "@/app/lib/comunicados/queries";
import { fetchComunicadoReport } from "@/app/lib/comunicados/report";
import { fetchComunicadoRevision } from "@/app/lib/comunicados/revisions";
import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";

export const metadata: Metadata = {
  title: "Editar comunicado · Comunicaciones",
};

const COMUNICADOS_PATH = "/dashboard/communications";

const idSchema = z.coerce.number().int().positive().max(MAX_SERIAL_ID);

/**
 * "Editar" on a sent comunicado (docs/IMPLEMENTATION-comunicados.md F1, G1,
 * G7), seeded from its current revision, with no autosave. Only a sent one
 * that is not retracted is edited here: a draft or a scheduled one goes to
 * its own page, as does a retracted one, which can no longer change (F3).
 */
export default async function EditComunicadoPage(props: {
  params: Promise<{ id: string }>;
}) {
  await requireCommunicationsAdmin();
  const parsed = idSchema.safeParse((await props.params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;
  const itemPath = `${COMUNICADOS_PATH}/${id}`;

  const report = await fetchComunicadoReport(id);
  if (!report) {
    // Not sent: its page is the composer, or its scheduled view.
    if (await fetchComunicadoForComposer(id)) redirect(itemPath);
    notFound();
  }
  if (report.retractedAt) redirect(itemPath);

  // The CHECKs keep every revision a sent comunicado points at.
  const revision = await fetchComunicadoRevision(id, report.currentRevision);
  if (!revision) notFound();

  return (
    <ComunicadoEditor
      comunicadoId={id}
      revision={report.currentRevision}
      title={revision.title}
      doc={revision.doc}
      actionLabel={revision.actionLabel}
      actionPath={revision.actionPath}
      essential={report.essential}
      essentialFestivalName={report.summary?.essentialFestival?.name ?? null}
      sendEmail={report.sendEmail}
      sendPush={report.sendPush}
      sending={report.campaignStatus === "processing"}
      counts={report.retractCounts}
    />
  );
}
