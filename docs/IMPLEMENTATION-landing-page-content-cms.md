# Implementation: Landing Page Content CMS

**Product:** Glitter
**Date:** 2026-08-26
**Status:** Implemented
**Target:** Next.js 16 App Router, React 19, PostgreSQL/Drizzle

---

## 1. Decision

Build a structured landing-page editor inside the existing Glitter dashboard.

Keep the landing page's layout, component behavior, typography, and responsive rules in code. Store
only validated content and presentation-safe configuration in PostgreSQL. Do not build a free-form
page builder or integrate an external CMS.

The editor will have one persistent draft and immutable publication snapshots. Saving a draft never
changes the public page. Publishing copies the complete validated draft into a new snapshot in one
transaction, so visitors never see a partially updated page.

## 2. Why this shape

The landing implementation already has two CMS-like data sources:

- the next-event section reads the active festival;
- the marketing carousel is managed at `/dashboard/banners`.

The rest of `app/components/landing/landing-v4.tsx` is hard-coded: hero copy, audience cards,
festival-family copy and dates, gallery, testimonials, partners, sponsor CTA, contact details,
social links, and SEO defaults. These values are seasonal and should not require a code deployment.

A fixed content contract is preferable to arbitrary blocks because it:

- preserves the approved design;
- prevents unsafe HTML and broken layout combinations;
- gives editors clear fields and image guidance;
- makes validation, previewing, accessibility, and migrations predictable;
- reuses the application's current database, authentication, uploads, and admin conventions.

## 3. Goals

- Let non-developers update routine landing content.
- Separate draft editing from public publishing.
- Preview the exact draft in the public landing layout.
- Publish the whole page atomically.
- Preserve every published version for auditing and later restoration.
- Reuse festival records for event facts instead of duplicating dates and locations.
- Reuse the existing marketing-banner manager.
- Preserve the current landing output until the first CMS publication.
- Reject stale concurrent edits rather than silently overwriting them.

## 4. Non-goals

- Drag-and-drop construction of arbitrary components.
- Custom HTML, Markdown, scripts, CSS, or theme editing.
- Editing the participant portal or festival detail pages.
- Replacing festival administration or marketing-banner administration.
- Localization or multiple languages in the first release.
- Scheduled publishing, approval comments, or multi-step editorial workflows.
- Automatic deletion of replaced media in the first release.
- An external CMS dependency.

## 5. Content ownership

| Content                                                                    | Source of truth                                    | CMS behavior                                                         |
| -------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| Hero, audience, gallery, testimonials, partners, sponsor CTA, footer       | Landing content publication                        | Editable                                                             |
| SEO title, description, social image                                       | Landing content publication                        | Editable                                                             |
| Marketing carousel items                                                   | Existing `marketing_banners` table                 | Existing manager; landing CMS controls only section visibility/order |
| Featured event name, dates, location, description, art, registration state | `festivals` and `festival_dates`                   | CMS selects automatic active festival or one eligible festival       |
| Festival-family brand copy, badge, fallback image, CTA label               | Landing content publication                        | Editable                                                             |
| Festival-family next occurrence                                            | `festivals` and `festival_dates` by `festivalType` | Derived; hidden when no eligible occurrence exists                   |
| Component layout, colors, typography, breakpoints                          | Source code                                        | Not editable                                                         |

Eligible public festival records are `published` or `active`. Draft festival information must never
leak through the landing page or preview payload unless the viewer is an authorized editor viewing
the draft preview.

## 6. Roles and permissions

Recommended first-release policy:

| Capability                         | `admin` | `festival_admin` | Other signed-in user                         | Anonymous |
| ---------------------------------- | ------- | ---------------- | -------------------------------------------- | --------- |
| Read published content             | Yes     | Yes              | Redirected to portal by current `/` behavior | Yes       |
| Read draft metadata/content        | Yes     | Yes              | No                                           | No        |
| Edit and save draft                | Yes     | Yes              | No                                           | No        |
| Preview draft                      | Yes     | Yes              | No                                           | No        |
| Publish draft                      | Yes     | No               | No                                           | No        |
| Copy an old publication into draft | Yes     | No               | No                                           | No        |

