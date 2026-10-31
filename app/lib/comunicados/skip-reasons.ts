import { PARTICIPANT_SKIP_REASONS } from "@/app/lib/participants/recipient-eligibility";

/**
 * Why someone in a comunicado's audience does not receive it
 * (docs/IMPLEMENTATION-comunicados.md B5), as stored in `skipped_reason`: the
 * participant rule's labels plus the preview narrowing. Client-safe, for the
 * composer's "Ver por qué" and the report.
 */
export const COMUNICADO_SKIP_REASONS = {
  ...PARTICIPANT_SKIP_REASONS,
  staging: "Entorno de prueba: no se envía a listas",
} as const;
export type ComunicadoSkipReasonKey = keyof typeof COMUNICADO_SKIP_REASONS;
export type ComunicadoSkipReasonLabel =
  (typeof COMUNICADO_SKIP_REASONS)[ComunicadoSkipReasonKey];

/** B5 row 8: written by a retraction to rows still pending, never judged. */
export const COMUNICADO_RETRACTED_SKIP_REASON = "Retirado antes de enviarse";
/** How a person entered the audience, in the report's Origen column (G6). */
export const COMUNICADO_SOURCE_LABELS = {
  list: "Lista",
  person: "Por nombre",
  staging_admin: "Admin de prueba",
} as const;
export type ComunicadoRecipientSource = keyof typeof COMUNICADO_SOURCE_LABELS;
