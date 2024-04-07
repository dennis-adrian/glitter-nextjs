import { currentUser } from "@clerk/nextjs";
import { Metadata } from "next";
import { z } from "zod";

import { fetchUserProfile } from "@/app/api/users/actions";
import FestivalMap from "@/app/components/festivals/map";
import { fetchBaseFestival } from "@/app/data/festivals/actions";
import { userCategoryEnum } from "@/db/schema";

export const metadata: Metadata = {
  title: "Información del Festival",
  description: "Festival Glitter",
};

const searchParamsSchema = z.object({
  zone: z.enum(userCategoryEnum.enumValues).optional(),
  terms: z.coerce.boolean().optional(),
});

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    terms: string;
    zone: string;
  };
}) {
  const user = await currentUser();
  let profile = null;

  if (user) {
    profile = await fetchUserProfile(user.id);
  }

  const festival = await fetchBaseFestival(parseInt(params.id));
  if (!festival) {
    return (
      <div className="p-20">
        <p className="text-center text-2xl font-bold text-gray-500">
          No se encontraron datos
        </p>
      </div>
    );
  }

  const validatedSearchParams = searchParamsSchema.safeParse(searchParams);
  const canViewZones: boolean = !profile
    ? false
    : profile.verified || profile.role === "admin";

  if (
    canViewZones &&
    validatedSearchParams.success &&
    validatedSearchParams.data.zone
  ) {
    if (validatedSearchParams.data.terms) {
      return <h1>Terminos y condiciones</h1>;
    }

    return (
      <div className="container p-4 md:p-6">
        <h1 className="font-bold text-2xl">Zona Ilustradores</h1>
        <FestivalMap
          profile={profile!}
          festival={festival}
          zone={validatedSearchParams.data.zone}
        />
      </div>
    );
  }

  // TODO: Add the general public map/page
  return (
    <div className="p-20">
      <p className="text-center text-2xl font-bold text-gray-500">
        Página en construcción
      </p>
    </div>
  );
}
