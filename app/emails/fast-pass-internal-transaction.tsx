import {
  Body,
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
import type { FestivalBase } from "@/app/lib/festivals/definitions";

export type FastPassInternalTransactionEmailProps = {
  title: string;
  preview: string;
  details: { label: string; value: string }[];
  festivalType: FestivalBase["festivalType"];
};

export default function FastPassInternalTransactionEmailTemplate({
  title,
  preview,
  details,
  festivalType,
}: FastPassInternalTransactionEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader festivalType={festivalType} />
          <Section style={styles.sectionWithBanner}>
            <Text style={{ ...styles.text, fontWeight: 700 }}>{title}</Text>
            {details.map((detail) => (
              <Text key={detail.label} style={styles.text}>
                <strong>{detail.label}:</strong> {detail.value}
              </Text>
            ))}
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  );
}
