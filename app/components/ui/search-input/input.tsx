import {
	CSSProperties,
	FocusEvent,
	ReactNode,
	SyntheticEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import SearchContent, { SearchOption } from "./search-content";
import { Input } from "@/app/components/ui/input";
import { SearchIcon } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";

type Props = {
	id: string;
	label?: string;
	labelStyles?: string;
	options: SearchOption[];
	defaultOptions?: SearchOption[];
	contentMaxHeightClassName?: string;
	contentViewportBottomOffset?: number;
	contentHeaderActions?: ReactNode;
	placeholder?: string;
	onSelect: (selectedId: number) => void;
	onSearch?: (term: string) => void;
	isLoading?: boolean;
};

const SearchInput = ({
	id,
	label,
	labelStyles,
	options,
	defaultOptions,
	contentMaxHeightClassName,
	contentViewportBottomOffset = 0,
	contentHeaderActions,
	placeholder = "Buscar...",
	onSelect,
	onSearch,
	isLoading,
}: Props) => {
	const [inputText, setInputText] = useState("");
	const [searchedOptions, setSearchedOptions] =
		useState<SearchOption[]>(options);
	const [isFocused, setIsFocused] = useState(false);
	const [contentStyle, setContentStyle] = useState<CSSProperties | undefined>();

	const containerRef = useRef<HTMLDivElement>(null);
	const inputTextRef = useRef(inputText);
	const onSearchRef = useRef(onSearch);
	const contentAnchorRef = useRef<HTMLDivElement>(null);

	// Sync refs after render so applyFilter/effects see latest values without being in deps
	useEffect(() => {
		inputTextRef.current = inputText;
		onSearchRef.current = onSearch;
	});

	const applyFilter = useCallback(
		(term: string) => {
			const query = term.trim();
			if (onSearchRef.current) {
				onSearchRef.current(query);
			} else {
				const filtered = (options ?? []).filter((option) =>
					option.label.toLowerCase().includes(query.toLocaleLowerCase()),
				);
				const sorted = [...filtered].sort((a, b) => {
					if (a.disabled === b.disabled) return 0;
					return a.disabled ? 1 : -1;
				});
				setSearchedOptions(sorted.slice(0, 10));
			}
		},
		[options],
	);

	const handleSearch = useDebouncedCallback(applyFilter, 300);

	// Re-filter on typing (debounced)
	useEffect(() => {
		handleSearch(inputText);
	}, [inputText, handleSearch]);

	// Re-filter immediately when options are refreshed (local filter mode only)
	useEffect(() => {
		if (!onSearchRef.current) {
			applyFilter(inputTextRef.current);
		}
	}, [applyFilter]);

	useEffect(() => {
		if (!isFocused) return;

		const updateContentMaxHeight = () => {
			const rect = contentAnchorRef.current?.getBoundingClientRect();
			if (!rect) return;
			const availableHeight = Math.floor(
				window.innerHeight - rect.top - contentViewportBottomOffset,
			);
			if (availableHeight <= 0) return;
			setContentStyle({ maxHeight: `${Math.max(160, availableHeight)}px` });
		};

		const raf = requestAnimationFrame(updateContentMaxHeight);
		window.addEventListener("resize", updateContentMaxHeight);
		window.addEventListener("scroll", updateContentMaxHeight, true);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("resize", updateContentMaxHeight);
			window.removeEventListener("scroll", updateContentMaxHeight, true);
		};
	}, [isFocused, contentViewportBottomOffset]);

	const handleSelect = (e: SyntheticEvent<HTMLButtonElement>) => {
		const btn = e.currentTarget;
		if (btn.disabled) return;
		const raw = btn.dataset.optionValue;
		if (raw === undefined) return;
		let value: SearchOption["value"];
		try {
			value = JSON.parse(raw) as SearchOption["value"];
		} catch {
			return;
		}
		setInputText("");
		setIsFocused(false);
		const selectedId = typeof value === "number" ? value : Number(value);
		if (!Number.isFinite(selectedId)) return;
		onSelect(selectedId);
	};

	const handleInputBlur = (e: FocusEvent<HTMLInputElement>) => {
		const nextFocusedElement = e.relatedTarget;
		if (
			nextFocusedElement &&
			containerRef.current?.contains(nextFocusedElement as Node)
		) {
			return;
		}

		requestAnimationFrame(() => {
			const activeElement = document.activeElement;
			if (activeElement && containerRef.current?.contains(activeElement)) {
				return;
			}
			setIsFocused(false);
		});
	};

	// When onSearch is provided, show options directly (server already filtered)
	const visibleOptions = onSearch ? options : searchedOptions;

	return (
		<div aria-label="search input" ref={containerRef}>
			{label && (
				<label className="label">
					<span className={`${labelStyles} label-text`}>{label}</span>
				</label>
			)}
			<div className="relative inline-block w-full">
				<span>
					<SearchIcon className="w-4 h-4 absolute top-1/2 left-3 transform -translate-y-1/2" />
				</span>
				<Input
					className="pl-10"
					id={id}
					type="search"
					placeholder={placeholder}
					value={inputText}
					onChange={(e) => setInputText(e.target.value)}
					onFocus={() => setIsFocused(true)}
					onBlur={handleInputBlur}
				/>
			</div>
			<div ref={contentAnchorRef} className="relative">
				<SearchContent
					defaultOptions={defaultOptions ?? []}
					contentMaxHeightClassName={contentMaxHeightClassName}
					contentStyle={contentStyle}
					headerActions={contentHeaderActions}
					show={isFocused}
					options={visibleOptions}
					onSelect={handleSelect}
					searchTerm={inputText}
					isLoading={isLoading}
				/>
			</div>
		</div>
	);
};

export default SearchInput;