The dashboard layout is not the security boundary. Every read of draft data, mutation, preview,
and upload endpoint must repeat server-side authorization. Use
`requireAdminOrFestivalAdmin()` for editing/previewing and an explicit `role === "admin"` check for
publishing/restoring.

## 7. Content contract

Create one shared Zod schema in `app/lib/landing_content/schema.ts`. Use it for:

- client form validation;
- every server action input;
- data read validation before rendering;
- publication validation;
- schema-version migrations later.

The stored document is JSON, but its shape is fixed and versioned:

```ts
type LandingSectionKey =
  | "marketing_banners"
  | "event_spotlight"
  | "audience"
  | "festival_family"
  | "community"
  | "partners";

type LinkContent = {
  label: string;
  href: string;
};

type CardCtaContent = LinkContent & { show: boolean };

type EventCtaContent = {
  label: string;
  destination: "festival" | "registration" | "custom";
  href: string | null;
  show: boolean;
};

type LandingSectionBackground = "default" | "none" | "purple" | "coral";

type ImageContent = {
  url: string;
  alt: string;
  // Percentage crop anchor. Missing values render centered.
  focalPoint?: { x: number; y: number };
  // Crop magnification. Missing values use the cover baseline.
  zoom?: number;
};

type LandingPageContentV1 = {
  schemaVersion: 1;
  announcement: {
    display: "stacked" | "rotating";
    rotationIntervalSeconds: number;
    items: Array<{
      id: string;
      text: string;
      href: string | null;
    }>;
  };
  seo: {
    title: string;
    description: string;
    shareImageUrl: string | null;
  };
  hero: {
    titleLead: string;
    titleAccent: string;
    body: string;
    image: ImageContent;
    primaryCta: CardCtaContent;
    secondaryCta: CardCtaContent;
  };
  sectionOrder: LandingSectionKey[];
  sectionBackgrounds: Record<LandingSectionKey, LandingSectionBackground>;
  sections: {
    marketingBanners: {
      enabled: boolean;
    };
    eventSpotlight: {
      enabled: boolean;
      source: "active" | "selected";
      festivalId: number | null;
      primaryCta: EventCtaContent;
      secondaryCta: EventCtaContent;
    };
    audience: {
      enabled: boolean;
      heading: string;
      items: Array<{
        id: string;
        title: string;
        description: string;
        image: ImageContent;
        cta: CardCtaContent;
        featured: boolean;
      }>;
    };
    festivalFamily: {
      enabled: boolean;
      heading: string;
      body: string;
      items: Array<{
        id: string;
        festivalType: "glitter" | "twinkler" | "festicker";
        displayName: string;
        badge: string;
        description: string;
        fallbackImage: ImageContent;
        href: string | null;
        showCta: boolean;
      }>;
    };
    community: {
      enabled: boolean;
      heading: string;
      body: string;
      gallery: Array<{
        id: string;
        image: ImageContent;
      }>;
      testimonialHeading: string;
      testimonials: Array<{
        id: string;
        quote: string;
        name: string;
        role: string;
        image: ImageContent;
      }>;
    };
    partners: {
      enabled: boolean;
      heading: string;
      items: Array<{
        id: string;
        // Used as image alt text and text fallback when no logo is configured.
        name: string;
        image: ImageContent | null;
        href: string | null;
      }>;
      sponsorCta: {
        heading: string;
        body: string;
        image: ImageContent;
        email: string;
        emailLabel: string;
        buttonLabel: string;
        emailSubject: string;
        showButton: boolean;
      };
    };
  };
  footer: {
    logo: ImageContent;
    description: string;
    festivalLinks: LinkContent[];
    communityLinks: LinkContent[];
    contactEmail: string;
    location: string;
    copyrightText: string;
    socialLinks: Array<{
      id: string;
      network: "instagram" | "facebook" | "x" | "tiktok" | "other";
      label: string;
      href: string;
    }>;
  };
};
```

Hero and footer remain fixed at the beginning and end. `sectionOrder` controls only the six middle
sections and must contain every key exactly once. Each section has its own `enabled` flag.

