"use client";

import { useState } from "react";

import { Button } from "@/app/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ArrowRightIcon } from "lucide-react";

type FamilyMembersStepProps = {
  numberOfVisitors: number;
  onContinue: (numberOfVisitors: number) => void;
};

export default function FamilyMembersStep(props: FamilyMembersStepProps) {
  const [sliderValue, setSliderValue] = useState([props.numberOfVisitors || 2]);

  function handleSliderChange([value]: number[]) {
    if (value < 1) {
      setSliderValue([1]);
    } else if (value > 10) {
      setSliderValue([10]);
    } else {
      setSliderValue([value]);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="w-full flex flex-col gap-3 text-center my-4">
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSliderChange([sliderValue[0] - 1])}
          >
            -
          </Button>
          <span className="font-semibold text-5xl mr-1">{sliderValue[0]}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSliderChange([sliderValue[0] + 1])}
          >
            +
          </Button>
        </div>
        <Slider
          defaultValue={[sliderValue[0]]}
          max={10}
          min={0}
          step={1}
          value={sliderValue}
          onValueChange={handleSliderChange}
        />
      </div>
      <Button
        className="w-full md:max-w-80"
        onClick={() => props.onContinue(sliderValue[0])}
      >
        Continuar
        <ArrowRightIcon className="ml-2 w-4 h-4" />
      </Button>
    </div>
  );
}
