import { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchActiveFestivalBase } from "../lib/festivals/actions";

export const metadata: Metadata = {
  title: "Próximo Evento",
  description: "Participa en el próximo evento de la Productora Glitter",
};

export default async function Page() {
  const festival = await fetchActiveFestivalBase();

  // With nothing in progress, the festivals page offers the past editions.
  redirect(festival ? `/festivals/${festival.id}` : "/festivals");
}
