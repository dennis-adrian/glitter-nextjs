import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { SyntheticEvent } from "react";

export type SearchOption = {
  value: string | number;
  label: string;
  imageUrl?: string | null;
};

type Props = {
  show: boolean;
  options?: SearchOption[];
  onSelect: (e: SyntheticEvent<HTMLLIElement>) => void;
};

const SearchInputContent = (props: Props) => {
  let items;
  if (!props.options?.length) {
    items = (
      <li className="disabled">
        <span>No se encontraron resultados</span>
      </li>
    );
  } else {
    items = props.options!.map((option) => (
      <li
        className="hover:bg-secondary hover:text-secondary-foreground rounded-lg p-2 cursor-pointer"
        key={option.value}
        value={option.value}
        onClick={props.onSelect}
      >
        <div className="flex justify-between items-center">
          <span>{option.label}</span>
          {option.imageUrl && (
            <Avatar className="w-6 h-6">
              <AvatarImage alt="avatar" src={option.imageUrl} />
            </Avatar>
          )}
        </div>
      </li>
    ));
  }

  return (
    <div className={`${props.show ? "block" : "hidden"}`}>
      <ul tabIndex={0} className="p-2 shadow rounded-lg w-full mt-4">
        {items}
      </ul>
    </div>
  );
};

export default SearchInputContent;
