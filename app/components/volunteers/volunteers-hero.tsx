/**
 * Placeholder hero for /voluntarios. Expected to be replaced by the mockup
 * components; it only takes plain strings.
 */
export default function VolunteersHero({
  festivalName,
  datesLabel,
  venueLabel,
}: {
  festivalName: string;
  /** "19 y 20 de diciembre de 2026"; null when the festival has no dates. */
  datesLabel: string | null;
  venueLabel: string | null;
}) {
  return (
    <section className="grid gap-3">
      <h1 className="text-3xl font-bold break-words md:text-4xl">
        Sé voluntario/a en Glitter
      </h1>
      <p className="text-lg text-muted-foreground break-words">
        {[festivalName, datesLabel, venueLabel].filter(Boolean).join(" · ")}
      </p>
      <p className="break-words">
        Glitter es un festival de ilustración y creatividad hecho por mucha
        gente con ganas. Buscamos voluntarios y voluntarias que quieran vivirlo
        desde adentro: recibir al público, acompañar a los expositores, armar el
        espacio y contar lo que pasa en redes. Si te gusta el ambiente de
        festival y quieres sumarte al equipo, postúlate.
      </p>
    </section>
  );
}
