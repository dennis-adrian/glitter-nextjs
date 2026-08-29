# Implementation Plan: Manageable Categories

**Product:** Glitter  
**Feature area:** Public categories page, participant taxonomy, admin content  
**Status:** Proposed  
**Last updated:** 2026-08-24

This plan turns the hardcoded `/festivals/categories` page and the operational `subcategories` table into one admin-managed catalog. UI language calls the rows **categorías**. The three parent enum values stay a higher grouping called **áreas**. The existing `subcategories` table and its foreign-key references stay in place. The column set changes: new catalog columns are added, and unused `description` is dropped after backfill.

---

## 1. Decisions locked

| Topic | Decision |
| --- | --- |
| Public page content | Children only. No área cards for Ilustración or Gastronomía. |
| Missing children | Create **Ilustración Digital** (`illustration`) and **Postres** (`gastronomy`) if they do not already exist. |
| Public layout | Group by área. No filters. Redesign of this page is out of scope later. |
| Incomplete content | Still render the card: image placeholder + empty description. |
| Editor | One editor for the product: **BlockNote**. Categorías use a slim schema; the blog (`feat/blog`) uses the full article schema. Do not add Tiptap as a direct dependency. |
| Participant count | `verified` + `paused`. |
| Delete | Block if any **verified** profile or any **stand** uses the row. Warn with counts of other linked profiles (pending, paused, rejected, banned) before confirming. |
| Who can manage | `admin` only. Festival admins keep the rest of the dashboard but not this module. |
| Rename / move área | Allowed, with an explicit warning when the row already has profiles or stands. |
| Unpublished vs selectable | Hidden categories are not selectable. Listed-but-disabled categories appear on the public page and cannot be picked. |
| Skincare / Sublimación | Replace label string matching with explicit flags. |
| Seed | Backfill current hardcoded copy into matching rows. |

---

## 2. Glossary

| Term | Meaning |
| --- | --- |
| Área | Parent grouping. Values of `user_category`: `illustration`, `entrepreneurship`, `gastronomy`. Deprecated `new_artist` is not a management área. |
| Categoría | A row in `subcategories`. This is what participants pick and what the public page shows. |
| Visibility | Three-state catalog status: hidden, listed (visible but closed), or selectable. |
| Participant count | Profiles with that categoría whose `users.status` is `verified` or `paused`. |
| Exclusive | At most one categoría of this kind on a profile, and it cannot be combined with others (today: Skincare). |
| Admin-assignable only | Hidden from self-serve onboarding; admins can still attach it (today: Sublimación). |

The table stays `subcategories`. TypeScript types, actions, and routes for participants/stands keep using that name internally. Only admin and public **copy** say “categoría”.

---

## 3. One editor: BlockNote (shared with the blog)

Tiptap can do a blog, but this repo already has a blog on `feat/blog` built on BlockNote (Notion-like authoring, Spanish locale, JSON + sanitized HTML, `@blocknote/server-util`, inline images via UploadThing). Adding Tiptap for categorías would mean two editor stacks and a rewrite when that branch merges.

**Decision:** BlockNote is the only rich-text editor in the product. Do not add `@tiptap/*` as a direct dependency. BlockNote already sits on Tiptap; a second copy only duplicates APIs and CSS.

License we will use:

- `@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn`, `@blocknote/server-util` — **MPL-2.0**.
- Do **not** add `@blocknote/xl-*` (PDF/DOCX exporters; GPL-3.0 / paid).
- Do **not** add `@blocknote/mantine`. `feat/blog` used Mantine because it was the default adapter at the time. This app is shadcn/Radix. Categorías land on `@blocknote/shadcn`. When the blog merges, swap its Mantine imports for the shared shadcn wrapper rather than pulling Mantine into `main`.

Load the editor only on the client (`"use client"` + `next/dynamic` with `{ ssr: false }`).

### 3.1 Two schemas, one organism

`RichTextEditor` takes a `schema` (or `variant`) prop. Same chrome, different allowed blocks.

| | `compact` (categorías, this project) | `article` (blog, later) |
| --- | --- | --- |
| Blocks | Paragraph, heading 2–3, bullet/numbered list, quote | Plus heading 1–4, check list, code, divider, image |
| Inline | Bold, italic, link | Same |
| Images in the editor | Off. Companion image is a separate UploadThing field. | On, via UploadThing (`blogImage` on `feat/blog`) |
| Slash menu | Only the compact block set | Full article set |
| Storage | `description_json` + `description_html` | `content` + `contentHtml` (already on `feat/blog`) |
| HTML pipeline | `@blocknote/server-util` then the shared sanitizer | Same helper |

