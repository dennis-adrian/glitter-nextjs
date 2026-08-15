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
} from "@react-email/components";

import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import type { FestivalBase } from "@/app/lib/festivals/definitions";

export type FastPassPurchaseLinkEmailProps = {
  buyerName: string;
  festivalDayLabel: string;
  holdExpiresAtLabel: string;
  totalLabel: string;
  secureLinkUrl: string;
  festivalType: FestivalBase["festivalType"];
};

export default function FastPassPurchaseLinkEmailTemplate({
  buyerName,
  festivalDayLabel,
  holdExpiresAtLabel,
  totalLabel,
  secureLinkUrl,
  festivalType,
}: FastPassPurchaseLinkEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Reservamos tu Pase Rápido. Sube tu comprobante antes del plazo.
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader festivalType={festivalType} />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {buyerName}, reservamos tu Pase Rápido para{" "}
              <strong>{festivalDayLabel}</strong>.
            </Text>
            <Text style={styles.text}>
              Total: <strong>{totalLabel}</strong>. Tienes hasta{" "}
              <strong>{holdExpiresAtLabel}</strong> para subir tu comprobante de
              pago.
            </Text>
            <Section style={{ textAlign: "center", margin: "16px 0" }}>
              <Button href={secureLinkUrl} style={styles.primaryButton}>
                Ver mi reserva
              </Button>
            </Section>
            <Text style={{ ...styles.text, fontSize: "12px" }}>
              ¿No funciona el botón? Copia y pega este enlace:
            </Text>
            <Text
              style={{
                ...styles.text,
                fontSize: "12px",
                wordBreak: "break-all",
              }}
            >
              <Link href={secureLinkUrl}>{secureLinkUrl}</Link>
            </Text>
            <Text style={{ ...styles.text, fontSize: "12px" }}>
              No compartas este enlace — cualquier persona que lo tenga puede
              ver tu compra.
            </Text>
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  );
}
