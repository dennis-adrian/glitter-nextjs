import { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchActiveFestivalBase } from "../lib/festivals/actions";

export const metadata: Metadata = {
  title: "Próximo Evento",
  description: "Participa en el próximo evento de la Productora Glitter",
};

export default async function Page() {
  const festival = await fetchActiveFestivalBase();

  if (!festival) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-center text-2xl font-bold text-gray-500">
          No hay eventos activos
        </p>
      </div>
    );
  }

  redirect(`/festivals/${festival.id}`);
}
