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
import { creditsAgree } from "@/app/lib/credit_gifts/definitions";

export type CreditGiftReceivedEmailProps = {
  /** First name or display name; omitted from the greeting when empty. */
  name: string | null;
  amount: number;
  title: string;
  /** Already personalised for this recipient. */
  message: string;
};

/**
 * A credit gift from the team (docs/PRD-in-app-notifications.md §7).
 *
 * Signed by Productora Glitter, never by the admin who sent it. The credits are
 * already in the wallet, so there is nothing to claim: the only action is
 * looking at them.
 */
export default function CreditGiftReceivedEmail({
  name,
  amount,
  title,
  message,
}: CreditGiftReceivedEmailProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const credits = formatCreditCount(amount);

  return (
    <Html>
      <Head />
      <Preview>Recibiste {credits} de regalo</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {name?.trim() ? `¡Hola ${name.trim()}!` : "¡Hola!"}
            </Text>
            <Text style={styles.text}>
              Recibiste <strong>{credits}</strong> de regalo.
            </Text>
            <Text style={{ ...styles.text, fontWeight: 600 }}>{title}</Text>
            <Text style={{ ...styles.text, whiteSpace: "pre-line" }}>
              {message}
            </Text>
            <Text style={styles.text}>
              {creditsAgree(amount, "Ya está", "Ya están")} en tu billetera:
              podés {creditsAgree(amount, "usarlo", "usarlos")} para pagar tus
              reservas y las funciones opcionales del festival.
            </Text>
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

CreditGiftReceivedEmail.PreviewProps = {
  name: "Ana",
  amount: 20,
  title: "Un regalo para agradecerte",
  message:
    "¡Gracias por ser parte de Glitter, Ana! Te regalamos estos créditos para que los uses en tu próxima reserva.",
} satisfies CreditGiftReceivedEmailProps;
