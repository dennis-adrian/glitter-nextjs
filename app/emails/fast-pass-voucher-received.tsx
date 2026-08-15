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

export type FastPassVoucherReceivedEmailProps = {
  buyerName: string;
  festivalDayLabel: string;
  paidCount: number;
  totalLabel: string;
  secureLinkUrl?: string | null;
  isReplacement: boolean;
  festivalType: FestivalBase["festivalType"];
};

export default function FastPassVoucherReceivedEmailTemplate({
  buyerName,
  festivalDayLabel,
  paidCount,
  totalLabel,
  secureLinkUrl,
  isReplacement,
  festivalType,
}: FastPassVoucherReceivedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {isReplacement
          ? "Recibimos tu nuevo comprobante."
          : "Recibimos tu comprobante y lo estamos revisando."}
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader festivalType={festivalType} />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {buyerName}, recibimos{" "}
              {isReplacement ? "tu nuevo comprobante" : "tu comprobante"} de
              pago para{" "}
              <strong>
                {paidCount} {paidCount === 1 ? "Pase Rápido" : "Pases Rápidos"}
              </strong>{" "}
              del día <strong>{festivalDayLabel}</strong>.
            </Text>
            <Text style={styles.text}>Total: {totalLabel}.</Text>
            <Text style={styles.text}>
              Revisaremos tu pago y te avisaremos por correo cuando esté
              confirmado.
            </Text>
            {secureLinkUrl ? (
              <>
                <Section style={{ textAlign: "center", margin: "16px 0" }}>
                  <Button href={secureLinkUrl} style={styles.primaryButton}>
                    Ver mi reserva
                  </Button>
                </Section>
                <Text
                  style={{
                    ...styles.text,
                    fontSize: "12px",
                    wordBreak: "break-all",
                  }}
                >
                  <Link href={secureLinkUrl}>{secureLinkUrl}</Link>
                </Text>
              </>
            ) : null}
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  );
}
