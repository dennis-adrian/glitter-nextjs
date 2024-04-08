import { currentUser } from "@clerk/nextjs";
import { Metadata } from "next";
import { z } from "zod";

import { fetchUserProfile } from "@/app/api/users/actions";
import Festival from "@/app/components/festivals/festival";
import { fetchBaseFestival } from "@/app/data/festivals/actions";
import { userCategoryEnum } from "@/db/schema";
import { UserCategory } from "@/app/api/users/definitions";

export const metadata: Metadata = {
  title: "Información del Festival",
  description: "Festival Glitter",
};

const searchParamsSchema = z.object({
  category: z.enum(userCategoryEnum.enumValues).optional(),
  terms: z.coerce.boolean().optional(),
});

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    terms: string;
    category: string;
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
  const canViewCategories: boolean = !profile
    ? false
    : profile.verified || profile.role === "admin";

  if (
    canViewCategories &&
    validatedSearchParams.success &&
    validatedSearchParams.data.category
  ) {
    if (validatedSearchParams.data.terms) {
      return <h1>Terminos y condiciones</h1>;
    }

    return (
      <Festival
        profile={profile!}
        festival={festival}
        category={
          validatedSearchParams.data.category as Exclude<UserCategory, "none">
        }
      />
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
