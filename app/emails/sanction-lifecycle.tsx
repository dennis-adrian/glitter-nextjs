import * as styles from "@/app/emails/styles";
import DisciplinaryHistoryDetails from "@/app/emails/disciplinary-history-details";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import { BaseProfile } from "@/app/api/users/definitions";
import { formatDate } from "@/app/lib/formatters";
import { PARTICIPANT_SUPPORT_EMAIL } from "@/app/lib/participants/helpers";
import { getUserName } from "@/app/lib/users/utils";
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
  {
    preview: string;
    subject: string;
    intro: string;
    historyPrompt: string;
    noteLabel: string;
  }
> = {
  approved: {
    preview: "Se aprobó una sanción en tu historial",
    subject: "Se aprobó una sanción en tu historial",
    intro:
      "Queremos informarte que, luego de revisar tu historial, se aprobó una sanción para tu perfil.",
    historyPrompt:
      "En tu historial podés revisar cuánto dura y cómo afecta tus próximas participaciones.",
    noteLabel: "Información adicional:",
  },
  edited: {
    preview: "Actualizamos una sanción de tu historial",
    subject: "Actualizamos una sanción de tu historial",
    intro: "Hicimos una actualización en una sanción de tu historial.",
    historyPrompt:
      "En tu historial podés revisar la información actualizada y cómo afecta tus próximas participaciones.",
    noteLabel: "Información adicional:",
  },
  expired: {
    preview: "Expiró una sanción de tu historial",
    subject: "Expiró una sanción de tu historial",
    intro: "Una sanción de tu historial finalizó y ya no está vigente.",
    historyPrompt:
      "El registro seguirá disponible en tu historial para que puedas consultarlo.",
    noteLabel: "Información adicional:",
  },
  revoked: {
    preview: "Se revocó una sanción de tu historial",
    subject: "Se revocó una sanción de tu historial",
    intro: "Revocamos una sanción de tu historial y ya no está vigente.",
    historyPrompt:
      "El registro seguirá disponible en tu historial para que puedas consultarlo.",
    noteLabel: "Motivo de la revocación:",
  },
  reservation_access_enabled: {
    preview: "Ya podés acceder a las reservas",
    subject: "Ya podés acceder a las reservas",
    intro: "¡Buenas noticias! El período de espera de tu sanción finalizó.",
    historyPrompt: "Podés consultar la sanción y sus detalles en tu historial.",
    noteLabel: "Información adicional:",
  },
};

const reasonsList = {
  margin: "-2px 0 16px",
  paddingLeft: "24px",
  textAlign: "left" as const,
};

const reasonListItem = {
  margin: "0 0 6px",
};

export function getSanctionEmailSubject(kind: SanctionEmailKind) {
  return copy[kind].subject;
}

function getSanctionDescription(typeLabel: string) {
  const descriptions: Record<string, string> = {
    advertencia: "una advertencia",
    ban: "un bloqueo del acceso a las reservas",
    "retraso de reserva": "un retraso para acceder a las reservas",
  };

  return descriptions[typeLabel.toLocaleLowerCase("es")] ?? typeLabel;
}

function getSanctionScopeDescription(
  scopeLabel: string,
  isCurrentSanction: boolean,
) {
  const isGlobalScope = scopeLabel.toLocaleLowerCase("es") === "global";

  if (isGlobalScope) {
    return isCurrentSanction
      ? "Esta medida se aplicará empezando el próximo festival."
      : "Mientras estuvo vigente, esta medida se aplicó a todos los festivales.";
  }

  return isCurrentSanction
    ? `Esta medida se aplica a los festivales de ${scopeLabel}.`
    : `Mientras estuvo vigente, esta medida se aplicó a los festivales de ${scopeLabel}.`;
}

export default function SanctionLifecycleEmail(
  props: SanctionLifecycleEmailProps,
) {
  const userName = getUserName(props.profile as BaseProfile);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const historyUrl = `${baseUrl}/profiles/${props.profile.id}/infractions`;
  const content = copy[props.kind];
  const isCurrentSanction =
    props.kind === "approved" || props.kind === "edited";
  const sanctionDescription = getSanctionDescription(props.typeLabel);
  const sanctionScopeDescription = getSanctionScopeDescription(
    props.scopeLabel,
    isCurrentSanction,
  );
  const formattedReservationDate = props.reservationEligibleAt
    ? formatDate(new Date(props.reservationEligibleAt)).toLocaleString(
        DateTime.DATETIME_MED,
      )
    : null;

  return (
    <Html>
      <Head />
      <Preview>{content.preview}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola, {userName}!</Text>
            <Text style={styles.text}>
              {content.intro}{" "}
              {props.kind === "reservation_access_enabled" ? (
                <>
                  Ya podés acceder a las reservas
                  {props.festivalName ? (
                    <>
                      {" "}
                      de <strong>{props.festivalName}</strong>
                    </>
                  ) : null}
                  {formattedReservationDate ? (
                    <>
                      {" "}
                      desde el <strong>{formattedReservationDate}</strong>
                    </>
                  ) : null}
                  .
                </>
              ) : (
                <>
                  La sanción {isCurrentSanction ? "consiste" : "consistía"} en{" "}
                  <strong>{sanctionDescription}</strong>.{" "}
                  {sanctionScopeDescription}{" "}
                  {props.infractionLabels.length > 0 && (
                    <>
                      {props.infractionLabels.length === 1
                        ? "La medida se tomó por el siguiente motivo:"
                        : "La medida se tomó por los siguientes motivos:"}
                    </>
                  )}
                </>
              )}
            </Text>
            {props.kind !== "reservation_access_enabled" &&
              props.infractionLabels.length > 0 && (
                <ul style={reasonsList}>
                  {props.infractionLabels.map((label, index) => (
                    <li key={`${label}-${index}`} style={reasonListItem}>
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            <DisciplinaryHistoryDetails
              note={props.note}
              noteLabel={content.noteLabel}
              historyPrompt={content.historyPrompt}
              historyUrl={historyUrl}
              identifier={`sanción #${props.sanctionId}`}
            />
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
