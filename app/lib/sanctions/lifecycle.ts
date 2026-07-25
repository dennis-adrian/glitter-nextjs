import type {
  SanctionStatus,
  ValidityUnit,
} from "@/app/lib/sanctions/definitions";
import { DateTime } from "luxon";

const CALENDAR_UNITS = new Set<ValidityUnit>([
  "minutes",
  "hours",
  "days",
  "months",
  "years",
]);

export function isCalendarValidityUnit(unit: ValidityUnit): boolean {
  return CALENDAR_UNITS.has(unit);
}

export function calculateSanctionEndsAt(
  startsAt: Date,
  validityDuration: number | null | undefined,
  validityUnit: ValidityUnit,
): Date | null {
  if (validityUnit === "indefinitely" || validityUnit === "festivals") {
    return null;
  }

  if (validityDuration == null || validityDuration <= 0) {
    throw new Error(
      "La duración de validez debe ser un entero positivo para unidades de calendario",
    );
  }

  const start = DateTime.fromJSDate(startsAt);
  if (!start.isValid) {
    throw new Error("Fecha de inicio de sanción inválida");
  }

  switch (validityUnit) {
    case "minutes":
      return start.plus({ minutes: validityDuration }).toJSDate();
    case "hours":
      return start.plus({ hours: validityDuration }).toJSDate();
    case "days":
      return start.plus({ days: validityDuration }).toJSDate();
    case "months":
      return start.plus({ months: validityDuration }).toJSDate();
    case "years":
      return start.plus({ years: validityDuration }).toJSDate();
    default:
      return null;
  }
}

export function resolveSanctionStatusOnApproval(
  startsAt: Date,
  endsAt: Date | null,
  now: Date,
): Extract<SanctionStatus, "scheduled" | "active" | "expired"> {
  if (endsAt && endsAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return startsAt.getTime() > now.getTime() ? "scheduled" : "active";
}

export function isSanctionValidityExtension(
  previous: {
    validityDuration: number | null;
    validityUnit: ValidityUnit;
    endsAt: Date | null;
  },
  next: {
    validityDuration: number | null;
    validityUnit: ValidityUnit;
    endsAt: Date | null;
  },
): boolean {
  if (previous.validityUnit === next.validityUnit) {
    if (
      next.validityUnit === "festivals" &&
      previous.validityDuration != null &&
      next.validityDuration != null
    ) {
      return next.validityDuration > previous.validityDuration;
    }

    if (next.validityUnit === "indefinitely") {
      return false;
    }
  }

  if (next.validityUnit === "indefinitely") {
    return previous.validityUnit !== "indefinitely";
  }

  if (next.endsAt) {
    return (
      !previous.endsAt || next.endsAt.getTime() > previous.endsAt.getTime()
    );
  }

  return false;
}

export function canRevokeSanction(status: SanctionStatus): boolean {
  return status === "scheduled" || status === "active";
}

export function canEditSanction(status: SanctionStatus): boolean {
  return status === "scheduled" || status === "active";
}
