import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";

import InstalledAppLandingGate from "@/app/components/landing/installed-app-landing-gate";
import Landing from "@/app/components/landing/landing";
import LandingSkeleton from "@/app/components/landing/skeleton";
import {
  getLandingDraftOrFallback,
  getPublishedLandingContent,
} from "@/app/lib/landing_content/data";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{ preview?: string }>;
};

async function getLandingPreviewState(searchParams: HomeProps["searchParams"]) {
  const preview = (await searchParams).preview === "landing-draft";
  const profile = await getCurrentUserProfile();
  const canPreview =
    profile?.role === "admin" || profile?.role === "festival_admin";
  return { preview, canPreview, profile };
}

export async function generateMetadata({
  searchParams,
}: HomeProps): Promise<Metadata> {
  const { preview, canPreview } = await getLandingPreviewState(searchParams);
  const content =
    preview && canPreview
      ? (await getLandingDraftOrFallback()).content
      : await getPublishedLandingContent();
  return {
    title: content.seo.title,
    description: content.seo.description,
    openGraph: content.seo.shareImageUrl
      ? { images: [content.seo.shareImageUrl] }
      : undefined,
    ...(preview ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function Home({ searchParams }: HomeProps) {
  const { preview, canPreview, profile } =
    await getLandingPreviewState(searchParams);
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

  const landing = (
    <Suspense fallback={<LandingSkeleton />}>
      <Landing />
    </Suspense>
  );

  // The installed app is for people with an account: without a session it
  // shows sign in instead of the marketing landing.
  const { userId } = await auth();
  if (userId) return landing;

  return <InstalledAppLandingGate>{landing}</InstalledAppLandingGate>;
}
