import CouponBookDraftPrintDocument from "@/app/components/festivals/festival_activities/coupon-book-draft-print-document";
import { getCouponBookPrintSession } from "@/app/lib/festival_activites/coupon-book-print-session";
import { resolvePdfCanvasConfig } from "@/app/lib/festival_activites/coupon-book-print-config";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toSearchParams(
  params: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const mapped = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) mapped.append(key, item);
      continue;
    }
    if (typeof value === "string") mapped.set(key, value);
  }
  return mapped;
}

export default async function CouponBookDraftPrintPage({
  params,
  searchParams,
}: PageProps) {
  const profile = await getCurrentUserProfile();
  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "festival_admin")
  ) {
    notFound();
  }

  const [{ sessionId }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const session = await getCouponBookPrintSession(sessionId);
  if (!session) notFound();

  const pdfCanvas = resolvePdfCanvasConfig(
    toSearchParams(resolvedSearchParams),
  );

  return (
    <CouponBookDraftPrintDocument
      draft={session.draft}
      pdfCanvas={pdfCanvas}
      exportScope={session.exportScope}
    />
  );
}
