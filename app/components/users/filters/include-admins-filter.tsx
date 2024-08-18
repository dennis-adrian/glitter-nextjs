"use client";

import { Switch } from "@/app/components/ui/switch";
import { useState } from "react";

type IncludeAdminsFilterProps = {
  checked: boolean;
  onCheckedChange: (includeAdmins: boolean) => void;
};
export function IncludeAdminsFilter(props: IncludeAdminsFilterProps) {
  const [checked, setChecked] = useState(props.checked);

  const handleCheckedChange = (value: boolean) => {
    setChecked(value);
    props.onCheckedChange(value);
  };

  return (
    <div className="flex items-center gap-1 text-sm">
      <span>Mostrar admins</span>
      <Switch checked={checked} onCheckedChange={handleCheckedChange} />
    </div>
  );
}
