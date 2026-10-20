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

import { formatCreditCount } from "@/app/components/credits/credit-amount";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";

export type CreditGiftRevokedEmailProps = {
  name: string | null;
  amount: number;
  title: string;
  /** Owed once the reversal landed, or 0 when the balance stayed positive. */
  debtAmount: number;
};

/**
 * The team took a gift back. Neutral on purpose: no celebration, no blame, and
 * the debt case spelled out, because a negative balance blocks every credit
 * use until it is regularized.
 */
export default function CreditGiftRevokedEmail({
  name,
  amount,
  title,
  debtAmount,
}: CreditGiftRevokedEmailProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const credits = formatCreditCount(amount);

  return (
    <Html>
      <Head />
      <Preview>Ajustamos tu saldo de créditos</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {name?.trim() ? `¡Hola ${name.trim()}!` : "¡Hola!"}
            </Text>
            <Text style={styles.text}>
              Retiramos de tu billetera el regalo «{title}» que te habíamos
              enviado: <strong>{credits}</strong>.
            </Text>
            {debtAmount > 0 ? (
              <Text style={styles.text}>
                Con este ajuste te queda un saldo pendiente de{" "}
                <strong>{formatCreditCount(debtAmount)}</strong>. Todo lo que ya
                pagaste con créditos sigue en pie, pero hasta regularizar el
                saldo no vas a poder usar créditos. Escribinos a{" "}
                <span style={styles.email}>soporte@productoraglitter.com</span>{" "}
                y lo resolvemos.
              </Text>
            ) : (
              <Text style={styles.text}>
                Si tenés alguna duda, escribinos a{" "}
                <span style={styles.email}>soporte@productoraglitter.com</span>.
              </Text>
            )}
            <Button href={`${baseUrl}/my_credits`} style={styles.button}>
              Ver mi billetera
            </Button>
            <Text style={{ ...styles.text, marginTop: "16px" }}>
              Productora Glitter
            </Text>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

CreditGiftRevokedEmail.PreviewProps = {
  name: "Ana",
  amount: 20,
  title: "Un regalo para agradecerte",
  debtAmount: 0,
} satisfies CreditGiftRevokedEmailProps;
