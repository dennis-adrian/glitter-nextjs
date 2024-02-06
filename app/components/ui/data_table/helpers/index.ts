import { ColumnFilter, ColumnFiltersState } from "@tanstack/react-table";

export function isFilterActive(
  state: ColumnFiltersState,
  columnId: string,
  value: string,
) {
  return state.some((filter) => {
    const filterValue = filter.value as string;
    return columnId === filter.id && filterValue.includes(value);
  });
}

export function buildFilterValue(filter: ColumnFilter, value: string) {
  const filterValue = filter.value as string[];

  if (filterValue.includes(value))
    return filterValue.filter((v) => v !== value);

  return [...filterValue, value];
}
