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
  onSelect: (e: SyntheticEvent<HTMLButtonElement>) => void;
  isLoading?: boolean;
  searchTerm?: string;
  /** Shorter terms are not searched, so they get a hint, not "no results". */
  minSearchLength?: number;
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
  minSearchLength = 0,
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

  const trimmedTerm = searchTerm?.trim() ?? "";
  const termTooShort =
    trimmedTerm.length > 0 && trimmedTerm.length < minSearchLength;
  // Nothing typed, nothing suggested and nothing to act on: an open panel
  // would be a box with a heading over an empty list.
  const isEmpty =
    !isLoading &&
    !trimmedTerm &&
    searchItems.length === 0 &&
    defaultItems.length === 0 &&
    !headerActions;

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
  } else if (termTooShort) {
    content = (
      <p className="text-sm text-muted-foreground">
        Escribí al menos {minSearchLength} caracteres para buscar.
      </p>
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
      data-search-results
      className={cn(
        // Stacked like the app's popovers. Without a z-index of its own the
        // panel sat in page order, so positioned content after it — avatars,
        // whose images are absolutely placed — painted through it.
        "absolute top-0 left-0 z-50 w-full mt-3 rounded-lg shadow-md bg-card border p-4",
        // A one-line hint does not need room for a list.
        !termTooShort && "min-h-32",
        (contentMaxHeightClassName || contentStyle?.maxHeight) &&
          "overflow-y-auto",
        contentMaxHeightClassName,
        show && !isEmpty ? "block" : "hidden",
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
  onSelect: (e: SyntheticEvent<HTMLButtonElement>) => void;
}) {
  return (
    <li className="list-none">
      <button
        type="button"
        disabled={option.disabled}
        data-option-value={JSON.stringify(option.value)}
        className={cn(
          "w-full rounded-lg p-2 text-left",
          !option.disabled &&
            "cursor-pointer hover:ring-1 hover:ring-ring hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          option.disabled && "cursor-not-allowed opacity-50",
        )}
        onMouseDown={(e) => {
          if (!option.disabled) {
            e.preventDefault();
          }
        }}
        onClick={onSelect}
      >
        <div className="flex items-center gap-2">
          {option.imageUrl && (
            <Avatar className="h-8 w-8">
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
      </button>
    </li>
  );
}

export default SearchInputContent;
