import { VOLUNTEER_MIN_AGE } from "@/app/lib/volunteers/definitions";

/** Placeholder requisitos; the induction date comes from the call settings. */
export default function VolunteerRequirements({
  inductionLabel,
}: {
  /** Formatted induction date, or "fecha por confirmar". */
  inductionLabel: string;
}) {
  return (
    <section className="grid gap-4">
      <h2 className="text-2xl font-semibold">Requisitos</h2>
      <ul className="grid list-disc gap-2 pl-5">
        <li>Ser mayor de {VOLUNTEER_MIN_AGE} años.</li>
        <li>Cumplir los turnos completos a los que te anotes.</li>
        <li className="break-words">
          Asistir a la inducción previa: {inductionLabel}.
        </li>
      </ul>
    </section>
  );
}
