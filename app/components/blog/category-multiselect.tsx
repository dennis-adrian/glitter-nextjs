"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/app/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/app/components/ui/popover";
import type { PostCategoryRow } from "@/app/lib/posts/definitions";
import { cn } from "@/lib/utils";

type Props = {
	value: number[];
	onChange: (ids: number[]) => void;
	options: PostCategoryRow[];
};

export default function CategoryMultiselect({
	value,
	onChange,
	options,
}: Props) {
	const [open, setOpen] = useState(false);
	const selected = options.filter((o) => value.includes(o.id));

	function toggle(id: number) {
		if (value.includes(id)) onChange(value.filter((v) => v !== id));
		else onChange([...value, id]);
	}

	return (
		<div className="space-y-2">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="outline"
						role="combobox"
						aria-expanded={open}
						className="w-full justify-between"
					>
						{selected.length > 0
							? `${selected.length} categoría(s) seleccionada(s)`
							: "Seleccionar categorías"}
						<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[--radix-popover-trigger-width] p-0">
					<Command>
						<CommandInput placeholder="Buscar categoría…" />
						<CommandList>
							<CommandEmpty>Sin resultados</CommandEmpty>
							<CommandGroup>
								{options.map((opt) => {
									const checked = value.includes(opt.id);
									return (
										<CommandItem
											key={opt.id}
											onSelect={() => toggle(opt.id)}
										>
											<Check
												className={cn(
													"mr-2 h-4 w-4",
													checked ? "opacity-100" : "opacity-0",
												)}
											/>
											{opt.name}
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>

			{selected.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{selected.map((s) => (
						<Badge
							key={s.id}
							variant="secondary"
							className="pl-2 pr-1 py-1 gap-1"
						>
							{s.name}
							<button
								type="button"
								className="rounded hover:bg-muted-foreground/10 p-0.5"
								onClick={() => toggle(s.id)}
								aria-label={`Quitar ${s.name}`}
							>
								<X className="h-3 w-3" />
							</button>
						</Badge>
					))}
				</div>
			)}
		</div>
	);
}
