import * as styles from "@/app/emails/styles";
import { GLITTER_ISOTYPE_DARK_50X50_URL } from "@/app/lib/constants";
import { Container, Img, Link, Text } from "react-email";

type EmailFooterProps = {
  /** Bulk mail only: where the reader stops receiving this kind of email. */
  unsubscribeUrl?: string;
  /**
   * Small print about why this email reached the reader, such as an
   * essential send or a test environment. One line each.
   */
  notes?: string[];
};

export default function EmailFooter({
  unsubscribeUrl,
  notes = [],
}: EmailFooterProps) {
  return (
    <Container style={styles.footer}>
      <Img
        style={{ margin: "4px auto", borderRadius: "20%" }}
        src={GLITTER_ISOTYPE_DARK_50X50_URL}
        width={32}
      />
      <Text style={styles.footerText}>Enviado por el equipo Glitter</Text>
      <Text style={styles.footerText}>
        © {new Date().getFullYear()} | Productora Glitter, Santa Cruz,
        Bolivia{" "}
      </Text>
      {notes.map((note, index) => (
        <Text key={index} style={{ ...styles.footerText, marginTop: "8px" }}>
          {note}
        </Text>
      ))}
      {unsubscribeUrl ? (
        <Text style={{ ...styles.footerText, marginTop: "8px" }}>
          ¿No querés recibir más correos como este?{" "}
          <Link href={unsubscribeUrl} style={styles.footerLink}>
            Darme de baja
          </Link>
        </Text>
      ) : null}
    </Container>
  );
}
