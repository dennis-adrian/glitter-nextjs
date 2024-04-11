import { Metadata } from "next";

import { fetchActiveFestivalBase } from "@/app/data/festivals/actions";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Próximo Evento",
  description: "Participa en el próximo evento de Festival Glitter",
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
