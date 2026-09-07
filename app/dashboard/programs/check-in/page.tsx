import type { Metadata } from "next";
import { redirect } from "next/navigation";

import CheckInAgendaSection from "@/app/components/dashboard/programs/checkin/checkin-agenda-section";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import {
  CHECK_IN_AGENDA_DAYS,
  resolveCheckInAgendaWindow,
  startsToday,
} from "@/app/lib/programs/checkin";
import { fetchCheckInAgenda } from "@/app/lib/programs/occurrence-queries";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

export const metadata: Metadata = {
  title: "Registrar ingresos",
};

/**
 * The door's landing page: pick a session, start scanning.
 *
 * Exists because the scanner is per-occurrence and was otherwise four clicks
 * deep behind program → session → occurrence — desk-shaped navigation for a
 * tool used standing at a door with a phone in one hand. This is the single
 * URL an operator can be given.
 */
export default async function CheckInAgendaPage() {
  await requireFeatureEnabled("paid_programs");

  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  // Pinned once so the window and the roster counts describe the same instant.
  const now = new Date();
  const window = resolveCheckInAgendaWindow(now, STORE_TIMEZONE);
  const entries = await fetchCheckInAgenda(window, { now });

  const today = entries.filter((entry) => startsToday(entry.startsAt, window));
  const upcoming = entries.filter(
    (entry) => !startsToday(entry.startsAt, window),
  );

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-3 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Registrar ingresos</h1>
        <p className="text-sm text-muted-foreground">
          Elige el horario y escanea las entradas en la puerta.
        </p>
      </header>

      <CheckInAgendaSection
        title="Hoy"
        entries={today}
        // Always rendered, unlike the upcoming group: an empty "Hoy" is the
        // answer to the question the operator came with.
        emptyMessage="No hay sesiones programadas para hoy."
        showDate={false}
      />

      <CheckInAgendaSection
        title={`Próximos ${CHECK_IN_AGENDA_DAYS} días`}
        entries={upcoming}
        showDate
      />
    </div>
  );
}
