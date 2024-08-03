"use client";

import { ProfileType } from "@/app/api/users/definitions";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import { Button } from "@/app/components/ui/button";
import AutomaticProfilePicUploadForm from "@/app/components/user_profile/profile_pic/automatic_upload_form";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type ProfileCreationFormProps = {
  profile: ProfileType;
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
    <div className="flex flex-col items-center">
      <h1 className="font-semibold text-2xl">Completando tu perfil</h1>
      {(!step || step === "1") && (
        <>
          <StepDescription
            title="¿Esta imagen es la correcta para tu perfil?"
            description="Ayuda a las personas que ingresan a nuestra página a reconocerte con tu foto de perfil"
          />
          <AutomaticProfilePicUploadForm
            afterUploadComponent={
              <div className="flex gap-4">
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                >
                  Reemplazar
                </Button>
                <Button onClick={() => setStep(2)}>Continuar</Button>
              </div>
            }
            profile={props.profile}
            size="md"
          />
        </>
      )}
      {step === "2" && <div>step 2</div>}
    </div>
  );
}
