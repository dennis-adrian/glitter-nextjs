import { SITE_CONTACT_EMAIL, SOCIAL_LINKS } from "@/app/lib/site-contact";

/** Placeholder FAQ. */
export default function VolunteerFaq() {
  const instagram = SOCIAL_LINKS.find((link) => link.network === "instagram");
  return (
    <section className="grid gap-4">
      <h2 className="text-2xl font-semibold">Preguntas frecuentes</h2>
      <dl className="grid gap-4">
        <div>
          <dt className="font-semibold">¿El voluntariado es pagado?</dt>
          <dd className="text-muted-foreground break-words">
            No. Es un voluntariado sin pago: a cambio recibes lo que contamos en
            “Qué recibes” y la experiencia de ser parte del festival.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">¿Cómo es la selección?</dt>
          <dd className="text-muted-foreground break-words">
            Revisamos todas las postulaciones y armamos los equipos según los
            turnos y roles que necesitamos cubrir. Te escribimos por WhatsApp
            para contarte si quedaste, en qué rol y en qué turnos. Postularte no
            asegura un lugar.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Tengo otra pregunta</dt>
          <dd className="text-muted-foreground break-words">
            Escríbenos a{" "}
            <a
              href={`mailto:${SITE_CONTACT_EMAIL}`}
              className="underline wrap-anywhere"
            >
              {SITE_CONTACT_EMAIL}
            </a>
            {instagram ? (
              <>
                {" "}
                o por Instagram a{" "}
                <a
                  href={instagram.href}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  @glitter.bo
                </a>
              </>
            ) : null}
            .
          </dd>
        </div>
      </dl>
    </section>
  );
}
