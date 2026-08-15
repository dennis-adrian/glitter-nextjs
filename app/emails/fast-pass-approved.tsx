import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import type { FestivalBase } from "@/app/lib/festivals/definitions";

export type FastPassApprovedEmailProps = {
  buyerName: string;
  festivalDayLabel: string;
  holderLabel: string;
  childCount: number;
  ticketCode: string;
  secureLinkUrl?: string | null;
  festivalType: FestivalBase["festivalType"];
};

export default function FastPassApprovedEmailTemplate({
  buyerName,
  festivalDayLabel,
  holderLabel,
  childCount,
  ticketCode,
  secureLinkUrl,
  festivalType,
}: FastPassApprovedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Tu Pase Rápido está confirmado.</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader festivalType={festivalType} />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {buyerName}, tu Pase Rápido para{" "}
              <strong>{festivalDayLabel}</strong> está confirmado.
            </Text>
            <Text style={styles.text}>
              Titular: <strong>{holderLabel}</strong>
              {childCount > 0
                ? ` · ${childCount} ${childCount === 1 ? "niño/a" : "niños/as"} incluidos`
                : null}
            </Text>
            <Section style={{ textAlign: "center", margin: "16px 0" }}>
              <Img
                src="cid:fast-pass-ticket-qrcode"
                alt="Código QR del Pase Rápido"
                width={200}
                height={200}
              />
              {/* Fallback for clients that do not resolve the CID attachment. */}
              <Text
                style={{
                  ...styles.text,
                  textAlign: "center",
                  fontWeight: "bold",
                  letterSpacing: "1px",
                }}
              >
                {ticketCode}
              </Text>
            </Section>
            <Text style={styles.text}>
              Presenta este código QR (o el código de arriba) en la entrada de
              Pase Rápido el día del festival.
            </Text>
            {secureLinkUrl ? (
              <Text
                style={{
                  ...styles.text,
                  fontSize: "12px",
                  wordBreak: "break-all",
                }}
              >
                También puedes ver tu compra en{" "}
                <Link href={secureLinkUrl}>{secureLinkUrl}</Link>
              </Text>
            ) : null}
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  );
}
