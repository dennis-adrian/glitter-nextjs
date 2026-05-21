"use client";

import { X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

import { Badge } from "@/app/components/ui/badge";
import { Input } from "@/app/components/ui/input";

type Props = {
	value: string[];
	onChange: (tags: string[]) => void;
	max?: number;
};

export default function TagInput({ value, onChange, max = 20 }: Props) {
	const [draft, setDraft] = useState("");

	function commit() {
		const cleaned = draft.trim();
		if (!cleaned) return;
		if (value.length >= max) return;
		if (
			value.some((t) => t.toLowerCase() === cleaned.toLowerCase())
		)
			return;
		onChange([...value, cleaned]);
		setDraft("");
	}

	function handleKey(e: KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter" || e.key === ",") {
			e.preventDefault();
			commit();
		}
		if (e.key === "Backspace" && draft === "" && value.length > 0) {
			onChange(value.slice(0, -1));
		}
	}

	function remove(tag: string) {
		onChange(value.filter((t) => t !== tag));
	}

	return (
		<div className="space-y-2">
			<Input
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={handleKey}
				onBlur={commit}
				placeholder="Escribe una etiqueta y presiona Enter"
				maxLength={40}
			/>
			{value.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{value.map((t) => (
						<Badge
							key={t}
							variant="secondary"
							className="pl-2 pr-1 py-1 gap-1"
						>
							{t}
							<button
								type="button"
								className="rounded hover:bg-muted-foreground/10 p-0.5"
								onClick={() => remove(t)}
								aria-label={`Quitar ${t}`}
							>
								<X className="h-3 w-3" />
							</button>
						</Badge>
					))}
				</div>
			)}
			<p className="text-xs text-muted-foreground">
				Presiona Enter o coma para agregar. Máximo {max}.
			</p>
		</div>
	);
}
