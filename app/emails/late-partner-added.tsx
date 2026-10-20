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
import { formatCreditCount } from "@/app/components/credits/credit-amount";
import { getUserName } from "@/app/lib/users/utils";

import type { BaseProfile } from "@/app/api/users/definitions";

type LatePartnerAddedTemplateProps = {
  recipient: BaseProfile;
  owner: BaseProfile;
  partner: BaseProfile;
  isOwner: boolean;
  festivalId: number;
  festivalName: string;
  standLabel: string;
  reservationId: number;
  totalCredits: number;
  /**
   * The part of the total that paid for the second person. Zero on a full
   * table, which costs the same for one or two; null when a job queued before
   * this was recorded does not carry it.
   */
  sharedPriceDifference?: number | null;
};

/**
 * Sent when a partner is added to an existing reservation (PRD §8.3, §15).
 *
 * The partner did not ask for this — somebody put them on a stand — so their
 * copy reads as an invitation and says plainly that they owe nothing. The
 * `owner pays, partner sees` rule (§14) is only reassuring if the partner is
 * actually told, otherwise their first thought is what it cost them.
 *
 * The owner's copy confirms the debit and says what it paid for. On a full
 * table that is the fee alone — naming a price difference there would describe
 * a charge that never happened. Neither version reopens the original invoice,
 * because adding a partner never touched it (§8.4).
 */
export default function LatePartnerAddedTemplate({
  recipient,
  owner,
  partner,
  isOwner,
  festivalId,
  festivalName,
  standLabel,
  reservationId,
  totalCredits,
  sharedPriceDifference = null,
}: LatePartnerAddedTemplateProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const reservationUrl = `${baseUrl}/profiles/${recipient.id}/festivals/${festivalId}/reservations/${reservationId}`;

  return (
    <Html>
      <Head />
      <Preview>
        {isOwner
          ? `Agregaste a ${getUserName(partner)} a tu reserva`
          : `Vas a compartir un espacio en ${festivalName}`}
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {getUserName(recipient)}!</Text>

            {isOwner ? (
              <>
                <Text style={styles.text}>
                  Agregamos a <strong>{getUserName(partner)}</strong> a tu
                  reserva del espacio <strong>{standLabel}</strong> en{" "}
                  <strong>{festivalName}</strong>.
                </Text>
                <Text style={styles.text}>
                  Se usaron <strong>{formatCreditCount(totalCredits)}</strong>,
                  {sharedPriceDifference === 0
                    ? " que cubren el costo de agregar a alguien después de reservar."
                    : " que cubren la diferencia entre el precio individual y el compartido más el costo de agregar a alguien después de reservar."}{" "}
                  Tu cobro original no cambia.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.text}>
                  <strong>{getUserName(owner)}</strong> te agregó a su reserva
                  del espacio <strong>{standLabel}</strong> en{" "}
                  <strong>{festivalName}</strong>. Van a compartir ese espacio.
                </Text>
                <Text style={styles.text}>
                  <strong>No tenés que pagar nada.</strong> {getUserName(owner)}{" "}
                  ya se hizo cargo del costo de la reserva.
                </Text>
              </>
            )}

            <Text style={styles.text}>
              Si algo de esto no es lo que esperabas, escribinos a{" "}
              <span style={styles.email}>soporte@productoraglitter.com</span>.
            </Text>

            <Button href={reservationUrl} style={styles.button}>
              Ver la reserva
            </Button>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

LatePartnerAddedTemplate.PreviewProps = {
  recipient: { id: 2, displayName: "Carla Dibuja" },
  owner: { id: 1, displayName: "Ana Ilustra" },
  partner: { id: 2, displayName: "Carla Dibuja" },
  isOwner: false,
  festivalId: 7,
  festivalName: "Glitter ¡Feliz Cumple!",
  standLabel: "B48",
  reservationId: 42,
  totalCredits: 55,
} as unknown as LatePartnerAddedTemplateProps;
