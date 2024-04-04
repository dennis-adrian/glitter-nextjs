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

type ProfileCompletionReminderTemplateProps = {
  task: ProfileTaskWithProfile;
};

export default function ProfileCompletionReminderTemplate({
  task = {} as ProfileTaskWithProfile,
}: ProfileCompletionReminderTemplateProps) {
  const { profile } = task;
  const name = profile.displayName || profile.firstName || "participante";
  const dueDate = formatFullDate(task.dueDate);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  return (
    <Html>
      <Head />
      <Preview>Completa tu perfil para participar de nuestros eventos</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Text style={styles.title}>
            <strong>{name}</strong>, aún no has completado tu perfil
          </Text>
          <Section style={styles.section}>
            <Text style={styles.text}>¡Hola {name}!</Text>
            <Text style={styles.text}>
              Hemos notado que tu perfil en Festival Glitter está incompleto.
              Para poder participar de nuestros eventos, necesitamos que
              completes tu perfil.
            </Text>
            <Text style={styles.text}>
              Las cuentas incompletas se eliminan automáticamente después de 5
              días sin completarse. Tu cuenta esta programada para eliminarse el{" "}
              {dueDate}.
            </Text>
            <Text style={styles.text}>
              Para ir a tu perfil, haz click en el botón.
            </Text>
            <Button href={`${baseUrl}/user_profile`} style={styles.button}>
              Ir al perfil
            </Button>
          </Section>
          <Text style={styles.footer}>
            Productora Glitter・Santa Cruz, Bolivia
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

ProfileCompletionReminderTemplate.PreviewProps = {
  task: {
    profile: {
      displayName: "John Doe",
    },
    dueDate: new Date(),
  },
} as ProfileCompletionReminderTemplateProps;
