import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  AlertCircleIcon,
  ClipboardListIcon,
  CoinsIcon,
  LibraryBigIcon,
  StoreIcon,
  UserCheckIcon,
} from "lucide-react";

import AdminFestivalCard from "@/app/components/home/admin-festival-card";
import AdminReviewQueues, {
  type ReviewQueue,
} from "@/app/components/home/admin-review-queues";
import {
  loadReviewQueues,
  type ReviewQueueKey,
} from "@/app/lib/admin/review-queues";
import { getActiveFestivalBase } from "@/app/lib/festivals/helpers";
import { fetchFestivalOverviewCounts } from "@/app/lib/festivals/overview";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export const metadata: Metadata = {
  title: "Inicio",
};

const QUEUE_COPY: Record<
  ReviewQueueKey,
  Pick<ReviewQueue, "label" | "detail" | "icon">
> = {
  reservations: {
    label: "Cobros de reservas",
    detail: "En revisión, parciales o atrasados",
    icon: ClipboardListIcon,
  },
  profiles: {
    label: "Solicitudes de perfil",
    detail: "Perfiles completos esperando revisión",
    icon: UserCheckIcon,
  },
  credits: {
    label: "Recargas de créditos",
    detail: "Comprobantes por revisar",
    icon: CoinsIcon,
  },
  orders: {
    label: "Pagos de la Tiendita",
    detail: "Comprobantes por verificar",
    icon: StoreIcon,
  },
  programs: {
    label: "Pagos de programas",
    detail: "Comprobantes por revisar o con cambios pedidos",
    icon: LibraryBigIcon,
  },
  infractions: {
    label: "Infracciones pendientes",
    detail: "Sin revisar todavía",
    icon: AlertCircleIcon,
  },
};

/**
 * Inicio for the team: what waits for review, queue by queue, and the
 * festival in progress with its figures. Staff do not take part in festivals,
 * so nothing here is the participant's Inicio.
 */
export default async function AdminHomePage() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/sign_in");
  // The dashboard layout checks this too, but a layout does not run again on
  // a client navigation inside it: the counts are staff's only.
  if (profile.role !== "admin" && profile.role !== "festival_admin") {
    redirect("/portal");
  }
  const role = profile.role;

  const festival = await getActiveFestivalBase();
  const [queues, counts] = await Promise.all([
    loadReviewQueues({ role, activeFestivalId: festival?.id ?? null }),
    festival ? fetchFestivalOverviewCounts(festival.id) : Promise.resolve(null),
  ]);

  return (
    <div className="container max-w-6xl overflow-y-auto p-4 md:p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <header>
            <span className="text-sm font-medium text-brand-primary">
              {role === "admin" ? "Administración" : "Admin de festival"}
            </span>
            <h1 className="font-display text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
              Hola, {profile.firstName ?? profile.displayName ?? "equipo"}
            </h1>
          </header>
          <AdminReviewQueues
            queues={queues.map((queue) => ({
              ...queue,
              ...QUEUE_COPY[queue.key],
            }))}
          />
        </div>
        {festival && counts ? (
          <div className="lg:pt-16">
            <AdminFestivalCard festival={festival} counts={counts} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