### 7.1 Validation limits

Server validation is authoritative. Suggested limits:

| Field                      | Constraint                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Titles/headings/CTA labels | 1–120 characters                                                                                   |
| Descriptions/body/quotes   | 1–1,000 characters                                                                                 |
| Alt text                   | 1–240 characters for meaningful images; empty only for explicitly decorative images                |
| URL                        | Maximum 2,048 characters; internal `/...`, `https:`, `http:`; `mailto:` generated server-side only |
| Email                      | Valid email, maximum 254 characters                                                                |
| Audience cards             | 1–4                                                                                                |
| Festival-family cards      | 1–3; unique `festivalType`                                                                         |
| Gallery images             | 1–8                                                                                                |
| Image focal point          | Optional `x` and `y` percentages, each from 0–100; defaults to 50/50                               |
| Image zoom                 | Optional multiplier from 1–3; defaults to 1                                                        |
| Testimonials               | 0–6                                                                                                |
| Partners                   | 0–20                                                                                               |
| Footer links per group     | 0–10                                                                                               |
| Social links               | 0–8                                                                                                |
| Item IDs                   | UUID strings; unique within each collection                                                        |

Trim strings before persistence. Reject unknown object keys with strict Zod objects. Validate links
with a shared helper extracted from `app/lib/marketing_banners/validate-href.ts`; reject protocol-
relative URLs, control characters, and unsafe schemes. Do not render user-authored HTML.

For `eventSpotlight.source === "selected"`, `festivalId` is required and must resolve to an eligible
festival when publishing. For `source === "active"`, `festivalId` must be `null`.

## 8. Database design

Add two tables. The draft is mutable; publications are immutable.

### 8.1 `landing_page_drafts`

| Column               | Type            | Rules                                                         |
| -------------------- | --------------- | ------------------------------------------------------------- |
| `page_key`           | text PK         | First release uses `home`                                     |
| `content`            | jsonb           | Not null; typed as `LandingPageContentV1` in Drizzle          |
| `version`            | integer         | Not null, starts at 1, positive; optimistic-concurrency token |
| `updated_by_user_id` | FK → `users.id` | Nullable, `ON DELETE SET NULL`                                |
| `updated_at`         | timestamp       | Not null                                                      |
| `created_at`         | timestamp       | Not null                                                      |

### 8.2 `landing_page_publications`

| Column                 | Type            | Rules                                   |
| ---------------------- | --------------- | --------------------------------------- |
| `id`                   | serial PK       | Monotonic publication identifier        |
| `page_key`             | text            | Not null; first release uses `home`     |
| `content`              | jsonb           | Not null; immutable after insert        |
| `source_draft_version` | integer         | Positive; identifies what was published |
| `published_by_user_id` | FK → `users.id` | Nullable, `ON DELETE SET NULL`          |
| `published_at`         | timestamp       | Not null                                |

Indexes:

- `(page_key, id DESC)` for the latest publication;
- `(published_by_user_id)` for audit lookup.

Do not add update/delete actions for publication rows. Restoration copies a selected publication to
the draft and increments the draft version; it does not mutate history or immediately affect the
public page.

### 8.3 Bootstrap behavior

Move the current hard-coded values into `app/lib/landing_content/default-content.ts` as
`DEFAULT_LANDING_PAGE_CONTENT`.

- No draft row: the editor starts from the latest publication, or the code default if none exists.
- No publication row: the public page renders the code default.
- First draft save: insert the `home` draft.
- First publish: create publication #1.

This makes the database migration deployment-safe: the landing page remains unchanged before an
editor publishes anything, and rollback does not require deleting data.

## 9. Runtime architecture

```text
Anonymous GET /
  -> load latest published snapshot (or code default)
  -> resolve eligible festival references
  -> fetch visible public marketing banners
  -> render LandingPage

Editor GET /?preview=landing-draft
  -> authenticate admin/festival_admin
  -> load saved draft (or latest publication/default)
  -> resolve preview festival references
  -> render the same LandingPage component

Dashboard /dashboard/landing
  -> load draft + latest publication metadata + eligible festival options
  -> edit locally
  -> saveLandingPageDraft(content, expectedVersion)
  -> publishLandingPageDraft(expectedVersion) [admin only]
```