`compact` is a **subset** of `article`, so category JSON remains valid if it is ever opened in the article editor. The reverse is not required: pasting article-only blocks into a category field is stripped or rejected on save.

Shared modules (no category-specific names):

- `app/lib/rich-text/schemas.ts` — `compactEditorSchema`, `articleEditorSchema`
- `app/lib/rich-text/render.ts` — `blocksToSanitizedHtml(blocks)` using `@blocknote/server-util` + allowlist sanitizer
- `app/components/organisms/rich-text-editor.tsx` — client wrapper, `variant: "compact" \| "article"`

This project implements `compact` and the shared render helper. `article` can be a stub schema exported now (so the blog merge has a place to land) or added when `feat/blog` is rebased; either way the organism API must already accept the variant.

### 3.2 Storage for categorías

- Source of truth: BlockNote document JSON in `description_json` (`jsonb`).
- Public render: HTML generated on save into `description_html`, sanitized with a strict allowlist (`p`, `h2`, `h3`, `ul`, `ol`, `li`, `strong`, `em`, `a[href]`, `blockquote`, `br`).
- Spanish BlockNote dictionary (`es`), same as `feat/blog`.

---

## 4. Current state (what we are replacing)

**Operational taxonomy** already lives in `subcategories` (`label`, unused `description`, parent `category`). Profiles and stands reference it. `/dashboard/subcategories` can create a name + área and delete a badge. Delete has **no usage check** and **cascades** to `profile_subcategories` and `stand_subcategories`. Server actions are not auth-checked (dashboard layout is the only gate, and it allows `festival_admin`).

**Marketing copy** is hardcoded in `app/components/festivals/subcategories/sucategories-description.tsx`. It does not read the table. It includes área-level cards that will go away.

**Onboarding special cases** are `label.toLowerCase()` checks for `"skin"` and `"sublimación"` in `app/components/user_profile/creation-process/categories.tsx`.

---

## 5. Data model

Extend `subcategories`. Keep `id`, `label` (`name`), `category`, timestamps. Fix the TypeScript typo `descrption` → `description` (the SQL column is already `description`).

New / changed columns:

| Column | Type | Default | Notes |
| --- | --- | --- | --- |
| `description_json` | `jsonb` | `null` | BlockNote document. |
| `description_html` | `text` | `null` | Sanitized HTML for the public page. Replaces ad-hoc use of the old plain `description` after backfill. |
| `image_url` | `text` | `null` | UploadThing URL. |
| `image_file_key` | `text` | `null` | UploadThing `fileKey`. Replacement and deletion must use this stored key (`deleteFile` / `utapi.deleteFiles`), not a guessed URL path. |
| `sort_order` | `integer` | `0` | Order within an área. |
| `visibility` | enum | `'selectable'` | See §6. Existing rows stay selectable so onboarding does not shrink on deploy. |
| `is_exclusive` | `boolean` | `false` | Skincare rule. |
| `is_admin_assignable_only` | `boolean` | `false` | Sublimación rule. |

Also add:

- Unique index on `(category, lower(label))` so “Crochet” cannot be duplicated inside Ilustración. Create it only after a preflight that uses the same canonicalization as the backfill (`normalizeCategoryLabel`: lowercase, strip accents, collapse `/` and whitespace). If any `(área, canonical label)` group still has more than one row, abort with a report of ids and raw labels (or resolve those duplicates first).
- Index on `(visibility, category, sort_order)` for the public query.

Keep the old `description` text column through the backfill. Copy legacy text into `description_html` as a single HTML-escaped `<p>` (and a matching paragraph in `description_json` when JSON is empty) so stored markup cannot execute. Drop `description` only after that copy succeeds in the same migration. Do not leave two competing description fields.

Enum (new):

```text
category_visibility: hidden | listed | selectable
```

`hidden` = not on the public page, not in any picker.  
`listed` = on the public page, not pickable (closed category).  
`selectable` = on the public page and in the participant picker.

Invariant: `selectable` is the only value the onboarding form loads. `is_admin_assignable_only` rows are excluded from that form even if `selectable`; admins can still attach them from profile edit. Prefer setting those rows to `listed` so the public page can still explain the rule (current Sublimación card).

