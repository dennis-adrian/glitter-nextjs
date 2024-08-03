"use client";

import { ProfileType } from "@/app/api/users/definitions";
import CategoriesStep from "@/app/components/user_profile/creation-process/categories-step";
import DisplayNameStep from "@/app/components/user_profile/creation-process/display-name-step";
import UserPicStep from "@/app/components/user_profile/creation-process/user-pic-step";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type ProfileCreationFormProps = {
  profile: ProfileType;
  subcategories: Subcategory[];
};
export default function ProfileCreationForm(props: ProfileCreationFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentParams = new URLSearchParams(searchParams.toString());
  const step = searchParams.get("step");

  const setStep = useCallback((step: number) => {
    currentParams.set("step", step.toString());
    router.push(`?${currentParams.toString()}`);
  }, []);

  return (
    <div className="flex flex-col items-center max-w-screen-sm mx-auto">
      <h1 className="font-semibold text-2xl text-muted-foreground">
        Completando tu perfil
      </h1>
      {(!step || step === "1") && (
        <UserPicStep setStep={setStep} profile={props.profile} />
      )}
      {step === "2" && (
        <DisplayNameStep
          profile={props.profile}
          step={parseInt(step)}
          setStep={setStep}
        />
      )}
      {step === "3" && (
        <CategoriesStep
          profile={props.profile}
          step={parseInt(step)}
          subcategories={props.subcategories}
        />
      )}
    </div>
  );
}
