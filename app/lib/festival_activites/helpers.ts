import { FestivalActivity } from "@/app/lib/festivals/definitions";

export type MaterialConfig = {
  label: string;
  noun: string;
  article: "el" | "la";
  pastParticiple: "aprobado" | "aprobada";
  /** Phrase after "subir" in participant-facing upload copy (voseo). */
  uploadTarget: string;
};

const MATERIAL_CONFIG: Record<FestivalActivity["type"], MaterialConfig> = {
  best_stand: {
    label: "imagen del stand",
    noun: "imagen",
    article: "la",
    pastParticiple: "aprobada",
    uploadTarget: "la imagen de tu stand",
  },
  sticker_print: {
    label: "diseño del sticker",
    noun: "sticker",
    article: "el",
    pastParticiple: "aprobado",
    uploadTarget: "el diseño de tu sticker",
  },
  stamp_passport: {
    label: "diseño del sello",
    noun: "sello",
    article: "el",
    pastParticiple: "aprobado",
    uploadTarget: "el diseño de tu sello",
  },
  festival_sticker: {
    label: "diseño del sticker",
    noun: "sticker",
    article: "el",
    pastParticiple: "aprobado",
    uploadTarget: "el diseño de tu sticker",
  },
  coupon_book: {
    label: "promoción",
    noun: "promoción",
    article: "la",
    pastParticiple: "aprobada",
    uploadTarget: "tu promoción",
  },
  sticker_hunt: {
    label: "diseño del sticker",
    noun: "sticker",
    article: "el",
    pastParticiple: "aprobado",
    uploadTarget: "el diseño de tu sticker",
  },
  stamp_card: {
    label: "diseño del sello",
    noun: "sello",
    article: "el",
    pastParticiple: "aprobado",
    uploadTarget: "el diseño de tu sello",
  },
};

const FALLBACK: MaterialConfig = {
  label: "material",
  noun: "material",
  article: "el",
  pastParticiple: "aprobado",
  uploadTarget: "tu material",
};

export function getMaterialConfig(
  activityType: FestivalActivity["type"],
): MaterialConfig {
  return MATERIAL_CONFIG[activityType] ?? FALLBACK;
}

/** Whether the deadline for uploading proof has passed. */
export function isProofUploadExpired(
  proofUploadLimitDate: FestivalActivity["proofUploadLimitDate"],
): boolean {
  return !!proofUploadLimitDate && new Date() > new Date(proofUploadLimitDate);
}

/** Copy for when the proof upload window has closed. */
export function getProofUploadExpiredMessage(
  activityType: FestivalActivity["type"],
): string {
  const { uploadTarget } = getMaterialConfig(activityType);
  return `El período para subir ${uploadTarget} ha finalizado`;
}

/** Short reminder while the upload window is still open. */
export function getProofUploadReminderMessage(
  activityType: FestivalActivity["type"],
): string {
  const { uploadTarget } = getMaterialConfig(activityType);
  return `No te olvidés de subir ${uploadTarget}`;
}

/**
 * Proof an activity type cannot run without. A stamp card puts a participant
 * on the map only once their stamp design is approved, so without image proof
 * no stand could ever carry its badge.
 */
const REQUIRED_PROOF_TYPE: Partial<
  Record<FestivalActivity["type"], NonNullable<FestivalActivity["proofType"]>>
> = {
  stamp_card: "image",
};

export const REQUIRED_PROOF_TYPE_MESSAGE =
  "La Tarjeta de Sellos necesita el diseño del sello de cada participante: elegí material de tipo «Imagen».";

export function getRequiredProofType(type: FestivalActivity["type"]) {
  return REQUIRED_PROOF_TYPE[type] ?? null;
}
