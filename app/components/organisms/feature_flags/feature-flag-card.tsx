"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import FeatureFlagTargets from "@/app/components/organisms/feature_flags/feature-flag-targets";
import { updateFeatureFlagVisibility } from "@/app/lib/feature_flags/actions";
import {
  FEATURE_FLAG_VISIBILITIES,
  FEATURE_FLAG_VISIBILITY_DESCRIPTIONS,
  FEATURE_FLAG_VISIBILITY_LABELS,
  type FeatureFlagVisibility,
  type FeatureFlagWithTargets,
} from "@/app/lib/feature_flags/definitions";
import type { FeatureFlagDefinition } from "@/app/lib/feature_flags/registry";

type Props = {
  flag: FeatureFlagWithTargets;
  definition: FeatureFlagDefinition;
};

export default function FeatureFlagCard({ flag, definition }: Props) {
  const [visibility, setVisibility] = useState<FeatureFlagVisibility>(
    flag.visibility,
  );
  const [isPending, startTransition] = useTransition();

  const hasChanges = visibility !== flag.visibility;

  function handleSubmit() {
    startTransition(async () => {
      try {
        const result = await updateFeatureFlagVisibility({
          key: flag.key,
          visibility,
        });

        if (result.success) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
          setVisibility(flag.visibility);
        }
      } catch {
        toast.error("No se pudo guardar la visibilidad");
        setVisibility(flag.visibility);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{definition.label}</CardTitle>
        <CardDescription>{definition.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup
          value={visibility}
          onValueChange={(value) =>
            setVisibility(value as FeatureFlagVisibility)
          }
          className="gap-3"
          disabled={isPending}
        >
          {FEATURE_FLAG_VISIBILITIES.map((option) => (
            <Label
              key={option}
              htmlFor={`${flag.key}-visibility-${option}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 has-data-[state=checked]:border-primary"
            >
              <RadioGroupItem
                id={`${flag.key}-visibility-${option}`}
                value={option}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium">
                  {FEATURE_FLAG_VISIBILITY_LABELS[option]}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {FEATURE_FLAG_VISIBILITY_DESCRIPTIONS[option]}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>

        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">
            Clave: <code>{flag.key}</code>
          </span>
          <Button onClick={handleSubmit} disabled={isPending || !hasChanges}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </div>

        <FeatureFlagTargets flagKey={flag.key} targets={flag.targets} />
      </CardContent>
    </Card>
  );
}
