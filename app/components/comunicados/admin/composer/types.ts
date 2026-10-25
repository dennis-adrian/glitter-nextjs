import type {
  ComunicadoAudience,
  ComunicadoDraftInput,
} from "@/app/lib/comunicados/definitions";
import type {
  AudienceCount,
  DistributionListKind,
} from "@/app/lib/distribution_lists/definitions";

/**
 * What the composer page hands its client side: plain values only, read on
 * the server for one draft (docs/IMPLEMENTATION-comunicados.md G4).
 */

/** "Confirmados · <festival>", with today's count. Newest first. */
export type ComposerFestivalOption = {
  festivalId: number;
  name: string;
  count: AudienceCount;
};

/** A saved list the picker offers; `count` is null for an unreadable filter. */
export type ComposerListOption = {
  id: number;
  name: string;
  kind: DistributionListKind;
  count: AudienceCount | null;
};

/** Someone picked by name, as their chip shows them. */
export type ComposerPerson = {
  id: number;
  name: string;
  email: string;
  imageUrl: string | null;
  isAdmin: boolean;
  /** Why they would not receive it (B5), or null. */
  skipReason: string | null;
};

/** Names for the chips, by id: what the audience alone cannot say. */
export type ComposerSourceNames = {
  festivals: Record<number, string>;
  lists: Record<
    number,
    { name: string; kind: DistributionListKind; archived: boolean }
  >;
  people: Record<number, ComposerPerson>;
};

export type ComposerDraft = {
  id: number;
  version: number;
  title: string;
  doc: unknown[];
  actionLabel: string | null;
  actionPath: string | null;
  sendEmail: boolean;
  sendPush: boolean;
  audience: ComunicadoAudience;
  /** The stored audience no longer parsed: it opens empty. */
  audienceUnreadable: boolean;
  essential: boolean;
  essentialReason: string | null;
  /** The sentence a refused release left (E4), while it stays a draft. */
  scheduleMissedDetail: string | null;
  scheduleMissed: boolean;
};

/** The composer's editable state. */
export type ComposerFields = {
  title: string;
  doc: unknown[];
  /** "Agregar un botón". */
  actionEnabled: boolean;
  actionLabel: string;
  actionPath: string;
  sendEmail: boolean;
  sendPush: boolean;
  audience: ComunicadoAudience;
  essential: boolean;
  essentialReason: string;
};

/** What an autosave stores, from the composer's state. */
export function draftFieldsOf(
  fields: ComposerFields,
): Omit<ComunicadoDraftInput, "comunicadoId" | "expectedVersion"> {
  return {
    title: fields.title,
    doc: fields.doc,
    // An empty pair still says the switch is on, so it reopens on.
    actionLabel: fields.actionEnabled ? fields.actionLabel : null,
    actionPath: fields.actionEnabled ? fields.actionPath : null,
    sendEmail: fields.sendEmail,
    sendPush: fields.sendPush,
    audience: fields.audience,
    essential: fields.essential,
    essentialReason: fields.essential ? fields.essentialReason : null,
  };
}

export function composerFieldsOf(draft: ComposerDraft): ComposerFields {
  return {
    title: draft.title,
    doc: draft.doc,
    actionEnabled: draft.actionLabel !== null || draft.actionPath !== null,
    actionLabel: draft.actionLabel ?? "",
    actionPath: draft.actionPath ?? "",
    sendEmail: draft.sendEmail,
    sendPush: draft.sendPush,
    audience: draft.audience,
    essential: draft.essential,
    essentialReason: draft.essentialReason ?? "",
  };
}
