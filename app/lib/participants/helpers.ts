import { BaseProfile } from "@/app/api/users/definitions";
import {
  isParticipantStatus,
  isProfileRequestStatus,
  PARTICIPANT_STATUSES,
  PROFILE_REQUEST_STATUSES,
} from "@/app/lib/participants/definitions";

export const PARTICIPANT_SUPPORT_EMAIL = "soporte@productoraglitter.com";

type PauseEligibilityInput = {
  status: BaseProfile["status"];
  role: BaseProfile["role"];
  participatedRecently: boolean;
};

export function getPauseEligibilityReason({
  status,
  role,
  participatedRecently,
}: PauseEligibilityInput): {
  isPauseEligible: boolean;
  pauseEligibilityReason: string;
} {
  if (status === "paused") {
    return { isPauseEligible: false, pauseEligibilityReason: "Ya pausado" };
  }

  if (status === "banned") {
    return { isPauseEligible: false, pauseEligibilityReason: "Vetado" };
  }

  if (role === "admin" || role === "festival_admin") {
    return {
      isPauseEligible: false,
      pauseEligibilityReason: "Cuenta de administrador",
    };
  }

  if (status !== "verified") {
    return {
      isPauseEligible: false,
      pauseEligibilityReason: "No es participante activo",
    };
  }

  if (participatedRecently) {
    return {
      isPauseEligible: false,
      pauseEligibilityReason: "Activo reciente",
    };
  }

  return { isPauseEligible: true, pauseEligibilityReason: "Elegible" };
}

export function isParticipantStatusGroup(
  status: BaseProfile["status"],
): boolean {
  return isParticipantStatus(status);
}

export function isProfileRequestStatusGroup(
  status: BaseProfile["status"],
): boolean {
  return isProfileRequestStatus(status);
}

export function filterParticipantStatuses(
  statuses?: BaseProfile["status"][],
): BaseProfile["status"][] {
  if (!statuses?.length) {
    return [...PARTICIPANT_STATUSES];
  }

  return statuses.filter((status) => isParticipantStatus(status));
}

export function filterProfileRequestStatuses(
  statuses?: BaseProfile["status"][],
): BaseProfile["status"][] {
  if (!statuses?.length) {
    return [...PROFILE_REQUEST_STATUSES];
  }

  return statuses.filter((status) => isProfileRequestStatus(status));
}
