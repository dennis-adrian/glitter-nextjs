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

export type FastPassVoucherChangesEmailProps = {
  buyerName: string;
  festivalDayLabel: string;
  reason: string;
  deadlineLabel: string;
  secureLinkUrl?: string | null;
  festivalType: FestivalBase["festivalType"];
};

export default function FastPassVoucherChangesEmailTemplate({
  buyerName,
  festivalDayLabel,
  reason,
  deadlineLabel,
  secureLinkUrl,
  festivalType,
}: FastPassVoucherChangesEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Necesitamos un nuevo comprobante para tu Pase Rápido.</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader festivalType={festivalType} />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {buyerName}, revisamos tu comprobante para el Pase Rápido del día{" "}
              <strong>{festivalDayLabel}</strong> y necesitamos uno nuevo.
            </Text>
            <Section style={reasonBox}>
              <Text style={{ ...styles.text, margin: 0 }}>{reason}</Text>
            </Section>
            <Text style={styles.text}>
              Tienes hasta <strong>{deadlineLabel}</strong> para subir el
              comprobante corregido.
            </Text>
            {secureLinkUrl ? (
              <>
                <Section style={{ textAlign: "center", margin: "16px 0" }}>
                  <Button href={secureLinkUrl} style={styles.primaryButton}>
                    Subir comprobante
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

const reasonBox = {
  border: "1px solid #dedede",
  borderLeft: "4px solid #7c3aed",
  borderRadius: "8px",
  padding: "12px 16px",
  margin: "16px 0",
};
