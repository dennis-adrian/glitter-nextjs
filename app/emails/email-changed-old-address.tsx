import {
  Body,
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
import { maskEmail } from "@/app/lib/emails/mask-email";

export type EmailChangedOldAddressEmailProps = {
  name: string | null;
  /** The address the account signs in with now. Shown masked. */
  newEmail: string;
};

/**
 * To the address an account used to sign in with, after the team moved it to
 * another one. Whoever reads this mailbox may not be the person who asked, so
 * the new address is masked: enough for its owner to recognise it, and no use
 * to anyone else.
 *
 * It does not say this address can no longer sign in: it may still be on the
 * account for a moment, and sessions already open stay open.
 */
export default function EmailChangedOldAddressEmail({
  name,
  newEmail,
}: EmailChangedOldAddressEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Cambiamos el correo de acceso de tu cuenta Glitter</Preview>
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
                {maskEmail(newEmail)}
              </span>
              , y este correo deja de recibir nuestros avisos.
            </Text>
            <Text style={styles.text}>
              Si no pediste este cambio, escribinos cuanto antes a{" "}
              <span style={styles.email}>soporte@productoraglitter.com</span>.
            </Text>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

EmailChangedOldAddressEmail.PreviewProps = {
  name: "Ana",
  newEmail: "camila.rojas@gmail.com",
} satisfies EmailChangedOldAddressEmailProps;
