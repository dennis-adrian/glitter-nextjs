import { assertValidHref } from "@/app/lib/marketing_banners/validate-href";

export function normalizeLandingHref(value: string): string | null {
  const result = assertValidHref(value.trim());
  return result.ok ? result.href : null;
}
