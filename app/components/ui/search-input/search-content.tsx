import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { cn } from "@/app/lib/utils";
import { Loader2 } from "lucide-react";
import { CSSProperties, ReactNode, SyntheticEvent } from "react";

export type SearchOption = {
	value: string | number;
	label: string;
	imageUrl?: string | null;
	disabled?: boolean;
	disabledReason?: string;
};

type Props = {
	show: boolean;
	options?: SearchOption[];
	onSelect: (e: SyntheticEvent<HTMLLIElement>) => void;
	isLoading?: boolean;
	searchTerm?: string;
	defaultOptions?: SearchOption[];
	contentMaxHeightClassName?: string;
	contentStyle?: CSSProperties;
	headerActions?: ReactNode;
};

const SearchInputContent = ({
	show,
	options,
	onSelect,
	isLoading,
	defaultOptions,
	searchTerm,
	contentMaxHeightClassName,
	contentStyle,
	headerActions,
}: Props) => {
	let content = null;

	const defaultItems =
		defaultOptions?.map((option) => (
			<SearchInputContentItem
				key={option.value}
				option={option}
				onSelect={onSelect}
			/>
		)) ?? [];

	const searchItems =
		options?.map((option) => (
			<SearchInputContentItem
				key={option.value}
				option={option}
				onSelect={onSelect}
			/>
		)) ?? [];

	if (isLoading) {
		content = (
			<div className="flex items-center gap-2">
				<Loader2 className="h-4 w-4 animate-spin" />
				<span className="text-sm text-muted-foreground">Buscando...</span>
			</div>
		);
	} else if (
		defaultItems.length > 0 &&
		searchItems.length === 0 &&
		!searchTerm
	) {
		content = (
			<>
				<div className="mb-2 flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium">
						Compartiste espacio anteriormente
					</h2>
					{headerActions}
				</div>
				<ul>{defaultItems}</ul>
			</>
		);
	} else if (searchTerm && searchItems.length === 0) {
		content = (
			<p className="text-sm text-muted-foreground">
				No se encontraron resultados para &quot;{searchTerm}&quot;
			</p>
		);
	} else {
		content = (
			<>
				<div className="mb-2 flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium">Resultados de la búsqueda</h2>
					{headerActions}
				</div>
				<ul>{searchItems}</ul>
			</>
		);
	}

	return (
		<div
			className={cn(
				"absolute top-0 left-0 w-full mt-3 rounded-lg shadow-md bg-card border p-4 min-h-32",
				(contentMaxHeightClassName || contentStyle?.maxHeight) &&
					"overflow-y-auto",
				contentMaxHeightClassName,
				show ? "block" : "hidden",
			)}
			style={contentStyle}
		>
			{content}
		</div>
	);
};

export function SearchInputContentItem({
	option,
	onSelect,
}: {
	option: SearchOption;
	onSelect: (e: SyntheticEvent<HTMLLIElement>) => void;
}) {
	return (
		<li
			key={option.value}
			className={cn(
				"rounded-lg p-2 cursor-pointer",
				!option.disabled &&
					"hover:ring-1 hover:ring-ring hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				option.disabled && "opacity-50 cursor-not-allowed",
			)}
			value={option.value}
			onMouseDown={(e) => {
				if (!option.disabled) {
					e.preventDefault();
				}
			}}
			onClick={!option.disabled ? onSelect : undefined}
		>
			<div className="flex gap-2 items-center">
				{option.imageUrl && (
					<Avatar className="w-8 h-8">
						<AvatarImage alt="avatar" src={option.imageUrl} />
					</Avatar>
				)}
				<div className="flex flex-col">
					<span className="text-sm">{option.label}</span>
					{option.disabledReason && (
						<span className="text-xs text-muted-foreground">
							{option.disabledReason}
						</span>
					)}
				</div>
			</div>
		</li>
	);
}

export default SearchInputContent;
