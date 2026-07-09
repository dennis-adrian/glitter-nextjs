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
      <Preview>Tu perfil fue pausado</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {userName}!</Text>
            <Text style={styles.text}>
              Pausamos tu perfil como parte de una limpieza de perfiles
              inactivos que no han tenido participaciones en los últimos 3
              festivales.
            </Text>
            <Text style={styles.text}>
              Mientras tu perfil esté pausado no recibirás correos de invitación
              pero siestás interesado en participar en el próximo festival,
              escribinos para solicitar la reactivación de tu perfil.
            </Text>
            <Text style={styles.text}>
              La solicitud será evaluada y en caso de ser aprobada, tu perfil
              será reactivado condicionado a una participación activa en el
              próximo festival.
            </Text>
            <Text style={styles.text}>
              Podés contactarnos al correo{" "}
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