### 9.1 Data modules

Use a `server-only` data module, not a `use server` file, for reads:

```text
app/lib/landing_content/
  definitions.ts       # TypeScript types and UI labels
  schema.ts            # strict Zod content contract
  default-content.ts   # exact current content fallback
  data.ts              # draft/publication reads
  resolve.ts           # combines content with festival/banner data
  actions.ts           # authorized mutations only
  links.ts             # shared URL normalization/validation
```

Wrap request-local reads with React `cache()` so `generateMetadata()` and the page render can share
the same publication query within one request.

The root route is currently `force-dynamic` because it resolves the signed-in profile and redirects
signed-in users to `/portal`. Keep that behavior in the first release. Do not enable Cache
Components as part of this feature. After a successful publish, call `revalidatePath("/", "page")`
and revalidate `/dashboard/landing`; this is correct even while the page is dynamic and keeps the
implementation ready for later caching changes.

### 9.2 Resolution rules

`resolveLandingPage(content, mode)` returns render-ready data and contains no authorization logic.

- Public mode resolves only `published` or `active` festivals.
- Preview mode may show the editor's selected draft festival, but marks non-public festival data
  with a visible “Borrador” preview badge.
- Automatic spotlight uses the active festival. If none exists, omit the section instead of showing
  stale fallback event details.
- Selected spotlight uses the configured festival. If it becomes unavailable, public rendering
  omits the section and reports a server warning; publishing blocks until corrected.
- Festival-family cards find the next eligible festival occurrence matching `festivalType`. Name,
  date, art, and link come from that record when available. The configured fallback image and brand
  copy remain available when no occurrence exists; the “Próximo” row is then omitted.
- A disabled or empty marketing-banner section renders nothing.
- Invalid stored JSON never reaches a renderer. Log the validation failure and use the last valid
  publication or code default.

## 10. Draft and publishing behavior

### 10.1 Save draft

`saveLandingPageDraft({ content, expectedVersion })`:

1. Authenticate `admin` or `festival_admin`.
2. Parse and normalize the complete document with the shared schema.
3. Validate referenced festival IDs exist.
4. Insert the first draft or conditionally update `WHERE version = expectedVersion`.
5. Increment `version`, set `updatedByUserId` and `updatedAt`.
6. Return the new version and timestamp.

If the conditional update affects zero rows, return a conflict result. The UI must not overwrite the
newer draft. Offer “Recargar cambios” and let the editor copy their unsaved JSON locally if needed.

### 10.2 Publish

`publishLandingPageDraft({ expectedVersion })`:

1. Authenticate an `admin`.
2. Start a database transaction and lock the `home` draft row.
3. Verify its version equals `expectedVersion`.
4. Parse it again and run publish-time reference validation.
5. Insert one immutable publication containing the complete draft snapshot.
6. Commit, then revalidate `/` and `/dashboard/landing`.
7. Return the publication ID and timestamp.

The action never accepts content directly. It publishes the saved, version-checked server draft so
the admin knows exactly what preview was promoted.

### 10.3 Restore

`restoreLandingPublicationToDraft({ publicationId, expectedDraftVersion })` is admin-only. It copies
the selected snapshot to the draft and increments the draft version. The admin must preview and
publish it through the normal path.

History storage ships in the first migration; a full history/restore UI may follow after the core
editor if schedule requires.

## 11. Admin UX

Add `/dashboard/landing` with Spanish UI copy.

### 11.1 Page structure

- Sticky action bar: save state, last editor/time, “Guardar borrador”, “Guardar y previsualizar”,
  and admin-only “Publicar”.
- Status badge: never published, published, unpublished changes, or conflict.
- Accordion or tabs: SEO, hero, section order, event, audiences, festival family, community,
  partners, footer.
