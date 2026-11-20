import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import VolunteerAdminTabs from "@/app/components/volunteers/admin/volunteer-admin-tabs";
import VolunteerCallSettingsForm from "@/app/components/volunteers/admin/volunteer-call-settings-form";
import VolunteerRoleList from "@/app/components/volunteers/admin/volunteer-role-list";
import VolunteerShiftList from "@/app/components/volunteers/admin/volunteer-shift-list";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { POSTGRES_INT_MAX } from "@/app/lib/volunteers/admin-definitions";
import { fetchVolunteerAdminCall } from "@/app/lib/volunteers/admin-queries";
import { VOLUNTEERS_PATH } from "@/app/lib/volunteers/definitions";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(POSTGRES_INT_MAX),
});

export const metadata: Metadata = { title: "Convocatoria de voluntarios" };

/**
 * The volunteer call's setup: when it closes and when the induction is, the
 * roles people choose from and the shifts they mark.
 */
export default async function VolunteerSetupPage(props: {
  params: Promise<{ id: string }>;
}) {
  if (!(await requireAdminOrFestivalAdmin())) redirect("/");

  const parsed = ParamsSchema.safeParse(await props.params);
  if (!parsed.success) notFound();
  const festivalId = parsed.data.id;

  const call = await fetchVolunteerAdminCall(festivalId);
  if (!call) notFound();

  return (
    <div className="container flex min-w-0 flex-col gap-4 p-3 pb-10 md:gap-6 md:p-6">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold" data-installed-title="">
            Voluntarios
          </h1>
          <p className="text-sm break-words text-muted-foreground">
            {call.festival.name}
          </p>
        </div>
        <VolunteerAdminTabs festivalId={festivalId} />
      </div>

      <div className="flex min-w-0 max-w-3xl flex-col gap-8">
        <SetupSection
          title="Fechas"
          description={
            call.settings ? (
              <>
                La convocatoria se publica en{" "}
                <Link
                  href={VOLUNTEERS_PATH}
                  className="text-primary underline underline-offset-2 wrap-anywhere"
                  target="_blank"
                >
                  {VOLUNTEERS_PATH}
                </Link>
                . Cuando cierra, el formulario deja de recibir postulaciones.
              </>
            ) : (
              <>
                Todavía no hay convocatoria para este festival. Indicá cuándo
                cierra para abrirla en{" "}
                <Link
                  href={VOLUNTEERS_PATH}
                  className="text-primary underline underline-offset-2 wrap-anywhere"
                  target="_blank"
                >
                  {VOLUNTEERS_PATH}
                </Link>
                .
              </>
            )
          }
        >
          <VolunteerCallSettingsForm
            festivalId={festivalId}
            settings={call.settings}
          />
        </SetupSection>

        <SetupSection
          title="Roles"
          description="Quien se postula elige una primera y una segunda opción. Un rol desactivado deja de aparecer en el formulario público, pero sigue en las postulaciones que ya lo eligieron."
        >
          <VolunteerRoleList festivalId={festivalId} roles={call.roles} />
        </SetupSection>

        <SetupSection
          title="Turnos"
          description="Asignados cuenta solo las postulaciones aceptadas; disponibles, las que marcaron el turno y no fueron rechazadas. Un turno desactivado deja de aparecer en el formulario público."
        >
          <VolunteerShiftList festivalId={festivalId} shifts={call.shifts} />
        </SetupSection>
      </div>
    </div>
  );
}

function SetupSection({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="min-w-0 space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm break-words text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}
