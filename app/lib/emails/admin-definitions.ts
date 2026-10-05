import { z } from "zod";

import { EMAIL_TOPICS, type EmailTopic } from "@/app/lib/emails/topics";

/**
 * The admin page of addresses bulk mail skips: what it lists and what its
 * URL may say. Shared by the page, its queries and its client components.
 */

export const EMAIL_ADMIN_TABS = ["blocked", "unsubscribed", "lifted"] as const;
export type EmailAdminTab = (typeof EMAIL_ADMIN_TABS)[number];

export const EMAIL_ADMIN_TAB_LABELS: Record<EmailAdminTab, string> = {
  blocked: "Bloqueados",
  unsubscribed: "Bajas",
  lifted: "Desbloqueados",
};

/** One line under each tab: what being on it means. */
export const EMAIL_ADMIN_TAB_DESCRIPTIONS: Record<EmailAdminTab, string> = {
  blocked:
    "No reciben ningún correo masivo: el correo rebotó o la persona lo marcó como spam.",
  unsubscribed:
    "Pidieron dejar de recibir un tipo de correo masivo, o todos. Los demás siguen llegando.",
  lifted: "Estuvieron bloqueados y se desbloquearon, en Resend o desde aquí.",
};

export const EMAIL_ADMIN_PAGE_SIZE = 25;

// Every field falls back instead of failing: an admin may edit or bookmark
// the URL, and a stale value should show the default list, not a 404.
export const EmailAdminSearchParamsSchema = z.object({
  tab: z.enum(EMAIL_ADMIN_TABS).catch("blocked"),
  query: z.string().trim().max(200).catch(""),
  limit: z.coerce.number().int().min(1).max(200).catch(EMAIL_ADMIN_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).catch(0),
});
export type EmailAdminSearchParams = z.infer<
  typeof EmailAdminSearchParamsSchema
>;

/** Someone in our records whose address this is. */
export type EmailPerson =
  | { kind: "user"; id: number; name: string | null }
  | { kind: "visitor"; name: string | null };

/** The admin behind a change, when an admin made it. */
export type EmailAdminActor = { id: number; name: string };

type EmailRowBase = {
  /** The normalized address: what every action here is keyed by. */
  emailKey: string;
  people: EmailPerson[];
};

export type BlockedEmailRow = EmailRowBase & {
  kind: "blocked";
  reason: "bounce" | "complaint";
  /** What the receiving server answered, for a bounce. */
  detail: string | null;
  /** When it was blocked: the newest event that did it. */
  blockedAt: Date;
};

export type UnsubscribedEmailRow = EmailRowBase & {
  kind: "unsubscribed";
  topic: EmailTopic;
  unsubscribedAt: Date;
  /** Null when the person did it from one of our emails. */
  createdBy: EmailAdminActor | null;
};

export type LiftedEmailRow = EmailRowBase & {
  kind: "lifted";
  reason: "bounce" | "complaint";
  detail: string | null;
  liftedAt: Date;
  /** Null when it was lifted in Resend. */
  liftedBy: EmailAdminActor | null;
};

export type EmailAdminRow =
  | BlockedEmailRow
  | UnsubscribedEmailRow
  | LiftedEmailRow;

export type EmailAdminCounts = {
  bounced: number;
  complained: number;
  unsubscribed: number;
  lifted: number;
};

export type EmailAdminPage = {
  rows: EmailAdminRow[];
  /** Rows matching the search in this tab, across every page. */
  total: number;
  counts: EmailAdminCounts;
};

export type EmailAdminActionResult = {
  success: boolean;
  message: string;
  /** Done, but with something the admin still has to do or know. */
  warning?: boolean;
};

export const AddUnsubscribeSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { error: "Escribe el correo" })
    .max(254)
    .pipe(z.email({ error: "El correo no es válido" })),
  topic: z.enum(EMAIL_TOPICS),
});
export type AddUnsubscribeInput = z.input<typeof AddUnsubscribeSchema>;
