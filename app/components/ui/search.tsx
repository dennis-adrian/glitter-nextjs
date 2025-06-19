"use client";

import { Input } from "@/app/components/ui/input";
import { SpinnerIcon } from "@/app/icons/SpinnerIcon";
import { cn } from "@/app/lib/utils";
import { Loader2, SearchIcon } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTransition } from "react";
import { useDebouncedCallback } from "use-debounce";

export default function Search({
	className,
	placeholder,
	label = "Buscar",
	showLabel,
}: {
	className?: string;
	placeholder: string;
	label?: string;
	showLabel?: boolean;
}) {
	const searchParams = useSearchParams();
	const { push } = useRouter();
	const [isPending, startTransition] = useTransition();

	const handleSearch = useDebouncedCallback((term) => {
		const params = new URLSearchParams(searchParams);
		params.set("offset", "0");
		if (term) {
			params.set("query", term);
		} else {
			params.delete("query");
		}
		startTransition(() => {
			push(`?${params.toString()}`, {
				scroll: false,
			});
		});
	}, 400);

	return (
		<div className={cn("flex flex-col gap-0", className)}>
			<label
				htmlFor="search"
				className={cn("text-sm text-muted-foreground", !showLabel && "sr-only")}
			>
				{label}
			</label>
			<div className="relative flex flex-col gap-1 w-full md:max-w-96">
				<Input
					className="peer pl-10"
					defaultValue={searchParams.get("query")?.toString()}
					placeholder={placeholder}
					type="search"
					onChange={(e) => handleSearch(e.target.value)}
				/>
				<div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 peer-focus:text-primary">
					{isPending ? (
						<div aria-label="buscando...">
							<SpinnerIcon
								aria-hidden="true"
								className="h-4 w-4 animate-spin"
							/>
						</div>
					) : (
						<SearchIcon aria-hidden="true" className="h-4 w-4" />
					)}
				</div>
			</div>
		</div>
	);
}
