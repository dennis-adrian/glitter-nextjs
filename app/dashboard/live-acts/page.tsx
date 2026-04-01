import { BanIcon, CheckIcon, ClockIcon, HourglassIcon } from "lucide-react";

import TotalsCard from "@/app/components/dashboard/totals/card";
import { columns, columnTitles } from "@/app/components/live_acts/columns";
import { DataTable } from "@/components/ui/data_table/data-table";
import { fetchLiveActs } from "@/app/lib/live_acts/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

const statusOptions = [
  { value: "pending", label: "Pendientes" },
  { value: "backlog", label: "En lista de espera" },
  { value: "approved", label: "Aprobados" },
  { value: "rejected", label: "Rechazados" },
];

const categoryOptions = [
  { value: "music", label: "Música" },
  { value: "dance", label: "Danza" },
  { value: "talk", label: "Charla" },
];

export default async function Page() {
  const profile = await getCurrentUserProfile();

  if (profile && profile.role !== "admin") {
    return (
      <div className="container flex min-h-full items-center justify-center p-4 md:p-6">
        <h1 className="text-muted-foreground text-lg font-semibold md:text-2xl">
          No tienes permisos para ver esta página
        </h1>
      </div>
    );
  }

  const liveActs = await fetchLiveActs();

  const pending = liveActs.filter((a) => a.status === "pending");
  const backlog = liveActs.filter((a) => a.status === "backlog");
  const approved = liveActs.filter((a) => a.status === "approved");
  const rejected = liveActs.filter((a) => a.status === "rejected");

  return (
    <div className="container mx-auto min-h-full p-4 md:p-6">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">Actos en vivo</h1>

      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
        <TotalsCard
          amount={pending.length}
          title="pendientes"
          description="Sin revisar"
          Icon={HourglassIcon}
        />
        <TotalsCard
          amount={backlog.length}
          title="en lista de espera"
          description="Revisados, sin decisión"
          Icon={ClockIcon}
        />
        <TotalsCard
          amount={approved.length}
          title="aprobados"
          description="Actos aprobados"
          Icon={CheckIcon}
        />
        <TotalsCard
          amount={rejected.length}
          title="rechazados"
          description="Actos rechazados"
          Icon={BanIcon}
        />
      </div>

      <DataTable
        columns={columns}
        columnTitles={columnTitles}
        data={liveActs}
        filters={[
          { columnId: "status", options: statusOptions },
          { columnId: "category", options: categoryOptions },
        ]}
      />
    </div>
  );
}
