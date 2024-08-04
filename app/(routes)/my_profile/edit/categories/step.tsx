"use client";

import { ProfileType } from "@/app/api/users/definitions";
import CategoriesStep from "@/app/components/user_profile/creation-process/categories-step";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import { useRouter } from "next/navigation";

type CategoriesStepProps = {
  profile: ProfileType;
  subcategories: Subcategory[];
};
export function CategoriesStepClient(props: CategoriesStepProps) {
  const router = useRouter();
  return (
    <div className="max-w-screen-md mx-auto">
      <CategoriesStep
        profile={props.profile}
        step={1}
        setStep={() => router.push("/my_profile")}
        subcategories={props.subcategories}
      />
    </div>
  );
}
