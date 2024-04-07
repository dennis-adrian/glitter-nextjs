import { HTMLAttributes } from "react";

import { FilePenLineIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";

export function UserProfileFieldButton({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  return (
    <Button disabled={disabled} variant="ghost">
      <FilePenLineIcon className="mr-1 h-4 w-4" />
      Editar
    </Button>
  );
}

type UserProfileFieldProps = {
  editable?: boolean;
  label: string;
  value?: string | null;
} & HTMLAttributes<HTMLDivElement>;

export function ShowField({ label, value }: UserProfileFieldProps) {
  value = value?.trim().length ? value : "No especificado";
  return (
    <div className="flex w-full justify-between">
      <div>
        <h3 className="font-bold">{label}</h3>
        <div className="text-muted-foreground max-w-48 truncate sm:max-w-80">
          {value}
        </div>
      </div>
    </div>
  );
}
