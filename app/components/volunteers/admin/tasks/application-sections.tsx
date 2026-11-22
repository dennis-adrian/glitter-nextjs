import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/app/components/ui/badge";
import { buttonVariants } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import { cn } from "@/app/lib/utils";
import {
  VOLUNTEER_ADMIN_COPY,
  VOLUNTEER_EXPERIENCE_ADMIN_LABELS,
  VOLUNTEER_REFERRAL_ADMIN_LABELS,
  type VolunteerApplicationDetail,
} from "@/app/lib/volunteers/admin-definitions";
import type {
  VolunteerTaskCall,
  VolunteerTaskShift,
} from "@/app/lib/volunteers/admin-task-queries";
import {
  coverageBadge,
  formatShiftWeekdayStart,
  plural,
} from "@/app/lib/volunteers/admin-tasks";
import type { VolunteerExperience } from "@/app/lib/volunteers/definitions";
import {
  compareShiftsByStart,
  formatShiftWhenShort,
} from "@/app/lib/volunteers/format";
import { isHttpUrl } from "@/app/lib/volunteers/schema";

/**
 * The pieces every application screen of the admin by task is made of, in
 * the mockups' wording: a titled card per section, the coverage badge, and
 * the sections themselves. Server-safe.
 */

export function SectionHeading({
  id,
  children,
  as: Tag = "h2",
}: {
  id: string;
  children: ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <Tag id={id} className="text-lg leading-7 font-semibold">
      {children}
    </Tag>
  );
}

/** A titled card on phones; a plain section inside the desktop card. */
export function SectionCard({
  id,
  title,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      role="region"
      aria-labelledby={id}
      className={cn("flex min-w-0 flex-col gap-2.5 p-4", className)}
    >
      {action ? (
        <div className="flex min-w-0 items-center justify-between gap-2">
          <SectionHeading id={id}>{title}</SectionHeading>
          {action}
        </div>
      ) : (
        <SectionHeading id={id}>{title}</SectionHeading>
      )}
      {children}
    </Card>
  );
}

export function CoverageBadge({
  shift,
  className,
}: {
  shift: VolunteerTaskShift;
  className?: string;
}) {
  const badge = coverageBadge(shift);
  return (
    <Badge variant={badge.variant} className={cn("shrink-0", className)}>
      {badge.label}
    </Badge>
  );
}

/** "Edad 22 años" and "Fotos y videos Autorizó su imagen" tiles. */
export function AgeAndConsentTiles({
  age,
  imageConsent,
}: {
  age: string | null;
  imageConsent: boolean;
}) {
  const tile = "min-w-0 flex-1 basis-36 rounded-md border bg-card px-3 py-2";
  return (
    <dl className="mt-3 flex flex-wrap gap-2">
      {age && (
        <div className={tile}>
          <dt className="text-muted-foreground">Edad</dt>
          <dd className="text-base leading-6 font-semibold">{age}</dd>
        </div>
      )}
      <div className={tile}>
        <dt className="text-muted-foreground">Fotos y videos</dt>
        <dd className="text-base leading-6 font-semibold">
          {imageConsent ? "Autorizó su imagen" : "No autorizó su imagen"}
        </dd>
      </div>
    </dl>
  );
}

export function MotivationText({ text }: { text: string }) {
  return (
    <p className="text-base leading-6 break-words whitespace-pre-line">
      {text}
    </p>
  );
}

