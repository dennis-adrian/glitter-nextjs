"use client";

import { Switch } from "@/app/components/ui/switch";
import { useEffect, useState } from "react";

type IncludeAdminsFilterProps = {
	checked: boolean;
	onCheckedChange: (includeAdmins: boolean) => void;
};
export function IncludeAdminsFilter(props: IncludeAdminsFilterProps) {
	const [localChecked, setLocalChecked] = useState(props.checked);

	useEffect(() => {
		setLocalChecked(props.checked);
	}, [props.checked]);

	const handleCheckedChange = (checked: boolean) => {
		setLocalChecked(checked);
		props.onCheckedChange(checked);
	};

	return (
		<div className="flex items-center gap-1 text-sm">
			<span>Mostrar admins</span>
			<Switch checked={localChecked} onCheckedChange={handleCheckedChange} />
		</div>
	);
}
