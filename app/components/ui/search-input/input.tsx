import { SyntheticEvent, useEffect, useMemo, useState } from "react";

import SearchContent, { SearchOption } from "./search-content";
import { Input } from "@/app/components/ui/input";
import { SearchIcon } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";

type Props = {
  id: string;
  label?: string;
  labelStyles?: string;
  options: SearchOption[];
  placeholder?: string;
  onSelect: (selectedId: number) => void;
  selectedId?: number;
};

const SearchInput = ({
  id,
  label,
  labelStyles,
  options,
  placeholder = "Buscar...",
  onSelect,
  selectedId,
}: Props) => {
  const [inputText, setInputText] = useState("");
  const [searchedOptions, setSearchedOptions] =
    useState<SearchOption[]>(options);
  const selectedLabel = useMemo(() => {
    if (selectedId == null) return "";
    const found = options.find((o) => String(o.value) === String(selectedId));
    return found?.label ?? "";
  }, [selectedId, options]);

  const handleSearch = useDebouncedCallback((term: string) => {
    const filtered = options?.filter((option) => {
      return option.label.toLowerCase().includes(term.toLocaleLowerCase());
    });

    setSearchedOptions(filtered || []);
  }, 300);

  useEffect(() => {
    handleSearch(inputText);
  }, [inputText, handleSearch]);

  useEffect(() => {
    if (selectedLabel) {
      setInputText(selectedLabel);
    } else {
      setInputText("");
    }
  }, [selectedLabel]);

  const handleSelect = (e: SyntheticEvent<HTMLLIElement>) => {
    const el = e.currentTarget;
    const valueAttr = el.getAttribute("value") ?? el.getAttribute("data-value") ?? (el as any).value;
    if (!valueAttr) return;
    const id = Number(valueAttr);
    if (Number.isNaN(id)) return;
    const found = options.find((o) => String(o.value) === String(id));
    setInputText(found?.label ?? "");
    onSelect(id); 
  };
  
  const shouldShow = !!inputText && inputText !== selectedLabel;

  return (
    <div aria-label="search input">
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
          onChange={(e) => {
            setInputText(e.target.value);
          }}
        />
      </div>
      <SearchContent
        show={shouldShow}
        options={searchedOptions}
        onSelect={handleSelect}
      />
    </div>
  );
};

export default SearchInput;
