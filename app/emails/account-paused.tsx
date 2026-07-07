import * as styles from "@/app/emails/styles";
import {
  Body,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { BaseProfile } from "@/app/api/users/definitions";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import { PARTICIPANT_SUPPORT_EMAIL } from "@/app/lib/participants/helpers";
import { getUserName } from "@/app/lib/users/utils";

type AccountPausedEmailTemplateProps = {
  profile: BaseProfile;
};

export default function AccountPausedEmailTemplate(
  props: AccountPausedEmailTemplateProps,
) {
  const userName = getUserName(props.profile);

  return (
    <Html>
      <Head />
      <Preview>Tu cuenta de participante fue pausada</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {userName}!</Text>
            <Text style={styles.text}>
              Pausamos tu cuenta de participante como parte de una limpieza de
              perfiles inactivos. Esto no es una sanción ni una infracción.
            </Text>
            <Text style={styles.text}>
              Mientras tu cuenta esté pausada no recibirás invitaciones para
              festivales ni podrás aceptar términos y condiciones de
              participación.
            </Text>
            <Text style={styles.text}>
              Si querés participar en un próximo festival, escribinos para
              solicitar la reactivación de tu cuenta. Si pedís la reactivación y
              no participás en el festival próximo, nuestro equipo podría
              revisar tu cuenta con mayor detalle.
            </Text>
            <Text style={styles.text}>
              Podés contactarnos en{" "}
              <Link
                href={`mailto:${PARTICIPANT_SUPPORT_EMAIL}`}
                style={{
                  color: "#15c",
                  textDecoration: "underline",
                }}
              >
                {PARTICIPANT_SUPPORT_EMAIL}
              </Link>
              .
            </Text>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

AccountPausedEmailTemplate.PreviewProps = {
  profile: {
    displayName: "John Doe",
  },
} as AccountPausedEmailTemplateProps;
