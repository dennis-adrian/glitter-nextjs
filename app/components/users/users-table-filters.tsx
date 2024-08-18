import { MultipleSelecteCombobox } from "@/app/components/ui/combobox";
import { profileStatusOptions } from "@/app/lib/utils";

export default function UsersTableFilters() {
  return (
    <MultipleSelecteCombobox label="Estado" options={profileStatusOptions} />
  );
}
