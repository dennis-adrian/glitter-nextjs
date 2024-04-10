import { SyntheticEvent, useEffect, useState } from "react";

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
};

const SearchInput = ({
  id,
  label,
  labelStyles,
  options,
  placeholder = "Buscar...",
  onSelect,
}: Props) => {
  const [inputText, setInputText] = useState("");
  const [searchedOptions, setSearchedOptions] =
    useState<SearchOption[]>(options);

  const handleSearch = useDebouncedCallback((term) => {
    const filtered = options?.filter((option) => {
      return option.label.toLowerCase().includes(term.toLocaleLowerCase());
    });

    setSearchedOptions(filtered || []);
  }, 300);

  useEffect(() => {
    handleSearch(inputText);
  }, [inputText, handleSearch]);

  const handleSelect = (e: SyntheticEvent<HTMLLIElement>) => {
    setInputText("");
    onSelect(e.currentTarget.value);
  };

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
          onChange={(e) => setInputText(e.target.value)}
        />
      </div>
      <SearchContent
        show={!!inputText}
        options={searchedOptions}
        onSelect={handleSelect}
      />
    </div>
  );
};

export default SearchInput;
