import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import type { FestivalBase } from "@/app/lib/festivals/definitions";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";

export interface StandsAvailableEmailProps {
  /** Greeting name; empty greets without one. */
  name: string;
  festival: Pick<FestivalBase, "id" | "name" | "festivalType">;
  /** "Ilustración": the category the person's free stands are for. */
  categoryLabel: string;
  baseUrl: string;
  /** Where this participant stops receiving these announcements. */
  unsubscribeUrl?: string;
}

export function standsAvailableSubject(festivalName: string) {
  return `Todavía hay espacios disponibles en ${festivalName}`;
}

/**
 * The "stands still available" reminder an admin sends from the festival's
 * page (`app/lib/festivals/festival-notice-delivery.ts`).
 */
export default function StandsAvailableEmailTemplate({
  name,
  festival,
  categoryLabel,
  baseUrl,
  unsubscribeUrl,
}: StandsAvailableEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Quedan espacios de {categoryLabel} en {festival.name}
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader festivalType={festival.festivalType} />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {name ? `¡Hola, ${name}!` : "¡Hola!"}
            </Text>
            <Text style={styles.text}>
              Todavía quedan espacios de <strong>{categoryLabel}</strong> sin
              reservar en <strong>{festival.name}</strong>.
            </Text>
            <Text style={styles.text}>
              Si todavía no reservaste el tuyo, este es un buen momento para
              hacerlo antes de que se agoten.
            </Text>
            <Text style={styles.text}>
              Si tenés dudas o problemas con la reserva, comunicate con nosotros
              al correo{" "}
              <Link
                href="mailto:soporte@productoraglitter.com"
                style={{
                  color: "#15c",
                  textDecoration: "underline",
                }}
              >
                soporte@productoraglitter.com
              </Link>{" "}
              para que podamos ayudarte.
            </Text>
            <Button
              href={`${baseUrl}/festivals/${festival.id}/terms`}
              style={styles.button}
            >
              Reservar mi espacio
            </Button>
          </Section>
        </Container>
        <EmailFooter unsubscribeUrl={unsubscribeUrl} />
      </Body>
    </Html>
  );
}

StandsAvailableEmailTemplate.PreviewProps = {
  name: "John Doe",
  festival: {
    id: 11,
    name: "Glitter 10ma edición",
    festivalType: "glitter",
  },
  categoryLabel: "Ilustración",
  baseUrl: "http://localhost:3000",
  unsubscribeUrl: "http://localhost:3000/email/unsubscribe?token=preview",
} as StandsAvailableEmailProps;
