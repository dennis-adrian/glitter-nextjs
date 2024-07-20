"use client";

import { Slider } from "@/components/ui/slider";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { ArrowRightIcon } from "lucide-react";

type FamilyMembersStepProps = {
  numberOfVisitors?: number;
};

export default function FamilyMembersStep(props: FamilyMembersStepProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [sliderValue, setSliderValue] = useState([props.numberOfVisitors || 1]);

  function updateSearchParams() {
    const currentParams = new URLSearchParams(searchParams.toString());
    currentParams.set("numberOfVisitors", sliderValue[0].toString());
    router.push(`?${currentParams.toString()}`);
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <StepDescription
        title="¿Cuántas personas ingresarán?"
        description="Saber la cantidad de personas que nos visitan nos ayudará a mejorar la experiencia"
      />
      <div className="w-full flex flex-col gap-3 text-center my-4">
        <span className="font-semibold text-5xl mr-1">{sliderValue[0]}</span>
        <Slider
          defaultValue={[sliderValue[0]]}
          max={10}
          min={1}
          step={1}
          onValueChange={setSliderValue}
        />
      </div>
      <Button className="w-full md:max-w-80" onClick={updateSearchParams}>
        Continuar
        <ArrowRightIcon className="ml-2 w-4 h-4" />
      </Button>
    </div>
  );
}
