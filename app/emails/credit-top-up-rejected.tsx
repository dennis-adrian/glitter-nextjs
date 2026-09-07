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

type CreditTopUpRejectedTemplateProps = {
  profile: BaseProfile;
  amount: number;
  reason: string;
  /** Amount owed once the reversal landed, or 0 when nothing was spent. */
  debtAmount: number;
};

/**
 * Sent when an admin rejects a credit voucher (PRD §4.3, §15).
 *
 * The hard part is the debt case. Credits are spendable before review, so a
 * rejection can land after they paid for something — and nothing is undone by
 * it (§2, "never reverse a completed feature action automatically"). The
 * participant needs to hear both halves: what they bought stays theirs, and
 * they owe the amount. Softening either one would leave them guessing whether
 * their reservation is still standing.
 */
export default function CreditTopUpRejectedTemplate({
  profile,
  amount,
  reason,
  debtAmount,
}: CreditTopUpRejectedTemplateProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const owesMoney = debtAmount > 0;

  return (
    <Html>
      <Head />
      <Preview>
        No pudimos confirmar tu compra de {formatCreditCount(amount)}
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {getUserName(profile)}!</Text>
            <Text style={styles.text}>
              Revisamos el comprobante de tu compra de{" "}
              <strong>{formatCreditCount(amount)}</strong> y no pudimos
              confirmarlo. El motivo que registramos es:{" "}
              <strong>{reason}</strong>.
            </Text>
            <Text style={styles.text}>
              Descontamos esos créditos de tu billetera.
            </Text>
            {owesMoney ? (
              <>
                <Text style={styles.text}>
                  Como ya habías usado parte de ellos, te queda un saldo
                  pendiente de <strong>{formatCreditCount(debtAmount)}</strong>.{" "}
                  <strong>
                    Lo que reservaste o activaste con esos créditos sigue en pie
                  </strong>
                  ; no se cancela nada por esto.
                </Text>
                <Text style={styles.text}>
                  Hasta que regularices ese saldo no vas a poder usar créditos
                  para otras cosas. Escribinos a{" "}
                  <span style={styles.email}>
                    soporte@productoraglitter.com
                  </span>{" "}
                  y lo resolvemos: podés enviarnos otro comprobante o coordinar
                  el pago.
                </Text>
              </>
            ) : (
              <Text style={styles.text}>
                No habías usado esos créditos, así que no queda nada pendiente.
                Si creés que hubo un error, escribinos a{" "}
                <span style={styles.email}>soporte@productoraglitter.com</span>.
              </Text>
            )}
            <Button href={`${baseUrl}/my_credits`} style={styles.button}>
              Ver mi billetera
            </Button>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

CreditTopUpRejectedTemplate.PreviewProps = {
  profile: { id: 1, displayName: "Ana Ilustra" },
  amount: 90,
  reason: "El comprobante no coincide con ninguna transferencia recibida",
  debtAmount: 90,
} as unknown as CreditTopUpRejectedTemplateProps;
