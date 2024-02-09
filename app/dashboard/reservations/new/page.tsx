import { CreateReservationForm } from "@/app/components/reservations/create-form";
import Breadcrumbs from "@/app/components/ui/breadcrumbs";

export default async function Page() {
  return (
    <div className="container px-4 md:px-6 m-auto">
      <Breadcrumbs
        breadcrumbs={[
          { label: "Reservas", href: "/dashboard/reservations" },
          {
            label: "Nueva Reserva",
            href: `/dashboard/reservations/new`,
            active: true,
          },
        ]}
      />
      <h1 className="mb-2 text-3xl font-bold">Nueva Reserva</h1>

      <CreateReservationForm />
    </div>
  );
}
