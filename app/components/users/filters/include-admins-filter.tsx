"use client";

import { Switch } from "@/app/components/ui/switch";

type IncludeAdminsFilterProps = {
	checked: boolean;
	onCheckedChange: (includeAdmins: boolean) => void;
};
export function IncludeAdminsFilter(props: IncludeAdminsFilterProps) {
	return (
		<div className="flex items-center gap-1 text-sm">
			<span>Mostrar admins</span>
			<Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />
		</div>
	);
}
