import * as styles from "@/app/emails/styles";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import { BaseProfile } from "@/app/api/users/definitions";
import { PARTICIPANT_SUPPORT_EMAIL } from "@/app/lib/participants/helpers";
import { getUserName } from "@/app/lib/users/utils";
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

export type InfractionEmailKind =
  | "registered"
  | "edited"
  | "resolved"
  | "voided";

type InfractionEmailProfile = Pick<
  BaseProfile,
  "id" | "displayName" | "firstName" | "lastName" | "email"
>;

type InfractionLifecycleEmailProps = {
  profile: InfractionEmailProfile;
  kind: InfractionEmailKind;
  infractionId: number;
  typeLabel: string;
  festivalName?: string | null;
  note?: string | null;
};

const copy: Record<
  InfractionEmailKind,
  { preview: string; subject: string; intro: string }
> = {
  registered: {
    preview: "Se registró una infracción en tu historial",
    subject: "Se registró una infracción en tu historial",
    intro: "Registramos una infracción asociada a tu perfil.",
  },
  edited: {
    preview: "Actualizamos una infracción de tu historial",
    subject: "Actualizamos una infracción de tu historial",
    intro: "Actualizamos información de una infracción en tu historial.",
  },
  resolved: {
    preview: "Se resolvió una infracción de tu historial",
    subject: "Se resolvió una infracción de tu historial",
    intro: "Una infracción de tu historial fue marcada como resuelta.",
  },
  voided: {
    preview: "Se anuló una infracción de tu historial",
    subject: "Se anuló una infracción de tu historial",
    intro: "Una infracción de tu historial fue anulada.",
  },
};

export function getInfractionEmailSubject(kind: InfractionEmailKind) {
  return copy[kind].subject;
}

export default function InfractionLifecycleEmail(
  props: InfractionLifecycleEmailProps,
) {
  const userName = getUserName(props.profile as BaseProfile);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const historyUrl = `${baseUrl}/profiles/${props.profile.id}/infractions`;
  const content = copy[props.kind];

  return (
    <Html>
      <Head />
      <Preview>{content.preview}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {userName}!</Text>
            <Text style={styles.text}>{content.intro}</Text>
            <Text style={styles.standoutText}>
              Infracción #{props.infractionId} · {props.typeLabel}
              {props.festivalName ? ` · ${props.festivalName}` : " · Global"}
            </Text>
            {props.note && <Text style={styles.text}>{props.note}</Text>}
            <Text style={styles.text}>
              Podés revisar el detalle completo en tu historial disciplinario.
            </Text>
            <Button href={historyUrl} style={styles.buttonWithBanner}>
              Ver historial
            </Button>
            <Text style={styles.text}>
              Si tenés dudas, escribinos a{" "}
              <Link
                href={`mailto:${PARTICIPANT_SUPPORT_EMAIL}`}
                style={{ color: "#15c", textDecoration: "underline" }}
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

InfractionLifecycleEmail.PreviewProps = {
  profile: { id: 1, displayName: "Ana Pérez" },
  kind: "registered",
  infractionId: 42,
  typeLabel: "No Show",
  festivalName: "Glitter Fest",
} as InfractionLifecycleEmailProps;
