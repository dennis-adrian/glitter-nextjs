import { BaseProfile } from "@/app/api/users/definitions";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import { getUserName } from "@/app/lib/users/utils";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type ProfileCompletionEmailTemplateProps = {
  profile: BaseProfile;
};

export default function ProfileCompletionEmailTemplate(
  props: ProfileCompletionEmailTemplateProps,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const userName = getUserName(props.profile);

  return (
    <Html>
      <Head />
      <Preview>Un usuario a completado su perfil</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={{ ...styles.title, marginTop: "0px" }}>
              <strong>Nuevo perfil listo para verificar</strong>
            </Text>
            <Text style={styles.text}>
              El usuario <strong>{userName}</strong> ha completado su perfil.
            </Text>
            <Text style={styles.text}>
              Puedes revisar su perfil en el siguiente enlace:
            </Text>
            <Button
              href={`${baseUrl}/dashboard/users/${props.profile.id}`}
              style={styles.button}
            >
              Ir al perfil de {userName}
            </Button>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

ProfileCompletionEmailTemplate.PreviewProps = {
  profile: {
    id: 123,
    displayName: "John Doe Experience",
    firstName: "John",
    lastName: "Doe",
  },
} as ProfileCompletionEmailTemplateProps;