- Sortable middle-section list using the installed `@dnd-kit` keyboard and pointer sensors.
- Collection editors using `react-hook-form`, `zodResolver`, and `useFieldArray`.
- Inline image previews, dimensions/aspect-ratio guidance, alt-text fields, and upload progress.
- Gallery thumbnails open one crop modal with panning, keyboard nudging, zoom, and focal-point reset.
- Festival selectors populated from existing festival data; display status beside each option.
- Marketing-banner section includes visibility and position plus a link to `/dashboard/banners`.
- Unsaved-change warning before navigation.
- Publish confirmation showing draft version and last edit time.

Use explicit save rather than autosave. It reduces accidental overwrites and makes preview/publish
semantics understandable. “Guardar y previsualizar” saves successfully first, then opens the
preview URL in a new tab.

### 11.2 Preview

Extend `app/page.tsx` to recognize a private preview query, for example
`/?preview=landing-draft`:

- authorize before reading the draft;
- authorized editors bypass the existing signed-in redirect;
- unauthorized signed-in users retain the `/portal` redirect;
- anonymous requests with the preview query render normal published content or redirect to `/`;
- render the same component tree used by the public page;
- show a fixed “Vista previa del borrador” indicator;
- prevent indexing with preview-specific metadata.

Using the real root route preserves the actual navbar/footer behavior and responsive layout.

## 12. Landing component refactor

Split `landing-v4.tsx` without changing its visual output:

```text
app/components/landing/
  landing.tsx
  landing-page.tsx
  landing-page.types.ts
  sections/
    hero.tsx
    marketing-banners.tsx
    event-spotlight.tsx
    audience-gateway.tsx
    festival-family.tsx
    community-gallery.tsx
    partners.tsx
    landing-footer.tsx
```

Each section receives render-ready props. It must not query the database or interpret raw CMS JSON.
`landing.tsx` loads data and resolves it; `landing-page.tsx` renders hero, ordered enabled sections,
and footer.

Update the landing skeleton only where CMS-controlled section ordering makes the existing skeleton
misleading. Keep hero dimensions stable to reduce layout shift.

Add `generateMetadata()` to `app/page.tsx` using published SEO content. Preview metadata must include
`robots: { index: false, follow: false }`.

## 13. Media handling

Add a dedicated UploadThing endpoint such as `landingPageImageUploader`:

- authenticated `admin` or `festival_admin` only;
- images only;
- maximum 4 MB per file and one file per upload request;
- return the normalized URL and uploader identity;
- use the same permitted remote hosts already configured for `next/image`.

Do not use the generic `imageUploader` endpoint for the CMS because it only verifies that a Clerk
user is signed in.

Do not delete an old image when a draft field changes. The current publication or an older snapshot
may still reference it. Automatic reference-aware cleanup is deferred; expected CMS upload volume
is low. Editors may reuse URLs, and an operational cleanup task can later delete only assets absent
from the current draft and every retained publication.

## 14. Security and integrity

- Authorize every server action independently.
- Authorize the preview before loading or serializing draft content.
- Validate the complete document on client and server.
- Render plain text through React; never use `dangerouslySetInnerHTML`.
- Allow only safe internal and HTTP(S) links; generate `mailto:` links from validated email fields.
- Validate array sizes, string sizes, unique IDs, and exact section-key coverage.
- Validate selected festival existence/status again at publish time.
- Return narrow action results; do not return raw user rows or unpublished history unnecessarily.
- Do not include draft content in the public RSC payload.
- Use optimistic concurrency for draft writes and publishing.
- Log action name, page key, actor ID, and versions; do not log the full content document.
- Keep public rendering fail-safe: last valid publication or code default, never a 500 caused by bad
  CMS content.

## 15. Navigation

Add “Contenido de inicio” pointing to `/dashboard/landing` in desktop and mobile admin navigation.
Show it to both admin tiers. Keep “Carrusel inicio” as a separate destination because those banners
also serve the participant portal.

## 16. Migration and rollout

### Phase 1 — Content foundation

1. Define shared types, strict Zod schema, defaults, and pure resolution helpers.
2. Move every current hard-coded landing value into `DEFAULT_LANDING_PAGE_CONTENT`.
3. Refactor the renderer to consume the contract with pixel-equivalent output.
4. Add unit tests for schema/default validity and resolution.

### Phase 2 — Persistence and actions