---

## 6. Visibility and pickability

From the management page the admin sets **one** control, not two independent booleans (that combination is how “unpublished but selectable” slips in).

| Admin control | `visibility` | Public page | Participant picker |
| --- | --- | --- | --- |
| Oculta | `hidden` | No | No |
| Visible, cerrada | `listed` | Yes | No |
| Activa | `selectable` | Yes | Yes, unless `is_admin_assignable_only` |

UI: a three-option segmented control or radio group in the editor sidebar, labeled in Spanish as above, with one-line help text under each option.

---

## 7. UI research (Mobbin) and chosen patterns

Research ignored the current badge-cloud admin screen and the text-only public cards. Those are hard to scan, hide usage, and make delete feel cheap.

### 7.1 Admin list — Shopify collections table, grouped by área

Primary reference: [Shopify Collections list](https://mobbin.com/screens/24a41e35-e584-4615-a2cd-5a21abf8a08a) and [Uvodo Collections](https://mobbin.com/flows/3bc77af3-f976-4ffe-9f25-2e5996de931a).

Row anatomy:

1. Thumbnail (or placeholder)
2. Title
3. Visibility (dot + label, not a loud pill on every row)
4. Participant count (`verified` + `paused`)
5. Overflow menu: Editar, Ocultar / Cerrar / Activar, Eliminar

Page chrome:

- Title **Categorías** + total count
- Primary **Crear categoría** (top right)
- Search by name (client filter is enough; the catalog is small)
- **No** extra filter chips in v1

Grouping: one section per área, heading + “Añadir en esta área”, then the rows. This is closer to [Vanta custom categories](https://mobbin.com/flows/e1086a75-b677-4728-aaf9-edf943fda4d9) and [Coda category sections](https://mobbin.com/sites/sections/5735b97a-04fb-4839-92b0-8620fcccf9c6) than to three badge cards.

Reorder: drag handle at the start of each row, **within the área only** (same interaction as marketing banners, using existing `@dnd-kit`).

Rejected for this screen:

- Cloaked’s sidebar-of-folders — fights the existing dashboard nav.
- Cosmos’s image gallery — weak for counts, status, and delete rules.
- Dense full-width data table mixing all áreas — loses the parent hierarchy the public page also uses.

Mobile: same grouped list, stacked metadata under the title, overflow menu. Do not build a second card grid.

### 7.2 Admin editor — Shopify collection editor

Primary reference: [Shopify Create collection](https://mobbin.com/screens/76043a9d-aab8-4605-8386-751065ea5e76) and [Shopify Edit collection](https://mobbin.com/screens/d5912336-d165-4737-8765-2fc20d751084).

Layout:

- Sticky header: back, name, **Descartar** / **Guardar**
- Main column (~2/3): name, área select, BlockNote description
- Sidebar (~1/3): visibility, companion image, exclusive / admin-only flags, live counts
- Footer: destructive **Eliminar** on the left, away from Save

BlockNote’s own chrome (slash menu, floating format bar) follows [Notion’s block editor](https://mobbin.com/screens/4acb3a13-ddf8-4b60-9eae-e6ade2cc4dd3). Do not add a second custom toolbar on top.

Rename / move warning: inline `Alert` under the área select when the loaded row has any linked profiles (verified, pending, paused, rejected, banned) or any stands. Categories linked only to pending, paused, rejected, or banned profiles still show the Alert. Saving still works; the warning is the gate, not a modal.

### 7.3 Delete — Vanta impact dialog

Primary reference: [Vanta “Remove category”](https://mobbin.com/flows/e1086a75-b677-4728-aaf9-edf943fda4d9).

The dialog always lists impact, then either blocks or asks to confirm:

- **Blocked:** “No se puede eliminar **Crochet** porque **12 perfiles verificados** y **3 stands** la usan.” Primary action disabled. Secondary: Cerrar. Optional text link “Ver perfiles”.
- **Allowed with warning:** “Esta acción no se puede deshacer. Hay **4 perfiles no verificados** (2 pendientes, 1 pausado, 1 rechazado) que perderán esta categoría.” Confirm is a red **Eliminar categoría**.

Toast after success, same as [Cosmos collection deleted](https://mobbin.com/flows/0e041875-969d-4148-bc10-889cfdabfe51).

### 7.4 Public page — sectioned image cards

Keep grouping by área (user request). Card pattern from [Wix article grid](https://mobbin.com/sites/sections/4074934b-bb7e-41a8-bfd2-40d2199e173d) and [Udemy top categories](https://mobbin.com/sites/sections/0f3bc0ba-242c-4241-a0ed-e3426a32ec29):

- Área as an `h2` section heading (`getCategoryLabel`)
- Responsive grid of cards: 1 / 2 / 3 columns
- Card: 16:10 image (or placeholder), title, HTML description
- Missing image: muted dashed tile + `ImageIcon`, not a broken `next/image` (pattern from [Aboard empty albums](https://mobbin.com/screens/25f59ea9-8414-4dd2-b40a-153ddfda891e) and the existing program artwork empty state)
- Missing description: omit the body; do not show “Sin descripción”
- `listed` and `selectable` both appear; `hidden` does not
- Closed (`listed`) categories get a small “No disponible para nuevas inscripciones” line so the public page does not look like an open invitation

No filters, no search, no área intro cards.

---

## 8. Atomic Design — what to add vs reuse

Follow existing folders: `app/components/atoms`, `molecules`, `organisms`, plus `app/components/ui` for primitives.

### Reuse as-is

| Piece | Use for |
| --- | --- |
| `Button`, `Card`, `Input`, `Label`, `Select`, `Switch`, `Badge`, `Alert`, `AlertDialog`, `DropdownMenu`, `Separator` | Chrome |
| `StatusDot` | Visibility in lists (success = Activa, warning = Cerrada, neutral = Oculta) |
| `Heading` | Public and admin titles |
| `UploadButton` / UploadThing | Image bytes |
| `@dnd-kit` (already in banners) | Sort order |
| `sonner` | Toasts |
| `requireAdminOrFestivalAdmin` pattern | New `requireAdmin()` helper |

### New, reusable (only these)

Keep names generic. Categories are the first consumer, not the only one.

**Atom — `MediaPlaceholder`**  
Dashed muted tile, icon, optional short label. Any list or card that can lack an image.

**Molecule — `EntityThumbnail`**  
Fixed-size image or `MediaPlaceholder`. Props: `src`, `alt`, `size`. Admin rows and public cards both use it.

**Molecule — `CountLabel`**  
`12 participantes` / `3 stands`. Number + noun, tabular nums. List rows and the delete dialog share it.

**Molecule — `RichTextHtml`**  
Renders already-sanitized HTML with a tight class list (`prose`-like, no Tailwind Typography plugin required). Public cards and an optional admin preview.

**Molecule — `ImageUploadField`**  
Preview + UploadThing + remove. Visual sibling of `form/fields/file.tsx`, which stays URL-oriented. Do not migrate program artwork in this project unless it is a one-line swap.

**Organism — `RichTextEditor`**  
Client-only BlockNote wrapper. Props: `variant` (`compact` \| `article`), `initialContent` (JSON), `onChange(json, html)`, `placeholder`, `editable`, optional `uploadFile` (article only). No category-specific fields. Categorías pass `variant="compact"` and omit `uploadFile`.

**Organism — `ImpactConfirmDialog`**  
Generic destructive confirm: title, description, list of `{ label, count, tone }`, `blocked` (disables confirm), confirm label. Built on existing `AlertDialog`. Replaces the current subcategory delete modal and is usable for other “this is used by N records” deletes.

**Organism — not created:** a “Shopify two-column editor layout”. That is a page-level `grid` of `Card`s. A wrapper component would only hide the grid.

Category-specific files stay thin: a list page organism that maps áreas → rows, and an editor page that fills the cards. They live under `app/components/categories/` (new folder, public-facing name) rather than growing `app/components/subcategories/`.

---

## 9. Screens and routes

| Route | Access | Role |
| --- | --- | --- |
| `/dashboard/categories` | Admin | Grouped list |
| `/dashboard/categories/new` | Admin | Create editor |
| `/dashboard/categories/[id]/edit` | Admin | Edit editor |
| `/festivals/categories` | Public | Grouped cards |
| `/dashboard/subcategories` | Redirect 308 → `/dashboard/categories` | Keep old bookmarks |

Nav labels: **Categorías** in desktop menu and mobile sidebar (replace “Subcategorías”).

Festival admins hitting the new routes: redirect to `/dashboard` (same idea as store pages that are admin-only). Enforce again inside every server action with `requireAdmin()`.

---

## 10. Server layer

New module `app/lib/categories/` (public name) wrapping the same table. Keep `app/lib/subcategories/definitions.ts` as a re-export until call sites are updated, or update call sites in the same change set.

Actions (all `"use server"`, all `requireAdmin()` except reads used by the public page):

| Action | Notes |
| --- | --- |
| `fetchPublicCategories()` | `visibility in (listed, selectable)`, ordered by área then `sort_order`. Cached. |
| `fetchAdminCategories()` | All rows + aggregated counts (verified, paused, pending, rejected, banned, stands). |
| `createCategory` | Label + área required. Defaults: `selectable`, flags false. |
| `updateCategory` | Name, área, JSON+HTML, image, visibility, flags, sort. |
| `reorderCategories` | Array of `{ id, sortOrder }` within one área. |
| `deleteCategory` | One transaction: `SELECT … FOR UPDATE` on the category row (serializes with concurrent `profile_subcategories` / `stand_subcategories` inserts, which take a key-share lock on the parent), re-check blocking counts, then `DELETE` (CASCADE). Guard and delete are one atomic policy decision. Default `READ COMMITTED` plus the row lock is enough. Test: concurrent delete vs relationship insert. |
| `fetchSelectableCategories()` | Onboarding + profile edit: `selectable` and not `is_admin_assignable_only`. |
| `fetchAdminAssignableCategories()` | Profile edit by admin: not `hidden`. |

Revalidate `/festivals/categories` and `/dashboard/categories` on every write.

Auth helper: add `requireAdmin()` next to `requireAdminOrFestivalAdmin()` in `app/lib/users/helpers.ts`.

UploadThing: new `categoryImage` route, `admin` only, 4MB, one file, returns `{ imageUrl, fileKey }`. Persist both `image_url` and `image_file_key`. On replace or delete, remove the previous file with the stored key.

Onboarding change: `filterSubcategories` drops the `skin` / `sublimación` string checks and uses `isExclusive` / `isAdminAssignableOnly` from the row.

---

## 11. Migration and backfill

Single Drizzle migration, then a data backfill in the same SQL file (or a follow-up `scripts/` one-shot if matching is easier in TypeScript).

1. Create enum `category_visibility`.
2. Add new columns with defaults.
3. Rename TS field `descrption` → `description` is a schema-only fix; SQL column already `description`.
4. Backfill HTML: if `description_json` is empty and `description` is non-empty, store a single paragraph in JSON and set `description_html` to `<p>` plus HTML-escaped legacy text (`&`, `<`, `>`). Expect empty in production today.
5. Match hardcoded cards to rows by normalized label (lowercase, strip accents, treat `/` and extra spaces as equivalent). Write `description_html` + a minimal `description_json` of paragraphs.
6. Insert **Ilustración Digital** and **Postres** if no row matches those normalized names under the right área. Seed their copy from the current Ilustración / Gastronomía cards.
7. Set `is_exclusive = true` where normalized label contains `skincare` / `skin care`.
8. Set `is_admin_assignable_only = true` and `visibility = 'listed'` where normalized label contains `sublimacion`.
9. Drop unused plain `description` only after the copy in step 4 succeeds.
10. Preflight labels with the same canonicalization as step 5. If any `(category, canonical label)` still has duplicates, abort with an actionable report (ids, área, raw labels) or resolve them first. Only then create the unique index on `(category, lower(label))`.

Unmatched hardcoded titles stay logged in the migration comments so they can be created by hand. Unmatched DB rows stay `selectable` with empty copy (they already appear in onboarding).

---

## 12. Implementation phases

### Phase 0 — Contracts

- Visibility enum, flags, counts, delete rules as in this doc.
- Single editor: BlockNote. Compact vs article schemas. No direct `@tiptap/*`, no XL, no Mantine.
- Shared `blocksToSanitizedHtml` contract (same helper the blog will call).
- Spanish copy sheet for visibility, delete blocked/allowed, rename warning.

### Phase 1 — Schema, auth, queries

- Migration + backfill.
- `requireAdmin()`.
- Fetchers with counts.
- Unit tests: visibility → public/picker matrix; delete blocked vs warned; exclusive / admin-only filters; label normalization used in backfill.

### Phase 2 — Shared UI primitives

- `MediaPlaceholder`, `EntityThumbnail`, `CountLabel`, `RichTextHtml`, `ImageUploadField`, `RichTextEditor`, `ImpactConfirmDialog`.
- `app/lib/rich-text/{schemas,render}.ts` with `compact` implemented and `article` exported as the blog-ready superset.
- Wire BlockNote shadcn `@source` in the global CSS.
- Story-like usage is not required; a thin editor playground is not in scope.

### Phase 3 — Admin list + editor

- Routes, nav, redirect from `/dashboard/subcategories`.
- Grouped list, reorder, create/edit form.
- Delete dialog with live counts.
- Festival admin cannot load the pages or call the actions.

### Phase 4 — Public page + onboarding

- Replace hardcoded `SubcategoriesDescription`.
- Onboarding and admin profile-category forms consume flags + `fetchSelectableCategories` / `fetchAdminAssignableCategories`.
- Public page shows placeholder images and listed-but-closed caption.

### Phase 5 — Hardening

- Sanitize HTML on write; reject javascript: hrefs.
- If image is replaced or the row is deleted, delete the previous UploadThing file with the stored `image_file_key` (existing `deleteFile`).
- `pnpm exec vitest run` for new tests; smoke the three admin screens and `/festivals/categories` in the browser (desktop + a mobile width).

---

## 13. Non-goals

- Redesign of the public categories page beyond grouped image cards.
- Promoting áreas into their own table or retiring `users.category`.
- Per-categoría public URLs / slugs.
- Bulk delete / bulk visibility.
- Letting festival admins manage the catalog.
- Merging `feat/blog` in this change set (the editor API must be ready for it).
- Adding Tiptap as a direct dependency, BlockNote XL, Mantine, Tiptap Cloud, or collaborative editing.
- Migrating program/banner image fields onto `ImageUploadField` in this change set.
- Changing how stands store subcategory IDs.

---

## 14. Test plan

**Automated**

- Visibility matrix (hidden / listed / selectable × public × picker × admin-assignable-only).
- Delete: verified blocks; stands block; only pending/paused/rejected/banned warns and allows.
- Exclusive: selecting an exclusive row clears others; selecting another row hides exclusive options (same behavior as today’s Skincare, driven by the flag).
- Admin-assignable-only excluded from participant picker, present in admin assign list when not hidden.
- Unique label per área.
- HTML sanitizer strips `script` and `javascript:` links.
- Compact schema rejects image/video/file blocks; article schema allows image (unit test on the schema helpers).

**Manual (browser)**

- Create a categoría with image + formatted text (bold, italic, list, link); it appears under the right área on `/festivals/categories`.
- Set to Oculta: disappears from public page and onboarding.
- Set to Visible, cerrada: stays on public page with caption; gone from onboarding.
- Delete blocked row: confirm disabled, counts visible.
- Delete unused row: warning if pending profiles exist; row gone after confirm.
- Rename / move a used row: warning shows; save succeeds; onboarding and public page follow the new área.
- Festival admin: no nav item, URL redirects.
- Missing image and empty body still produce a valid card.

---

## 15. File touch list (expected)

- `db/schema.ts` — columns, enum, relations unchanged besides new fields (`image_file_key` included).
- `drizzle/*.sql` — generated migration + backfill.
- `app/api/uploadthing/core.ts` — `categoryImage`.
- `app/lib/users/helpers.ts` — `requireAdmin`.
- `app/lib/categories/*` — actions, schema, label match.
- `app/lib/rich-text/schemas.ts`, `render.ts` — compact/article schemas + `blocksToSanitizedHtml`.
- `app/components/atoms/media-placeholder.tsx`
- `app/components/molecules/entity-thumbnail.tsx`, `count-label.tsx`, `rich-text-html.tsx`, `image-upload-field.tsx`
- `app/components/organisms/rich-text-editor.tsx`, `impact-confirm-dialog.tsx`
- `app/components/categories/*` — list + editor (thin)
- `app/dashboard/categories/**`
- `app/(routes)/festivals/categories/page.tsx`
- `app/components/user_profile/creation-process/categories.tsx` — flag-based filters
- Nav: `navigation-menu.tsx`, `mobile-sidebar.tsx`
- Global CSS — `@source` for `@blocknote/shadcn`
- `package.json` — `@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn`, `@blocknote/server-util`, sanitizer (`isomorphic-dompurify` or equivalent). No `@tiptap/*`, no `@blocknote/mantine`, no `@blocknote/xl-*`.

Existing `app/components/subcategories/*` create/delete UI is deleted or reduced to re-exports once the new routes ship.
