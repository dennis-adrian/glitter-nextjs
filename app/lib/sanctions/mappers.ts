import type {
  SanctionEventType,
  SanctionFestivalScope,
  SanctionStatus,
  SanctionType,
  ValidityUnit,
} from "@/app/lib/sanctions/definitions";

export const sanctionEventTypeLabel: Record<SanctionEventType, string> = {
  created: "Sanción creada",
  approved: "Sanción aprobada",
  edited: "Sanción editada",
  extended: "Validez extendida",
  scope_changed: "Alcance modificado",
  infractions_changed: "Infracciones modificadas",
  expired: "Sanción expirada",
  revoked: "Sanción revocada",
};

export const sanctionStatusLabel: Record<SanctionStatus, string> = {
  scheduled: "Programada",
  active: "Activa",
  expired: "Expirada",
  revoked: "Revocada",
};

export const sanctionTypeLabel: Record<SanctionType, string> = {
  warning: "Advertencia",
  ban: "Ban",
  reservation_delay: "Retraso de reserva",
};

export const sanctionFestivalScopeLabel: Record<SanctionFestivalScope, string> =
  {
    global: "Global",
    glitter: "Glitter",
    festicker: "Festicker",
    twinkler: "Twinkler",
  };

export const validityUnitLabel: Record<ValidityUnit, string> = {
  minutes: "Minutos",
  hours: "Horas",
  days: "Días",
  months: "Meses",
  years: "Años",
  festivals: "Festivales",
  indefinitely: "Indefinida",
};

export function formatSanctionValidity(input: {
  validityDuration: number | null;
  validityUnit: ValidityUnit;
}): string {
  if (input.validityUnit === "indefinitely") {
    return validityUnitLabel.indefinitely;
  }
  if (input.validityDuration == null) {
    return validityUnitLabel[input.validityUnit];
  }
  return `${input.validityDuration} ${validityUnitLabel[input.validityUnit].toLowerCase()}`;
}