1. Add Drizzle tables, relations, constraints, indexes, and generated migration.
2. Add public/draft readers with default fallback.
3. Add save, publish, and restore-to-draft actions with authorization and version checks.
4. Add the restricted landing image uploader.

### Phase 3 — Editor and preview

1. Build `/dashboard/landing` and section/collection editors.
2. Add sorting, visibility, festival selection, dirty-state handling, and conflicts.
3. Add exact root-route preview.
4. Add navigation entries and link to the existing banner manager.

### Phase 4 — Release

1. Deploy schema and fallback-driven renderer; verify public output is unchanged.
2. Populate/save a draft from defaults in production.
3. Preview desktop, tablet, and mobile widths.
4. Publish the first snapshot.
5. Verify metadata, event resolution, links, images, and public behavior.

Rollback is application-only: the previous build continues using hard-coded/default content. Leave
the additive tables in place. Never roll back by deleting publication history.

## 17. Test plan

### Unit tests

- Default content passes the V1 schema.
- Unknown fields, unsafe URLs, invalid email, oversize arrays/text, duplicate IDs/types, and invalid
  section order fail.
- Automatic and selected event resolution obey public/preview status rules.
- Missing event data omits only the affected section.
- Festival-family next occurrence is selected by dates, not deprecated `festivals.startDate` or
  `festivals.endDate`.
- Disabled sections do not render.
- Invalid stored content falls back safely.

### Action tests

- Unauthorized users cannot read/save/publish/restore/upload.
- `festival_admin` can save/preview but cannot publish/restore.
- Stale `expectedVersion` returns conflict and preserves the newer draft.
- Save does not create a publication.
- Publish snapshots exactly the saved draft and records the actor.
- Publish rejects an invalid or non-public selected festival.
- Restore changes only the draft.
- Successful publish triggers landing/dashboard revalidation.

### Integration tests

- First save with no rows creates one draft.
- Concurrent first saves do not create multiple drafts.
- Concurrent edits produce one success and one conflict.
- Concurrent publish/edit cannot publish a mixed document.
- Latest publication query returns the newest immutable snapshot.
- Deleting the publishing user preserves publication history via `SET NULL`.

### UI/E2E checks

- Anonymous `/` sees only published content.
- Saving a draft does not alter anonymous `/`.
- Both editor roles can preview the saved draft.
- Only admin sees and can execute publish.
- Reordering and disabling sections affects preview and then public output after publish.
- Keyboard sorting and all form controls are accessible.
- External links, internal links, email CTAs, images, and alt text behave correctly.
- Visual checks at mobile, tablet, and desktop widths show no major layout shift or overflow.
- Signed-in non-editors keep the current `/` → `/portal` redirect.

## 18. Verification commands

Run with Node 24:

```bash
pnpm generate
pnpm migrate
pnpm exec vitest run
pnpm exec eslint <changed files>
pnpm format:check
pnpm build
```

Apply the generated migration to the safeguarded test database before integration tests, following
the repository's `AGENTS.md` instructions.

## 19. Acceptance criteria

- Every currently hard-coded landing content value is represented in the default V1 contract.
- With no CMS rows, the public landing remains visually and functionally equivalent.
- Authorized editors can save, leave, return, and preview a draft.
- Draft saves never change public content.
- Admin publication changes all public sections in one atomic release.
- Concurrent/stale edits cannot silently overwrite each other.
- The event spotlight and occurrence dates come from eligible festival data.
- Marketing banners remain managed by the existing banner system.
- Invalid draft content cannot be published.
- Public rendering survives missing or invalid CMS/festival data.
- Draft content is inaccessible to unauthorized users.
- Published snapshots identify actor, time, and source draft version.
- The landing page remains responsive, accessible, and indexable; previews are not indexable.

## 20. Deferred follow-ups

- Publication-history and restore UI if not included in the first editor delivery.
- Scheduled publish/unpublish.
- Side-by-side draft/published diff.
- Per-field editorial comments or approvals.
- Reference-aware UploadThing cleanup.
- Localized content documents.
- Landing analytics tied to publication ID.
- Cache Components/tag-based caching if the application enables that Next.js model later.
