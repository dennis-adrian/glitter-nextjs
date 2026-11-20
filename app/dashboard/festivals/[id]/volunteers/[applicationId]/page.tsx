import { ArrowLeftIcon } from "lucide-react";
import { DateTime } from "luxon";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import VolunteerAdminTabs from "@/app/components/volunteers/admin/volunteer-admin-tabs";
import VolunteerApplicationAnswers from "@/app/components/volunteers/admin/volunteer-application-answers";
import VolunteerApplicationAssignmentForm from "@/app/components/volunteers/admin/volunteer-application-assignment-form";
import VolunteerApplicationContact from "@/app/components/volunteers/admin/volunteer-application-contact";
import VolunteerApplicationNotesForm from "@/app/components/volunteers/admin/volunteer-application-notes-form";
import VolunteerApplicationStatusActions from "@/app/components/volunteers/admin/volunteer-application-status-actions";
import VolunteerStatusBadge from "@/app/components/volunteers/admin/volunteer-status-badge";
import { formatDisplayDate } from "@/app/lib/formatters";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { volunteerAdminPath } from "@/app/lib/volunteers/admin-definitions";
import {
  fetchVolunteerAdminCall,
  fetchVolunteerApplicationDetail,
} from "@/app/lib/volunteers/admin-queries";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  applicationId: z.coerce.number().int().positive(),
});

export const metadata: Metadata = { title: "Postulación" };

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col gap-3 rounded-md border p-4 ${className ?? ""}`}
    >
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * One volunteer application: how to reach the applicant, what they answered,
 * and the team's decision, assignment and notes.
 */
export default async function VolunteerApplicationPage(props: {
  params: Promise<{ id: string; applicationId: string }>;
}) {
  if (!(await requireAdminOrFestivalAdmin())) redirect("/");

  const parsed = ParamsSchema.safeParse(await props.params);
  if (!parsed.success) notFound();
  const { id: festivalId, applicationId } = parsed.data;

  const [call, application] = await Promise.all([
    fetchVolunteerAdminCall(festivalId),
    fetchVolunteerApplicationDetail(festivalId, applicationId),
  ]);
  if (!call || !application) notFound();

  const assignmentKey = [
    application.status,
    application.assignedRoleId ?? "",
    ...application.assignedShiftIds,
  ].join(":");

  return (
    <div className="container flex min-w-0 flex-col gap-4 p-3 pb-10 md:gap-6 md:p-6">
      <div className="flex min-w-0 flex-col gap-3">
        <Link
          href={volunteerAdminPath(festivalId)}
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:underline"
        >
          <ArrowLeftIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
          Volver a las postulaciones
        </Link>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1
              className="min-w-0 text-2xl font-bold break-words"
              data-installed-title=""
            >
              {application.fullName}
            </h1>
            <VolunteerStatusBadge status={application.status} />
          </div>
          <p className="text-sm break-words text-muted-foreground">
            {call.festival.name} · Postuló el{" "}
            {formatDisplayDate(application.createdAt, DateTime.DATETIME_MED)}
          </p>
          {application.reviewedBy && application.reviewedAt && (
            <p className="text-sm break-words text-muted-foreground">
              Última revisión: {application.reviewedBy.displayName},{" "}
              {formatDisplayDate(application.reviewedAt, DateTime.DATETIME_MED)}
            </p>
          )}
        </div>
        <VolunteerAdminTabs festivalId={festivalId} />
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Section title="Estado">
          <VolunteerApplicationStatusActions
            festivalId={festivalId}
            applicationId={application.id}
            status={application.status}
          />
        </Section>
        <Section title="Contacto">
          <VolunteerApplicationContact application={application} />
        </Section>
        <Section title="Asignación">
          <VolunteerApplicationAssignmentForm
            key={assignmentKey}
            festivalId={festivalId}
            application={application}
            roles={call.roles}
            shifts={call.shifts}
          />
        </Section>
        <Section title="Respuestas">
          <VolunteerApplicationAnswers
            application={application}
            roles={call.roles}
            shifts={call.shifts}
          />
        </Section>
        <Section title="Notas" className="lg:col-span-2">
          <VolunteerApplicationNotesForm
            key={application.adminNotes ?? ""}
            festivalId={festivalId}
            applicationId={application.id}
            adminNotes={application.adminNotes}
          />
        </Section>
      </div>
    </div>
  );
}
