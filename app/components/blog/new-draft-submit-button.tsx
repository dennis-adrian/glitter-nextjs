"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/app/components/ui/button";

export default function NewDraftSubmitButton() {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" disabled={pending}>
			{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
			{pending ? "Creando…" : "Nuevo artículo"}
		</Button>
	);
}
