import { infractionSeverityEnum, infractionStatusEnum } from "@/db/schema";

export const infractionSeverityLabel: Record<
  (typeof infractionSeverityEnum.enumValues)[number],
  string
> = {
  low: "Severidad Baja",
  medium: "Severidad Media",
  high: "Severidad Alta",
  critical: "Severidad Crítica",
};

export const infractionStatusLabel: Record<
  (typeof infractionStatusEnum.enumValues)[number],
  string
> = {
  pending: "Pendiente",
  under_review: "En revisión",
  resolved: "Resuelta",
  voided: "Anulada",
};

/** @deprecated Prefer infractionStatusLabel with InfractionStatus */
export const getInfractionStatusLabel = (
  statusOrHandled: (typeof infractionStatusEnum.enumValues)[number] | boolean,
) => {
  if (typeof statusOrHandled === "boolean") {
    return statusOrHandled
      ? infractionStatusLabel.resolved
      : infractionStatusLabel.pending;
  }
  return infractionStatusLabel[statusOrHandled];
};

export function getPriorNoticeLabel(input: {
  userGaveNotice: boolean;
  gaveNoticeAt: Date | null;
}): string {
  if (!input.userGaveNotice) {
    return "Sin aviso previo del participante";
  }
  if (!input.gaveNoticeAt) {
    return "Con aviso previo (fecha no registrada)";
  }
  return "Con aviso previo del participante";
}

export function participantDisplayName(user: {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  if (user.displayName?.trim()) return user.displayName.trim();
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return fullName || user.email;
}
