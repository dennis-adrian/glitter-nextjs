import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
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
  title: string;
  /** As `normalizeAnnouncementDoc` returned them. */
  blocks: AnnouncementBlock[];
  /** The optional button; shown only with both and a Glitter path. */
  actionLabel: string | null;
  actionPath: string | null;
  /** The sender's preview line; without it the preheader is the text's start. */
  previewText?: string | null;
  /** The footer link to the unsubscribe page, for the topic Anuncios. */
  unsubscribeUrl: string;
  /** An essential send's festival: adds the note that explains it (D7). */
  essentialFestivalName?: string | null;
  /** A comunicado to visitors and guest buyers: says why they get it (§L). */
  visitors?: boolean;
  /** Origin the Glitter paths are joined to, from `publicBaseUrl()`. */
  baseUrl: string;
};

export function comunicadoEssentialNote(festivalName: string) {
  return `Es un correo esencial sobre tu participación en ${festivalName}: llega también a quienes se dieron de baja de los anuncios.`;
}

/** Why someone without an account gets a comunicado (§L). */
export const COMUNICADO_VISITOR_NOTE =
  "Te escribimos porque te registraste para visitar un festival de Productora Glitter o compraste en nuestra tienda. Son nuestras novedades: podés darte de baja cuando quieras.";

/**
 * The footer's small print: why a visitor gets it (§L), and an essential
 * send's note. Staging mail is marked by its From name and subject alone.
 */
export function comunicadoFooterNotes(opts: {
  essentialFestivalName?: string | null;
  visitors?: boolean;
}): string[] {
  const notes: string[] = opts.visitors ? [COMUNICADO_VISITOR_NOTE] : [];
  const festival = opts.essentialFestivalName?.trim();
  if (festival) notes.push(comunicadoEssentialNote(festival));
  return notes;
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

/** The inbox line under the subject: the sender's own, or the text's start. */
export function comunicadoPreheaderOf(
  previewText: string | null | undefined,
  blocks: AnnouncementBlock[],
) {
  return (
    previewText?.trim() ||
    comunicadoPreheader(announcementBlocksToText(blocks, { withUrls: false }))
  );
}

const bodyStyle = { ...styles.sectionWithBanner, textAlign: "left" as const };

const titleStyle = {
  ...styles.titleWithBanner,
  textAlign: "left" as const,
  fontWeight: 700,
};

/**
 * A comunicado (docs/IMPLEMENTATION-comunicados.md H3): one body for every
 * recipient, except the unsubscribe link. Sent as Productora Glitter, never
 * as the admin who wrote it, with no greeting and no sign-off: only what the
 * admin wrote.
 */
export default function ComunicadoEmail({
  title,
  blocks,
  actionLabel,
  actionPath,
  previewText,
  unsubscribeUrl,
  essentialFestivalName,
  visitors = false,
  baseUrl,
}: ComunicadoEmailProps) {
  const label = actionLabel?.trim();
  const actionUrl = label ? comunicadoActionUrl(actionPath, baseUrl) : null;

  return (
    <Html lang="es">
      <Head />
      <Preview>{comunicadoPreheaderOf(previewText, blocks)}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={bodyStyle}>
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
          notes={comunicadoFooterNotes({ essentialFestivalName, visitors })}
        />
      </Body>
    </Html>
  );
}

ComunicadoEmail.PreviewProps = {
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
  baseUrl: "http://localhost:3000",
} satisfies ComunicadoEmailProps;
