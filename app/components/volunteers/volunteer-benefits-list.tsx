/**
 * Placeholder "Qué recibes". Promise nothing beyond this list (no t-shirts,
 * no workshop priority).
 */
const BENEFITS = [
  "Credencial y lanyard del equipo Glitter",
  "Kit de pines y stickers",
  "Certificado de participación con tus horas de voluntariado",
  "Refrigerio en cada turno",
  "Ser parte del equipo que hace posible Glitter",
] as const;

export default function VolunteerBenefitsList() {
  return (
    <section className="grid gap-4">
      <h2 className="text-2xl font-semibold">Qué recibes</h2>
      <ul className="grid list-disc gap-2 pl-5">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="break-words">
            {benefit}
          </li>
        ))}
      </ul>
    </section>
  );
}
