import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import { formatCreditCount } from "@/app/components/credits/credit-amount";
import { getUserName } from "@/app/lib/users/utils";

import type { BaseProfile } from "@/app/api/users/definitions";

type ReservationReleasedTemplateProps = {
  /** Who is being written to. */
  recipient: BaseProfile;
  /** Who released it. The same person as `recipient` for the owner's copy. */
  owner: BaseProfile;
  isOwner: boolean;
  festivalId: number;
  festivalName: string;
  standLabel: string;
  standCount: number;
  creditPrice: number;
};

/**
 * Sent when a reservation is released (PRD §9.4).
 *
 * Two audiences with genuinely different news. The owner chose this and paid
 * for it, so their copy confirms what they did. A partner did not choose it and
 * may not have known it was coming — theirs has to say who released it and that
 * they are free too, without reading like something they are being billed for.
 *
 * Both have to be unambiguous that the stand is gone rather than held: it went
 * back on the map the moment this happened, and somebody else may already have
 * taken it.
 */
export default function ReservationReleasedTemplate({
  recipient,
  owner,
  isOwner,
  festivalId,
  festivalName,
  standLabel,
  standCount,
  creditPrice,
}: ReservationReleasedTemplateProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const spaceWord = standCount > 1 ? "los espacios" : "el espacio";

  return (
    <Html>
      <Head />
      <Preview>
        {isOwner
          ? `Liberaste tu reserva en ${festivalName}`
          : `Se liberó la reserva que compartías en ${festivalName}`}
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {getUserName(recipient)}!</Text>

            {isOwner ? (
              <Text style={styles.text}>
                Liberaste tu reserva de {spaceWord}{" "}
                <strong>{standLabel}</strong> en <strong>{festivalName}</strong>
                .
              </Text>
            ) : (
              <Text style={styles.text}>
                <strong>{getUserName(owner)}</strong> liberó la reserva de{" "}
                {spaceWord} <strong>{standLabel}</strong> en{" "}
                <strong>{festivalName}</strong>, que compartían.
              </Text>
            )}

            <Text style={styles.text}>
              {standCount > 1
                ? "Esos espacios volvieron"
                : "Ese espacio volvió"}{" "}
              al mapa y otra persona puede tomar
              {standCount > 1 ? "los" : "lo"}, así que ya no
              {standCount > 1 ? " están" : " está"} guardado
              {standCount > 1 ? "s" : ""} para vos.
            </Text>

            <Text style={styles.text}>
              Podés hacer una nueva reserva si todavía queda lugar, o sumarte
              como compañero de otra persona.
            </Text>

            {isOwner && (
              <Text style={styles.text}>
                Se usaron <strong>{formatCreditCount(creditPrice)}</strong> para
                liberarla y no se devuelven. No se te cobró el precio del
                espacio, porque todavía no lo habías pagado.
              </Text>
            )}

            <Button
              href={`${baseUrl}/profiles/${recipient.id}/festivals/${festivalId}/reservations/new`}
              style={styles.button}
            >
              Ver espacios disponibles
            </Button>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

ReservationReleasedTemplate.PreviewProps = {
  recipient: { id: 1, displayName: "Ana Ilustra" },
  owner: { id: 1, displayName: "Ana Ilustra" },
  isOwner: true,
  festivalId: 7,
  festivalName: "Glitter ¡Feliz Cumple!",
  standLabel: "B48",
  standCount: 1,
  creditPrice: 40,
} as unknown as ReservationReleasedTemplateProps;
