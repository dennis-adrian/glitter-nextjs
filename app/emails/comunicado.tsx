import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";

import {
  announcementBlocksToEmail,
  comunicadoActionUrl,
} from "@/app/emails/comunicado-blocks";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import type { AnnouncementBlock } from "@/app/lib/comunicados/content";
import {
  announcementBlocksToText,
  excerptOf,
} from "@/app/lib/comunicados/text";

/** The inbox line under the subject: the excerpt, shorter. */
export const COMUNICADO_PREHEADER_MAX = 120;

export type ComunicadoEmailProps = {
  /**
   * Already through `safeGreetingName`: it is printed as given, and null
   * greets without a name.
   */
  greetingName: string | null;
  title: string;
  /** As `normalizeAnnouncementDoc` returned them. */
  blocks: AnnouncementBlock[];
  /** The optional button; shown only with both and a Glitter path. */
  actionLabel: string | null;
  actionPath: string | null;
  /** The footer link to the unsubscribe page, for the topic Anuncios. */
  unsubscribeUrl: string;
  /** An essential send's festival: adds the note that explains it (D7). */
  essentialFestivalName?: string | null;
  /** Any environment but production, test sends included (D7). */
  staging: boolean;
  /** Origin the Glitter paths are joined to, from `publicBaseUrl()`. */
  baseUrl: string;
};

export const COMUNICADO_STAGING_NOTE =
  "Este correo salió del entorno de prueba de Glitter. Darte de baja acá no cambia nada en los correos del sitio real de Glitter; si no esperabas recibirlo, respondé a este correo.";

export function comunicadoEssentialNote(festivalName: string) {
  return `Es un correo esencial sobre tu participación en ${festivalName}: llega también a quienes se dieron de baja de los anuncios.`;
}

/** The footer's small print, in the order it is printed. */
export function comunicadoFooterNotes(opts: {
  essentialFestivalName?: string | null;
  staging: boolean;
}): string[] {
  const notes: string[] = [];
  const festival = opts.essentialFestivalName?.trim();
  if (festival) notes.push(comunicadoEssentialNote(festival));
  if (opts.staging) notes.push(COMUNICADO_STAGING_NOTE);
  return notes;
}

export function comunicadoGreeting(name: string | null) {
  return name ? `¡Hola ${name}!` : "¡Hola!";
}

/** The excerpt cut on a word boundary, "…" included, to fit 120. */
export function comunicadoPreheader(text: string) {
  const excerpt = excerptOf(text);
  if (excerpt.length <= COMUNICADO_PREHEADER_MAX) return excerpt;

  let cut = excerpt.slice(0, COMUNICADO_PREHEADER_MAX - 1);
  if (excerpt[cut.length] !== " ") {
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > 0) cut = cut.slice(0, lastSpace);
    // One long word: never split an emoji's surrogate pair.
    else if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  }
  return `${cut.replace(/[\s,;:.\-–—…]+$/, "")}…`;
}

const bodyStyle = { ...styles.sectionWithBanner, textAlign: "left" as const };

const titleStyle = {
  ...styles.titleWithBanner,
  textAlign: "left" as const,
  fontWeight: 700,
};

/**
 * A comunicado (docs/IMPLEMENTATION-comunicados.md H3): one body for every
 * recipient, except the greeting and the unsubscribe link. Sent as
 * Productora Glitter, never as the admin who wrote it, and with no sign-off.
 */
export default function ComunicadoEmail({
  greetingName,
  title,
  blocks,
  actionLabel,
  actionPath,
  unsubscribeUrl,
  essentialFestivalName,
  staging,
  baseUrl,
}: ComunicadoEmailProps) {
  const label = actionLabel?.trim();
  const actionUrl = label ? comunicadoActionUrl(actionPath, baseUrl) : null;

  return (
    <Html lang="es">
      <Head />
      <Preview>
        {comunicadoPreheader(
          announcementBlocksToText(blocks, { withUrls: false }),
        )}
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={bodyStyle}>
            <Text style={styles.text}>{comunicadoGreeting(greetingName)}</Text>
            <Heading as="h1" style={titleStyle}>
              {title}
            </Heading>
            {announcementBlocksToEmail(blocks, { baseUrl })}
            {label && actionUrl ? (
              <Section style={{ textAlign: "center", marginTop: "16px" }}>
                <Button href={actionUrl} style={styles.primaryButton}>
                  {label}
                </Button>
              </Section>
            ) : null}
          </Section>
        </Container>
        <EmailFooter
          unsubscribeUrl={unsubscribeUrl}
          notes={comunicadoFooterNotes({ essentialFestivalName, staging })}
        />
      </Body>
    </Html>
  );
}

ComunicadoEmail.PreviewProps = {
  greetingName: "Ana",
  title: "Cambio de horario de armado",
  blocks: [
    {
      type: "paragraph",
      props: {},
      content: [
        {
          type: "text",
          text: "El armado del sábado se adelanta a las ",
          styles: {},
        },
        { type: "text", text: "7:00", styles: { bold: true } },
        { type: "text", text: " por la lluvia.", styles: {} },
      ],
      children: [],
    },
    {
      type: "heading",
      props: { level: 2 },
      content: [{ type: "text", text: "Qué tenés que llevar", styles: {} }],
      children: [],
    },
    {
      type: "bulletListItem",
      props: {},
      content: [{ type: "text", text: "Tu credencial", styles: {} }],
      children: [],
    },
    {
      type: "bulletListItem",
      props: {},
      content: [
        { type: "text", text: "Revisá ", styles: {} },
        {
          type: "link",
          href: "/my_participations",
          content: [{ type: "text", text: "tu reserva", styles: {} }],
        },
      ],
      children: [],
    },
  ],
  actionLabel: "Ver mi reserva",
  actionPath: "/my_participations",
  unsubscribeUrl: "http://localhost:3000/email/unsubscribe?token=preview",
  essentialFestivalName: "Glitter Navidad 2026",
  staging: true,
  baseUrl: "http://localhost:3000",
} satisfies ComunicadoEmailProps;