/** The checkboxes as a plain list, then "Otra experiencia" and the portfolio. */
export function ExperienceContent({
  application,
}: {
  application: Pick<
    VolunteerApplicationDetail,
    "experience" | "experienceNotes" | "portfolio"
  >;
}) {
  const items = application.experience.map(
    (key) =>
      VOLUNTEER_EXPERIENCE_ADMIN_LABELS[key as VolunteerExperience] ?? key,
  );
  const { portfolio, experienceNotes } = application;
  return (
    <>
      {items.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {experienceNotes && (
        <p className="break-words whitespace-pre-line wrap-anywhere">
          <span className="text-muted-foreground">Otra experiencia:</span>{" "}
          {experienceNotes}
        </p>
      )}
      {portfolio &&
        (isHttpUrl(portfolio) ? (
          <a
            href={portfolio}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 self-start font-semibold text-primary"
          >
            Abrir portafolio o CV
            <ExternalLinkIcon aria-hidden="true" className="size-4 shrink-0" />
          </a>
        ) : (
          <p className="break-words wrap-anywhere">
            <span className="text-muted-foreground">
              {VOLUNTEER_ADMIN_COPY.portfolioLabel}:
            </span>{" "}
            {portfolio}
          </p>
        ))}
      {items.length === 0 && !experienceNotes && !portfolio && (
        <p className="text-muted-foreground">No marcó ninguna.</p>
      )}
    </>
  );
}

/** "1ª Fotografía y redes sociales", with how many accepted already have it. */
export function RoleChoices({
  application,
  roles,
  withCounts = true,
}: {
  application: Pick<
    VolunteerApplicationDetail,
    "firstChoiceRoleId" | "secondChoiceRoleId"
  >;
  roles: VolunteerTaskCall["roles"];
  withCounts?: boolean;
}) {
  const choices = [
    { rank: "1ª", id: application.firstChoiceRoleId },
    { rank: "2ª", id: application.secondChoiceRoleId },
  ].map((choice) => ({
    ...choice,
    role: roles.find((role) => role.id === choice.id),
  }));
  return (
    <ol className="flex flex-col gap-2.5">
      {choices.map(({ rank, id, role }) => (
        <li key={id} className="min-w-0 break-words">
          <strong className="font-semibold">
            {rank} {role?.name ?? "Rol eliminado"}
          </strong>
          {withCounts && role && (
            <>
              <br />
              <span className="text-muted-foreground">
                {role.acceptedCount === 1
                  ? "1 persona aceptada ya tiene este rol"
                  : `${role.acceptedCount} personas aceptadas ya tienen este rol`}
              </span>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

/** The active shifts, and the ones `ids` marks among them, by start. */
export function markedShifts(
  ids: readonly number[],
  shifts: readonly VolunteerTaskShift[],
) {
  const chosen = new Set(ids);
  const active = shifts.filter((shift) => shift.isActive);
  const marked = shifts
    .filter((shift) => chosen.has(shift.id))
    .sort(compareShiftsByStart);
  const notMarked = active
    .filter((shift) => !chosen.has(shift.id))
    .sort(compareShiftsByStart);
  return {
    marked,
    notMarked,
    activeTotal: active.length,
    activeMarked: marked.filter((shift) => shift.isActive).length,
  };
}

export function editAvailabilityLink(href: string) {
  return (
    <Link
      href={href}
      className={buttonVariants({
        variant: "outline",
        size: "sm",
        className: "shrink-0",
      })}
    >
      Editar
    </Link>
  );
}

/**
 * "Turnos que puede": each marked shift with its coverage, then the ones
 * not marked. `layout="grid"` lays them out in tiles (desktop).
 */
export function AvailableShiftsContent({
  ids,
  shifts,
  layout = "list",
}: {
  ids: readonly number[];
  shifts: readonly VolunteerTaskShift[];
  layout?: "list" | "grid";
}) {
  const { marked, notMarked } = markedShifts(ids, shifts);
  return (
    <>
      {marked.length === 0 ? (
        <p className="text-muted-foreground">No marcó ninguno.</p>
      ) : (
        <ul
          className={cn(
            layout === "grid"
              ? "grid grid-cols-[repeat(auto-fit,minmax(min(13.75rem,100%),1fr))] gap-2"
              : "flex flex-col gap-2.5",
          )}
        >
          {marked.map((shift) => (
            <li
              key={shift.id}
              className={cn(
                "flex min-w-0 items-start justify-between gap-2",
                layout === "grid" &&
                  "flex-col items-start rounded-md border px-3 py-2.5",
              )}
            >
              <span className="min-w-0 break-words">
                <strong className="font-semibold">
                  {formatShiftWhenShort(shift)}
                </strong>
                <br />
                <span className="text-muted-foreground">{shift.label}</span>
              </span>
              <CoverageBadge shift={shift} />
            </li>
          ))}
        </ul>
      )}
      {notMarked.length > 0 && (
        <p className="break-words text-muted-foreground">
          No marcó: {notMarked.map(formatShiftWeekdayStart).join(", ")}.
        </p>
      )}
    </>
  );
}

export function availableShiftsTitle(
  ids: readonly number[],
  shifts: readonly VolunteerTaskShift[],
) {
  const { activeMarked, activeTotal } = markedShifts(ids, shifts);
  return `Turnos que puede (${activeMarked} de ${activeTotal})`;
}

/** "Celular / WhatsApp", "Correo"… as a grid of label and value. */
export function ContactList({
  application,
  birthdate,
  fields = ["phone", "email", "birthdate", "emergency", "referral"],
}: {
  application: Pick<
    VolunteerApplicationDetail,
    | "phone"
    | "email"
    | "emergencyContactName"
    | "emergencyContactPhone"
    | "referralSource"
    | "imageConsent"
  >;
  /** "dd/mm/aaaa" */
  birthdate: string;
  fields?: (
    | "phone"
    | "email"
    | "birthdate"
    | "emergency"
    | "referral"
    | "image"
  )[];
}) {
  const rows: Record<(typeof fields)[number], [string, ReactNode]> = {
    phone: ["Celular / WhatsApp", application.phone],
    email: ["Correo", application.email],
    birthdate: ["Fecha de nacimiento", birthdate],
    emergency: [
      "Contacto de emergencia",
      `${application.emergencyContactName} · ${application.emergencyContactPhone}`,
    ],
    referral: [
      "Cómo se enteró",
      VOLUNTEER_REFERRAL_ADMIN_LABELS[application.referralSource] ??
        application.referralSource,
    ],
    image: [
      VOLUNTEER_ADMIN_COPY.imageConsentLabel,
      <Badge
        key="image"
        variant={application.imageConsent ? "green" : "outline"}
        className="mt-1"
      >
        {application.imageConsent
          ? VOLUNTEER_ADMIN_COPY.imageConsentYes
          : VOLUNTEER_ADMIN_COPY.imageConsentNo}
      </Badge>,
    ],
  };
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(13.75rem,100%),1fr))] gap-x-6 gap-y-2.5">
      {fields.map((field) => {
        const [label, value] = rows[field];
        return (
          <div key={field} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold break-words wrap-anywhere">{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** "3 lugares" and "12 personas aceptadas" in bold, as the strips show them. */
export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold">{children}</strong>;
}

export { plural };
