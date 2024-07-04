import * as styles from "@/app/emails/styles";
import { Img, Section } from "@react-email/components";

export default function EmailHeader() {
  return (
    <Section style={styles.banner}>
      <Img
        style={{ margin: "0 auto" }}
        width={170}
        src="https://utfs.io/f/e6820207-3eb1-43fd-b140-d00184fd8182-e81rey.png"
      />
    </Section>
  );
}
