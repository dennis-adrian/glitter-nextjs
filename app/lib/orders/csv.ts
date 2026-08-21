export function sanitizeCsvCell(value: unknown): string {
  const original = String(value);
  const leadingTrimmed = original.trimStart();

  if (leadingTrimmed && ["=", "+", "-", "@"].includes(leadingTrimmed[0])) {
    return `'${original}`;
  }

  return original;
}

export function serializeCsvRows(
  rows: readonly (readonly unknown[])[],
): string {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${sanitizeCsvCell(cell).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}
