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
  activated: "Sanción activada",
  edited: "Sanción editada",
  extended: "Validez extendida",
  scope_changed: "Alcance modificado",
  infractions_changed: "Infracciones modificadas",
  festival_excluded: "Festival excluido del conteo",
  festival_restored: "Festival restaurado al conteo",
  reservation_eligibility_changed: "Elegibilidad de reserva actualizada",
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

export function getParticipantSanctionConsequence(input: {
  type: SanctionType;
  status: SanctionStatus;
}): string {
  if (input.type === "warning") {
    return "Esta advertencia es informativa y no bloquea tus reservas.";
  }

  const isCurrent = input.status === "active" || input.status === "scheduled";

  if (input.type === "ban") {
    return isCurrent
      ? "Mientras esta sanción esté vigente, no podés acceder a las reservas de los festivales incluidos en su alcance."
      : "Mientras estuvo vigente, esta sanción bloqueó el acceso a las reservas de los festivales incluidos en su alcance.";
  }

  return isCurrent
    ? "En cada festival calificado, podés acceder a las reservas cuando finaliza el período de espera indicado."
    : "Mientras estuvo vigente, esta sanción retrasó el acceso a las reservas de cada festival calificado.";
}
