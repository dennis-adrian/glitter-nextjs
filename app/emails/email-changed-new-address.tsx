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

import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";

export type EmailChangedNewAddressEmailProps = {
  name: string | null;
  /** The address this is sent to: the one the account signs in with now. */
  newEmail: string;
};

/**
 * To the address an account signs in with from now on. The Google paragraph is
 * the point: the old Google account was unlinked, and signing in with it again
 * would not open this account but create a new, empty one.
 */
export default function EmailChangedNewAddressEmail({
  name,
  newEmail,
}: EmailChangedNewAddressEmailProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  return (
    <Html>
      <Head />
      <Preview>Este es ahora tu correo de acceso a Glitter</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {name?.trim() ? `¡Hola ${name.trim()}!` : "¡Hola!"}
            </Text>
            <Text style={styles.text}>
              Cambiamos el correo de acceso de tu cuenta Glitter. Desde ahora
              ingresás con{" "}
              <span style={{ ...styles.email, overflowWrap: "anywhere" }}>
                {newEmail}
              </span>{" "}
              y acá vas a recibir nuestros avisos. Tu perfil, tus reservas y tus
              créditos siguen igual.
            </Text>
            <Text style={styles.text}>
              Si antes entrabas con Google, usá la cuenta de Google de este
              correo. Si entrás con la cuenta de Google anterior se crea una
              cuenta nueva y vacía, separada de la tuya.
            </Text>
            <Text style={styles.text}>
              Si no pediste este cambio, escribinos a{" "}
              <span style={styles.email}>soporte@productoraglitter.com</span>.
            </Text>
            <Button href={`${baseUrl}/sign_in`} style={styles.button}>
              Ingresar a Glitter
            </Button>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

EmailChangedNewAddressEmail.PreviewProps = {
  name: "Ana",
  newEmail: "camila.rojas@gmail.com",
} satisfies EmailChangedNewAddressEmailProps;
