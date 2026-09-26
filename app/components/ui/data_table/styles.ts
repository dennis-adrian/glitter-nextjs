/**
 * The table's own controls are neutral: the brand-purple outline and ghost
 * buttons suit the storefront, but beside a table of figures they compete
 * with the data for attention.
 */
export const toolbarButtonClass =
  "h-9 gap-1.5 rounded-md border-input bg-background px-3 text-sm font-normal text-foreground hover:bg-muted hover:text-foreground";

/** Applied on top of `toolbarButtonClass` while a filter is doing something. */
export const toolbarButtonActiveClass = "border-foreground/30 bg-muted/60";

export const pagerButtonClass =
  "h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40";
