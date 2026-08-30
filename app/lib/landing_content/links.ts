import { isAllowedRemoteImageHost } from "@/app/lib/images/remote-hosts";
import { assertValidHref } from "@/app/lib/marketing_banners/validate-href";

export function normalizeLandingHref(value: string): string | null {
  const result = assertValidHref(value.trim());
  return result.ok ? result.href : null;
}

export function normalizeLandingImageHref(value: string): string | null {
  const result = assertValidHref(value.trim());
  if (!result.ok) return null;

  const href = result.href;
  if (href.startsWith("/") && !href.startsWith("//")) {
    return href;
  }

  try {
    const url = new URL(href);
    if (url.protocol !== "https:") return null;
    return isAllowedRemoteImageHost(url.hostname) ? href : null;
  } catch {
    return null;
  }
}
