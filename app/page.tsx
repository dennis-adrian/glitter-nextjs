import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";

import Landing from "@/app/components/landing/landing";
import LandingSkeleton from "@/app/components/landing/skeleton";
import {
  getLandingDraftOrFallback,
  getPublishedLandingContent,
} from "@/app/lib/landing_content/data";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}): Promise<Metadata> {
  const preview = (await searchParams).preview === "landing-draft";
  const profile = await getCurrentUserProfile();
  const canPreview =
    profile?.role === "admin" || profile?.role === "festival_admin";
  if (preview && canPreview) {
    return { robots: { index: false, follow: false } };
  }
  const content = await getPublishedLandingContent();
  return {
    title: content.seo.title,
    description: content.seo.description,
    openGraph: content.seo.shareImageUrl
      ? { images: [content.seo.shareImageUrl] }
      : undefined,
    ...(preview ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const preview = (await searchParams).preview === "landing-draft";
  const profile = await getCurrentUserProfile();
  const canPreview =
    profile?.role === "admin" || profile?.role === "festival_admin";
  if (preview && canPreview) {
    const draft = await getLandingDraftOrFallback();
    return (
      <Suspense fallback={<LandingSkeleton />}>
        <Landing content={draft.content} preview />
      </Suspense>
    );
  }
  if (profile) {
    redirect("/portal");
  }

  return (
    <>
      <Suspense fallback={<LandingSkeleton />}>
        <Landing />
      </Suspense>
    </>
  );
}
