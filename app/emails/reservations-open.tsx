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

export interface ReservationsOpenEmailProps {
  /** Greeting name; empty greets without one. */
  name: string;
  festival: Pick<FestivalBase, "id" | "name" | "festivalType">;
  baseUrl: string;
  /** Where this participant stops receiving these announcements. */
  unsubscribeUrl?: string;
}

export function reservationsOpenSubject(festivalName: string) {
  return `¡Ya abrieron las reservas para ${festivalName}!`;
}

/**
 * Sent when a festival's reservations open, and again on every resend from
 * the festival's page (`app/lib/festivals/reservations-open-delivery.ts`).
 */
export default function ReservationsOpenEmailTemplate({
  name,
  festival,
  baseUrl,
  unsubscribeUrl,
}: ReservationsOpenEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Ya podés reservar tu espacio en {festival.name}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader festivalType={festival.festivalType} />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {name ? `¡Hola, ${name}!` : "¡Hola!"}
            </Text>
            <Text style={styles.text}>
              Las reservas para <strong>{festival.name}</strong> ya están
              habilitadas. Ya podés elegir y reservar tu espacio.
            </Text>
            <Text style={styles.text}>
              Antes de reservar, leé con atención los términos y condiciones
              haciendo clic en el botón debajo del texto.
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

ReservationsOpenEmailTemplate.PreviewProps = {
  name: "John Doe",
  festival: {
    id: 11,
    name: "Glitter 10ma edición",
    festivalType: "glitter",
  },
  baseUrl: "http://localhost:3000",
  unsubscribeUrl: "http://localhost:3000/email/unsubscribe?token=preview",
} as ReservationsOpenEmailProps;
