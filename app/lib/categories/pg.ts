import { hasPgErrorCode } from "@/app/lib/errors/postgres";

export function isUniqueViolation(error: unknown): boolean {
  return hasPgErrorCode(error, "23505");
}
