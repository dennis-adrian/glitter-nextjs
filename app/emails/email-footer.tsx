import * as styles from "@/app/emails/styles";
import { GLITTER_ISOTYPE_DARK_50X50_URL } from "@/app/lib/constants";
import { Container, Img, Link, Text } from "@react-email/components";

type EmailFooterProps = {
  /** Bulk mail only: where the reader stops receiving this kind of email. */
  unsubscribeUrl?: string;
};

export default function EmailFooter({ unsubscribeUrl }: EmailFooterProps) {
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
      {unsubscribeUrl ? (
        <Text style={{ ...styles.footerText, marginTop: "8px" }}>
          ¿No quieres recibir más correos como este?{" "}
          <Link href={unsubscribeUrl} style={styles.footerLink}>
            Darme de baja
          </Link>
        </Text>
      ) : null}
    </Container>
  );
}
