import Link from "next/link";
import { redirect } from "next/navigation";

import PromoCodeTable from "@/app/components/dashboard/programs/promo-code-table";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { fetchProgramPromoCodeDashboard } from "@/app/lib/programs/promo-code-admin-queries";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

export default async function ProgramPromoCodesPage() {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const rows = await fetchProgramPromoCodeDashboard();
  const totals = rows.reduce(
    (sum, row) => ({
      confirmed: sum.confirmed + row.confirmedUses,
      inProgress: sum.inProgress + row.inProgressUses,
    }),
    { confirmed: 0, inProgress: 0 },
  );

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Programas · atribución
          </p>
          <h1 className="text-2xl font-bold">Códigos promocionales</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Campañas de artistas e influencers, con usos confirmados y montos.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/programs/promo-codes/new">Nuevo código</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Usos confirmados" value={String(totals.confirmed)} />
        <Metric label="En proceso" value={String(totals.inProgress)} />
        <Metric label="Códigos" value={String(rows.length)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campañas</CardTitle>
        </CardHeader>
        <CardContent>
          <PromoCodeTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
