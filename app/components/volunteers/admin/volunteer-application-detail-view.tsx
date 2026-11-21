import { DateTime } from "luxon";
import type { ReactNode } from "react";

import BrandIcon from "@/app/components/brand-icon";
import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";
import { Badge } from "@/app/components/ui/badge";
import { buttonVariants } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/app/components/ui/card";
import VolunteerApplicationAnswers from "@/app/components/volunteers/admin/volunteer-application-answers";
import VolunteerApplicationContact from "@/app/components/volunteers/admin/volunteer-application-contact";
import VolunteerReviewForm from "@/app/components/volunteers/admin/volunteer-review-form";
import VolunteerStatusBadge from "@/app/components/volunteers/admin/volunteer-status-badge";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { cn } from "@/app/lib/utils";
import {
  VOLUNTEER_ADMIN_COPY,
  VOLUNTEER_REFERRAL_ADMIN_LABELS,
  ageOn,
  whatsappHref,
  type VolunteerAdminRole,
  type VolunteerApplicationDetail,
  type VolunteerShiftCoverage,
} from "@/app/lib/volunteers/admin-definitions";
import { formatYears } from "@/app/lib/volunteers/format";

/** "21 nov", La Paz's calendar. */
export function formatAppliedOn(date: Date) {
  return DateTime.fromJSDate(date, { zone: STORE_TIMEZONE })
    .setLocale("es")
    .toFormat("d LLL")
    .replace(".", "");
}

/** "22 años · Zona Sopocachi · Se enteró por Instagram", skipping blanks. */
export function volunteerDetailMeta(
  application: Pick<
    VolunteerApplicationDetail,
    "birthdate" | "zone" | "referralSource"
  >,
  today: Date = new Date(),
) {
  const age = ageOn(application.birthdate, today);
  const referral =
    VOLUNTEER_REFERRAL_ADMIN_LABELS[application.referralSource] ??
    application.referralSource;
  return [
    Number.isFinite(age) ? formatYears(age) : null,
    application.zone ? `Zona ${application.zone}` : null,
    referral ? `Se enteró por ${referral}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function DetailCard({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card role="region" aria-labelledby={id} className="min-w-0">
      <CardHeader className="p-4 pb-3 md:p-6 md:pb-4">
        <h2 id={id} className="text-lg leading-tight font-semibold">
          {title}
        </h2>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="p-4 pt-0 md:p-6 md:pt-0">{children}</CardContent>
    </Card>
  );
}

/**
 * /dashboard/festivals/[id]/volunteers/[applicationId], from plain data: the
 * applicant's header, "Contacto" and "Lo que eligió" on the main column, and
 * "Decisión y asignación" on the side (below them on phones and tablets).
 */
export default function VolunteerApplicationDetailView({
  festivalId,
  festivalName,
  application,
  roles,
  shifts,
  today,
}: {
  festivalId: number;
  /** Names the festival's crumb in the trail. */
  festivalName: string;
  application: VolunteerApplicationDetail;
  roles: VolunteerAdminRole[];
  shifts: VolunteerShiftCoverage[];
  /** "Now", for the ages; stories pin it. */
  today?: Date;
}) {
  const whatsapp = whatsappHref(application.phone);
  const meta = volunteerDetailMeta(application, today);

  return (
    <div className="container flex min-w-0 flex-col gap-4 p-3 pb-10 md:p-6">
      <PageBreadcrumbs
        labels={{ [`/dashboard/festivals/${festivalId}`]: festivalName }}
      />

      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div className="flex min-w-0 flex-col gap-2 md:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <VolunteerStatusBadge status={application.status} />
            <Badge variant="outline">
              Postuló el {formatAppliedOn(application.createdAt)}
            </Badge>
          </div>
          <h1
            className="min-w-0 text-2xl font-bold break-words wrap-anywhere md:text-3xl"
            data-installed-title=""
          >
            {application.fullName}
          </h1>
          {meta && <p className="break-words text-muted-foreground">{meta}</p>}
        </div>
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", wrap: true }),
              "min-h-11 gap-2 md:min-h-10",
            )}
          >
            <BrandIcon brand="whatsapp" />
            Escribir por WhatsApp
          </a>
        )}
      </div>

      <div className="grid min-w-0 items-start gap-4 md:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4 md:gap-6">
          <DetailCard id="volunteer-contact-title" title="Contacto">
            <VolunteerApplicationContact
              application={application}
              today={today}
            />
          </DetailCard>
          <DetailCard id="volunteer-choices-title" title="Lo que eligió">
            <VolunteerApplicationAnswers
              application={application}
              roles={roles}
              shifts={shifts}
            />
          </DetailCard>
        </div>
        <div className="min-w-0">
          <DetailCard
            id="volunteer-review-card-title"
            title="Decisión y asignación"
            description={VOLUNTEER_ADMIN_COPY.noAutomaticNotice}
          >
            <VolunteerReviewForm
              key={application.updatedAt.getTime()}
              festivalId={festivalId}
              application={application}
              roles={roles}
              shifts={shifts}
            />
          </DetailCard>
        </div>
      </div>
    </div>
  );
}
