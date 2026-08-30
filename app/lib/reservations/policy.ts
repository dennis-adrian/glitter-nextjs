import type { ReservationErrorCode } from "@/app/lib/reservations/errors";

export type ReservationActor = {
  id: number;
  role: string;
};

export type SelfServiceFestivalSnapshot = {
  id: number;
  status: string;
  reservationsStartDate: Date;
  participantTermsEnabled: boolean;
};

export type SelfServiceProfileSnapshot = {
  id: number;
  status: string;
};

export type SelfServiceEnrollmentSnapshot = {
  type: string;
  status: string;
  termsVersionId: number | null;
};

export type SelfServiceEligibilityInput = {
  now: Date;
  actor: ReservationActor | null;
  targetProfileId: number;
  intent: "view" | "mutate";
  profile: SelfServiceProfileSnapshot | null;
  festival: SelfServiceFestivalSnapshot | null;
  publishedTermsVersionId: number | null;
  enrollment: SelfServiceEnrollmentSnapshot | null;
  sanctionBlocked: boolean;
  hasLiveSelfServiceReservation: boolean;
};

export type SelfServiceEligibilityResult =
  | { allowed: true }
  | { allowed: false; code: ReservationErrorCode };

export function isGlobalAdmin(
  actor: ReservationActor | null | undefined,
): boolean {
  return actor?.role === "admin";
}

export function isFestivalAdmin(
  actor: ReservationActor | null | undefined,
): boolean {
  return actor?.role === "festival_admin";
}

export function canViewAdminReservationData(
  actor: ReservationActor | null | undefined,
): boolean {
  return isGlobalAdmin(actor) || isFestivalAdmin(actor);
}

export function canMutateAdminReservations(
  actor: ReservationActor | null | undefined,
): boolean {
  return isGlobalAdmin(actor);
}

export function canActAsProfileOwner(
  actor: ReservationActor | null | undefined,
  profileId: number,
): boolean {
  return actor != null && actor.id === profileId;
}

export function profileCategoryForStandMatch(
  category: string | null | undefined,
): string | null {
  if (!category) return null;
  return category === "new_artist" ? "illustration" : category;
}

export function standMatchesParticipant(input: {
  standCategory: string;
  participationType: string;
  eligibleSubcategoryIds: readonly number[];
  profileCategory: string | null | undefined;
  profileParticipationType: string | null | undefined;
  profileSubcategoryIds: readonly number[];
}): boolean {
  const profileCategory = profileCategoryForStandMatch(input.profileCategory);
  if (!profileCategory) return false;
  if (input.standCategory !== profileCategory) return false;
  if (input.participationType !== input.profileParticipationType) return false;
  if (input.eligibleSubcategoryIds.length === 0) return true;
  return input.profileSubcategoryIds.some((id) =>
    input.eligibleSubcategoryIds.includes(id),
  );
}

export function evaluateSelfServiceEligibility(
  input: SelfServiceEligibilityInput,
): SelfServiceEligibilityResult {
  if (!input.actor) {
    return { allowed: false, code: "UNAUTHENTICATED" };
  }

  const ownsProfile = canActAsProfileOwner(input.actor, input.targetProfileId);
  if (!ownsProfile) {
    if (input.intent === "mutate" || !canViewAdminReservationData(input.actor)) {
      return { allowed: false, code: "UNAUTHORIZED" };
    }
  }

  if (!input.profile || input.profile.id !== input.targetProfileId) {
    return { allowed: false, code: "UNAUTHORIZED" };
  }

  if (input.profile.status !== "verified") {
    return { allowed: false, code: "PROFILE_NOT_VERIFIED" };
  }

  if (!input.festival || input.festival.status !== "active") {
    return { allowed: false, code: "FESTIVAL_NOT_ACTIVE" };
  }

  if (input.now.getTime() < input.festival.reservationsStartDate.getTime()) {
    return { allowed: false, code: "RESERVATIONS_NOT_OPEN" };
  }

  if (
    !input.festival.participantTermsEnabled ||
    input.publishedTermsVersionId == null
  ) {
    return { allowed: false, code: "TERMS_UNAVAILABLE" };
  }

  if (
    !input.enrollment ||
    input.enrollment.type !== "festival_participation" ||
    input.enrollment.status !== "accepted"
  ) {
    return { allowed: false, code: "NOT_ENROLLED" };
  }

  if (input.enrollment.termsVersionId !== input.publishedTermsVersionId) {
    return { allowed: false, code: "TERMS_STALE" };
  }

  if (input.sanctionBlocked) {
    return { allowed: false, code: "SANCTION_BLOCKED" };
  }

  if (input.hasLiveSelfServiceReservation) {
    return { allowed: false, code: "ALREADY_RESERVED" };
  }

  return { allowed: true };
}

export function mapPartnerEligibilityCode(
  code: ReservationErrorCode,
): ReservationErrorCode {
  if (code === "ALREADY_RESERVED") return "PARTNER_ALREADY_RESERVED";
  if (
    code === "UNAUTHENTICATED" ||
    code === "UNAUTHORIZED" ||
    code === "HOLD_EXPIRED" ||
    code === "HOLD_NOT_OWNED" ||
    code === "STAND_NOT_FOUND" ||
    code === "STAND_WRONG_FESTIVAL" ||
    code === "STAND_NOT_ELIGIBLE" ||
    code === "STAND_UNAVAILABLE" ||
    code === "INVOICE_NOT_OWNED" ||
    code === "INVOICE_NOT_PENDING" ||
    code === "PAYMENT_ALREADY_SUBMITTED" ||
    code === "VALIDATION"
  ) {
    return "PARTNER_NOT_ELIGIBLE";
  }
  return "PARTNER_NOT_ELIGIBLE";
}

export function canSubmitInvoiceSettlement(input: {
  actor: ReservationActor | null;
  invoiceOwnerUserId: number;
}): boolean {
  if (!input.actor) return false;
  if (isGlobalAdmin(input.actor)) return true;
  return input.actor.id === input.invoiceOwnerUserId;
}

export function canViewInvoiceRecord(input: {
  actor: ReservationActor | null;
  invoiceOwnerUserId: number;
  participantUserIds: readonly number[];
}): boolean {
  if (!input.actor) return false;
  if (canViewAdminReservationData(input.actor)) return true;
  if (input.actor.id === input.invoiceOwnerUserId) return true;
  return input.participantUserIds.includes(input.actor.id);
}

export function canMutateReservationCollaborators(input: {
  actor: ReservationActor | null;
  participantUserIds: readonly number[];
}): boolean {
  if (!input.actor) return false;
  if (isGlobalAdmin(input.actor)) return true;
  if (isFestivalAdmin(input.actor)) return false;
  return input.participantUserIds.includes(input.actor.id);
}

export function isLiveSelfServiceSource(source: string): boolean {
  return source === "user_reservation" || source === "legacy_unknown";
}
