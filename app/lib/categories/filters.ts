export type PickerCategory = {
  id: number;
  category: string;
  isExclusive: boolean;
  isAdminAssignableOnly: boolean;
};

/**
 * Participant onboarding picker: exclusive rows clear/hide others,
 * and admin-assignable-only rows never appear.
 */
export function filterPickerOptions<T extends PickerCategory>(
  rows: T[],
  selected: T[],
  area: string,
): T[] {
  if (selected.some((row) => row.isExclusive)) {
    return [];
  }

  const selectedIds = new Set(selected.map((row) => row.id));

  return rows.filter((row) => {
    if (row.isAdminAssignableOnly) return false;
    if (row.category !== area) return false;
    if (selectedIds.has(row.id)) return false;
    if (row.isExclusive && selected.length > 0) return false;
    return true;
  });
}

export function withExclusiveSelection<T extends PickerCategory>(
  selected: T[],
  next: T,
): T[] {
  if (next.isExclusive) return [next];
  return [...selected.filter((row) => !row.isExclusive), next];
}
