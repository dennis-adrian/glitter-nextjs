import { fetchUserProfile } from "@/app/api/users/actions";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";

import { fetchReservations } from "@/app/api/reservations/actions";
import { Button } from "@/app/components/ui/button";
import ReservationsTable from "@/app/components/reservations/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchFestivals } from "@/app/data/festivals/actions";
import { getFestivalsOptions } from "@/app/data/festivals/helpers";

const statusOptions = [
  { value: "pending", label: "Pendiente" },
  { value: "accepted", label: "Aceptada" },
  { value: "rejected", label: "Rechazada" },
];

export default async function Page() {
  // TODO: Improve how this route protecting works
  const user = await currentUser();
  const profile = await fetchUserProfile(user!.id);

  if (profile && profile.role !== "admin") {
    return (
      <div className="container flex min-h-full items-center justify-center p-4 md:p-6">
        <h1 className="font-smibold text-muted-foreground text-lg md:text-2xl">
          No tienes permisos para ver esta página
        </h1>
      </div>
    );
  }

  const reservations = await fetchReservations();
  const festivals = await fetchFestivals();
  const festivalOptions = getFestivalsOptions(festivals);
  if (reservations.length === 0) {
    return (
      <div className="container mx-auto min-h-full p-4 md:p-6">
        <h1 className="mb-2 text-3xl font-bold">Reservas</h1>
        <p>No hay reservas</p>
      </div>
    );
  }

  // TODO: Fix new reservation page and uncomment button
  return (
    <div className="container mx-auto min-h-full p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="mb-2 text-3xl font-bold">Reservas</h1>
        {/* <Button>
          <Link href="/dashboard/reservations/new">Nueva Reserva</Link>
        </Button> */}
      </div>

      <Tabs defaultValue="all" className="my-4">
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
          <TabsTrigger value="accepted">Confirmadas</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <ReservationsTable
            reservations={reservations}
            festivalOptions={festivalOptions}
          />
        </TabsContent>
        <TabsContent value="pending">
          <ReservationsTable
            festivalOptions={festivalOptions}
            reservations={reservations}
            status="pending"
            columnVisbility={{ status: false }}
          />
        </TabsContent>
        <TabsContent value="accepted">
          <ReservationsTable
            festivalOptions={festivalOptions}
            reservations={reservations}
            status="accepted"
            columnVisbility={{ status: false }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
