import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";

import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import { consoleHref } from "@/app/lib/reservations/console-lenses";
import { getUserName } from "@/app/lib/users/utils";

import type { BaseProfile } from "@/app/api/users/definitions";

type ReservationConfirmationForAdminsEmailTemplateProps = {
  /** Who paid. The reservation's cobro is in their name. */
  participant: BaseProfile;
  festivalId: number;
  festivalName: string;
  standLabel: string;
  standCount: number;
  reservationId: number;
};

/**
 * Sent to the team when credits covered a reservation's whole cobro.
 *
 * Every other settlement goes through an admin, who already knows. This one
 * (`applyInvoiceCredits`) confirms the reservation with nobody approving
 * anything, so this message is how the team hears about it. The participant
 * gets their own confirmation; this copy speaks about them, not to them.
 */
export default function ReservationConfirmationForAdminsEmailTemplate({
  participant,
  festivalId,
  festivalName,
  standLabel,
  standCount,
  reservationId,
}: ReservationConfirmationForAdminsEmailTemplateProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const participantName = getUserName(participant);

  return (
    <Html>
      <Head />
      <Preview>{`${participantName} confirmó su reserva con créditos`}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>Hola equipo,</Text>
            <Text style={styles.text}>
              <strong>{participantName}</strong> cubrió con créditos el saldo de
              su reserva para {standCount > 1 ? "los espacios" : "el espacio"}{" "}
              <strong>{standLabel}</strong> en el festival{" "}
              <strong>{festivalName}</strong>.
            </Text>
            <Text style={styles.text}>
              La reserva quedó confirmada automáticamente: no hay comprobante
              que revisar.
            </Text>
            <Button
              href={`${baseUrl}${consoleHref({ festivalId, lens: "creditos", reservationId })}`}
              style={styles.button}
            >
              Ver la reserva
            </Button>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

ReservationConfirmationForAdminsEmailTemplate.PreviewProps = {
  participant: { id: 1, displayName: "Ana Ilustra" },
  festivalId: 7,
  festivalName: "Glitter ¡Feliz Cumple!",
  standLabel: "B48",
  standCount: 1,
  reservationId: 42,
} as unknown as ReservationConfirmationForAdminsEmailTemplateProps;
