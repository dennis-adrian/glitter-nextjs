import { BaseProfile } from "@/app/api/users/definitions";
import EmailFooter from "@/app/emails/email-footer";
import * as styles from "@/app/emails/styles";
import { formatFullDate } from "@/app/lib/formatters";
import { ProfileTaskWithProfile } from "@/app/lib/profile_tasks/definitions";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type ProfileDeletionTemplateProps = {
  profile: BaseProfile;
};

export default function ProfileDeletionTemplate(
  props: ProfileDeletionTemplateProps,
) {
  const { profile } = props;
  const name =
    profile.displayName ||
    profile.firstName ||
    profile.lastName ||
    "Participante";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  return (
    <Html>
      <Head />
      <Preview>Tu cuenta ha sido eliminada</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Text style={styles.title}>
            <strong>{name}</strong>, tu cuenta ha sido eliminada
          </Text>
          <Section style={styles.section}>
            <Text style={styles.text}>¡Hola {name}!</Text>
            <Text style={styles.text}>
              No pudimos confirmar que los datos de tu perfil estén completos y
              tu cuenta fue eliminada automáticamente.
            </Text>
            <Text style={styles.text}>
              Si aún deseas participar de nuestros eventos, por favor crea un
              nuevo perfil.
            </Text>
            <Button href={`${baseUrl}/sign_up`} style={styles.button}>
              Crear perfil
            </Button>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

ProfileDeletionTemplate.PreviewProps = {
  profile: {
    displayName: "John Doe",
  },
} as ProfileDeletionTemplateProps;
