import type { Metadata } from "next";
import { notFound } from "next/navigation";

import CredentialsScreen from "@/app/components/festivals/credentials/credentials-screen";
import {
  parseCredentialFilters,
  parseCredentialTab,
} from "@/app/lib/credentials/definitions";
import { loadCredentialsPage } from "@/app/lib/credentials/load-page";
import { fetchCredentialsSnapshot } from "@/app/lib/credentials/queries";
import { db } from "@/db";

export const metadata: Metadata = { title: "Credenciales" };

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * How many credentials to produce for the festival and with which names
 * (docs/PLAN-credenciales.md).
 */
export default async function CredentialsPage({ params, searchParams }: PageProps) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const { profile, festivalId } = await loadCredentialsPage(id);
  const data = await fetchCredentialsSnapshot(db, festivalId);
  if (!data) notFound();

  return (
    <CredentialsScreen
      festivalId={festivalId}
      tab={parseCredentialTab(search.tab)}
      data={data}
      initialFilters={parseCredentialFilters(search)}
      isAdmin={profile.role === "admin"}
    />
  );
}
