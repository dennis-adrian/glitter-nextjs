import * as styles from "@/app/emails/styles";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import { BaseProfile } from "@/app/api/users/definitions";
import { formatDate } from "@/app/lib/formatters";
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
import { DateTime } from "luxon";

export type SanctionEmailKind =
  | "approved"
  | "edited"
  | "expired"
  | "revoked"
  | "reservation_access_enabled";

type SanctionEmailProfile = Pick<
  BaseProfile,
  "id" | "displayName" | "firstName" | "lastName" | "email"
>;

type SanctionLifecycleEmailProps = {
  profile: SanctionEmailProfile;
  kind: SanctionEmailKind;
  sanctionId: number;
  typeLabel: string;
  statusLabel: string;
  scopeLabel: string;
  infractionLabels: string[];
  note?: string | null;
  festivalName?: string | null;
  reservationEligibleAt?: string | null;
};

const copy: Record<
  SanctionEmailKind,
  { preview: string; subject: string; intro: string }
> = {
  approved: {
    preview: "Se aprobó una sanción en tu historial",
    subject: "Se aprobó una sanción en tu historial",
    intro: "Se aprobó una sanción asociada a tu perfil.",
  },
  edited: {
    preview: "Actualizamos una sanción de tu historial",
    subject: "Actualizamos una sanción de tu historial",
    intro: "Actualizamos una sanción de tu historial disciplinario.",
  },
  expired: {
    preview: "Expiró una sanción de tu historial",
    subject: "Expiró una sanción de tu historial",
    intro: "Una sanción de tu historial llegó al final de su validez.",
  },
  revoked: {
    preview: "Se revocó una sanción de tu historial",
    subject: "Se revocó una sanción de tu historial",
    intro: "Una sanción de tu historial fue revocada.",
  },
  reservation_access_enabled: {
    preview: "Ya podés acceder a las reservas",
    subject: "Ya podés acceder a las reservas",
    intro: "El período de espera de tu sanción finalizó.",
  },
};

export function getSanctionEmailSubject(kind: SanctionEmailKind) {
  return copy[kind].subject;
}

export default function SanctionLifecycleEmail(
  props: SanctionLifecycleEmailProps,
) {
  const userName = getUserName(props.profile as BaseProfile);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const historyUrl = `${baseUrl}/profiles/${props.profile.id}/infractions`;
  const content = copy[props.kind];
  const infractionsSummary =
    props.infractionLabels.length > 0
      ? props.infractionLabels.join(", ")
      : "Sin infracciones listadas";

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
              Sanción #{props.sanctionId} · {props.typeLabel} ·{" "}
              {props.statusLabel} · {props.scopeLabel}
            </Text>
            <Text style={styles.text}>
              Infracciones relacionadas: {infractionsSummary}
            </Text>
            {props.note && <Text style={styles.text}>{props.note}</Text>}
            {props.kind === "reservation_access_enabled" &&
              props.festivalName &&
              props.reservationEligibleAt && (
                <Text style={styles.text}>
                  Ya podés acceder a las reservas de {props.festivalName} desde{" "}
                  {formatDate(
                    new Date(props.reservationEligibleAt),
                  ).toLocaleString(DateTime.DATETIME_MED)}
                  .
                </Text>
              )}
            <Text style={styles.text}>
              Podés revisar el detalle, la validez y las consecuencias en tu
              historial.
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

SanctionLifecycleEmail.PreviewProps = {
  profile: { id: 1, displayName: "Ana Pérez" },
  kind: "approved",
  sanctionId: 7,
  typeLabel: "Retraso de reserva",
  statusLabel: "Activa",
  scopeLabel: "Global",
  infractionLabels: ["No Show", "Incumplimiento"],
} as SanctionLifecycleEmailProps;
