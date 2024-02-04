import { FormEvent, SyntheticEvent, useState } from "react";

import SearchContent, { SearchOption } from "./search-content";
import { Input } from "@/app/components/ui/input";

type Props = {
  label?: string;
  labelStyles?: string;
  options: SearchOption[];
  placeholder?: string;
  onSelect: (selectedId: number) => void;
};

const SearchInput = ({
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
    <div aria-label="search input" className="form-control">
      {label && (
        <label className="label">
          <span className={`${labelStyles} label-text`}>{label}</span>
        </label>
      )}
      <Input
        type="search"
        placeholder={placeholder}
        value={inputText}
        onChange={handleSearch}
      />
      <SearchContent
        show={!!inputText}
        options={searchedOptions}
        onSelect={handleSelect}
      />
    </div>
  );
};

export default SearchInput;
