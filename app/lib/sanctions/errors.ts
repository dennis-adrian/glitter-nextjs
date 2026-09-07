import type { SanctionMutationResult } from "@/app/lib/sanctions/definitions";

type SanctionErrorCode = NonNullable<
  Extract<SanctionMutationResult, { success: false }>["code"]
>;

const DOMAIN_ERROR_CODES = new Set<SanctionErrorCode>([
  "not_found",
  "validation",
  "conflict",
]);

export function sanctionDomainError(
  message: string,
  code: Exclude<SanctionErrorCode, "unauthorized">,
) {
  return Object.assign(new Error(message), { code });
}

function findErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  if ("cause" in error) {
    return findErrorCode(error.cause);
  }

  return undefined;
}

export function mapSanctionMutationError(
  error: unknown,
  fallback: string,
): SanctionMutationResult {
  const errorCode = findErrorCode(error);

  if (
    errorCode &&
    DOMAIN_ERROR_CODES.has(errorCode as SanctionErrorCode) &&
    error instanceof Error
  ) {
    return {
      success: false,
      message: error.message,
      code: errorCode as Exclude<SanctionErrorCode, "unauthorized">,
    };
  }

  if (errorCode === "23505") {
    return {
      success: false,
      message:
        "Una de las infracciones ya está vinculada a otra sanción. Actualizá la página e intentá nuevamente.",
      code: "conflict",
    };
  }

  if (errorCode === "23503" || errorCode === "23514") {
    return {
      success: false,
      message:
        "Los datos ya no son válidos. Actualizá la página e intentá nuevamente.",
      code: "validation",
    };
  }

  return { success: false, message: fallback };
}
