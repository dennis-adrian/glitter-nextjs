export function merchCollectionPath(slug: string) {
  return `/merch/collections/${encodeURIComponent(slug)}`;
}

export function merchBundlePath(slug: string) {
  return `/merch/combos/${encodeURIComponent(slug)}`;
}
