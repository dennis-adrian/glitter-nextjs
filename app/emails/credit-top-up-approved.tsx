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

type CreditTopUpApprovedTemplateProps = {
  profile: BaseProfile;
  amount: number;
};

/**
 * Sent when an admin approves a credit voucher.
 *
 * Credits are spendable from the moment the voucher is uploaded, so this
 * grants nothing new: it settles the purchase. The copy says so, rather than
 * reading as though the credits only just arrived.
 */
export default function CreditTopUpApprovedTemplate({
  profile,
  amount,
}: CreditTopUpApprovedTemplateProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  return (
    <Html>
      <Head />
      <Preview>Confirmamos tu compra de {formatCreditCount(amount)}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {getUserName(profile)}!</Text>
            <Text style={styles.text}>
              Revisamos el comprobante de tu compra de{" "}
              <strong>{formatCreditCount(amount)}</strong> y está todo en orden:
              tu compra quedó confirmada.
            </Text>
            <Text style={styles.text}>
              Los créditos ya estaban disponibles en tu billetera desde que
              subiste el comprobante, así que no tenés que hacer nada más. Lo
              que hayas reservado o activado con ellos sigue igual.
            </Text>
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

CreditTopUpApprovedTemplate.PreviewProps = {
  profile: { id: 1, displayName: "Ana Ilustra" },
  amount: 90,
} as unknown as CreditTopUpApprovedTemplateProps;
