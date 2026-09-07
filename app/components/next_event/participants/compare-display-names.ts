export function compareParticipantDisplayNames(
  a: { displayName: string | null },
  b: { displayName: string | null },
) {
  return (a.displayName ?? "").localeCompare(b.displayName ?? "");
}
