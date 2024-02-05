import { FormEvent, SyntheticEvent, useState } from "react";

import SearchContent, { SearchOption } from "./search-content";
import { Input } from "@/app/components/ui/input";
import { SearchIcon } from "lucide-react";

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
  placeholder,
  onSelect,
}: Props) => {
  const [inputText, setInputText] = useState("");
  const [searchedOptions, setSearchedOptions] =
    useState<SearchOption[]>(options);

  const handleSearch = (e: FormEvent<HTMLInputElement>) => {
    setInputText(e.currentTarget.value);

    const filtered = options?.filter((option) => {
      return option.displayName
        .toLowerCase()
        .includes(e.currentTarget.value.toLowerCase());
    });

    setSearchedOptions(filtered);
  };

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
          onChange={handleSearch}
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
