import type { Metadata } from "next";
import { redirect } from "next/navigation";

import FastPassNavTabs from "@/app/components/fast-pass/admin/fast-pass-nav-tabs";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { requireFastPassFestivalAdmin } from "@/app/lib/fast-pass/admin-auth";
import { parseRouteId } from "@/app/lib/fast-pass/route-params";

export const metadata: Metadata = {
  title: "Pase Rápido",
};

export default async function FastPassLayout(props: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const festivalId = parseRouteId(params.id);
  if (festivalId === null) redirect("/");

  const admin = await requireFastPassFestivalAdmin(festivalId);
  if (!admin) redirect("/");

  await requireFeatureEnabled("fast_pass");

  return (
    <div className="container min-h-full space-y-4 p-4 md:px-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold md:text-3xl">Pase Rápido</h1>
        <p className="text-sm text-muted-foreground">
          Gestión de acceso prioritario por día de festival
        </p>
      </header>
      <FastPassNavTabs festivalId={festivalId} />
      <div>{props.children}</div>
    </div>
  );
}
