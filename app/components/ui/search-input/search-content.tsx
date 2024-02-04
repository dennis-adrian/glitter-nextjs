import { SyntheticEvent } from "react";

export type SearchOption = { id: string | number; displayName: string };

type Props = {
  show: boolean;
  options?: SearchOption[];
  onSelect: (e: SyntheticEvent<HTMLLIElement>) => void;
};

const SearchInputContent = ({ show, options, onSelect }: Props) => {
  let items;
  if (!options?.length) {
    items = (
      <li className="disabled">
        <span>No se encontraron resultados</span>
      </li>
    );
  } else {
    items = options!.map((option) => (
      <li
        className="hover:bg-secondary rounded-lg p-2 cursor-pointer"
        key={option.id}
        value={option.id}
        onClick={onSelect}
      >
        <span>{option.displayName}</span>
      </li>
    ));
  }

  return (
    <div className={`${show ? "block" : "hidden"}`}>
      <ul tabIndex={0} className="p-2 shadow rounded-lg w-full mt-4">
        {items}
      </ul>
    </div>
  );
};

export default SearchInputContent;
