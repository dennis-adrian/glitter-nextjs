# Coupon Book Feature PRD

## 1) Overview

The Coupon Book feature enables festival admins to compose, edit, preview, save, and print coupon books for `coupon_book` festival activities. The editor starts from approved and, optionally, pending-review participant promotion proofs, then lets admins adjust the coupon book before printing: edit the default courtesy coupon, edit any participant coupon, configure coupon count per page, move participants between coupon book pages, tune global layout, and apply per-coupon overrides where needed.

The printable version must follow the editor's current state, including unsaved local draft changes. Preview and PDF export target near-WYSIWYG parity (<=2px layout tolerance); QA passes only when corresponding element bounds between preview and exported PDF differ by no more than 2px and text fit behavior is identical.

## 2) Current Implementation Analysis

- Review route: `app/dashboard/festivals/[id]/festival_activities/[activityId]/review/couponbook/page.tsx` loads the activity, builds coupon book variants from activity details, hydrates participant preview data, and passes variants to the client preview component.
- Builder: `app/lib/festival_activites/coupon-book-builder.ts` creates one `CouponBookVariant` per activity detail. Participant coupons come from text proofs with `approved` or `pending_review` status, excluding removed participants.
- Courtesy coupon: `COURTESY_COUPON_ENTRY` is a hard-coded default coupon rendered in the first top-right header slot of every printed page.
- Pagination: `paginateCouponBookEntries` uses a fixed 26 dynamic coupons per coupon book page: one header dynamic slot plus 25 body slots. This is independent of the activity participant limit today, but it is not admin configurable.
- Preview state: `coupon-book-preview-client.tsx` stores only global text layout and PDF canvas settings in local storage. It does not store coupon content edits, courtesy coupon edits, coupon page assignments, coupon count per page, or per-coupon layout overrides.
- Print/export state: the print route (`app/couponbook-print/[id]/[activityId]/page.tsx`) rebuilds variants from database data and query-string layout config. Because it does not receive the full editor draft, unsaved edits and participant moves cannot be reflected in printable output today.
- Export endpoint: `POST /api/festival_activities/[activityId]/couponbook/export` accepts the editor draft and uses Playwright to generate a PDF. Legacy `GET` on the same path rebuilds from live DB state only and does not reflect saved or local editor changes.

## 3) Problem Statement

Admins need to produce complete, print-ready coupon books even when activity variants have uneven or incomplete participation. The current workflow is too rigid because coupon page composition is derived directly from activity details, the default coupon is fixed, participant coupons cannot be edited in the review workflow, and printable output can only represent database state plus a small set of layout query params.

## 4) Goals

- Let admins edit the default courtesy coupon.
- Let admins edit every participant promotion/coupon entry before printing.
- Let admins toggle the coupon book preview between approved participants only and approved + pending-review participants.
- Let admins configure dynamic coupons per coupon book page regardless of the activity's participant limit.
- Let admins move participant coupons between coupon book pages without writing to the database during editing.
- Persist all editor settings and draft edits in local storage to survive page reloads.
- Save the edited coupon book state only when the admin explicitly clicks Save.
- Let all coupons inherit the same default template for position and sizing while allowing individual coupon overrides.
- Ensure preview and printable PDF always use the current editor state.
- Preserve near-WYSIWYG parity between preview and PDF export.

## 5) Non-Goals

- End-user/self-service coupon generation.
- Changing activity enrollment, participant approval, proof status, or activity variant membership when a coupon is moved between coupon book pages.
- A generic document designer for arbitrary layouts outside coupon books.
- Automatic balancing that changes the source activity details or participant records.
- Server-side collaborative editing or real-time multi-admin conflict resolution in this iteration.

## 6) Users & Roles

- Primary user: `admin` / `festival_admin`.
- Only authorized admins can access the coupon book editor, save endpoint, print route, and export endpoint.

## 7) User Stories

- As an admin, I can edit the default courtesy coupon so the printed sample/promo matches the event's needs.
- As an admin, I can edit any coupon's displayed name, stand labels, sector, image/avatar, highlight, description, and conditions/validity text.
- As an admin, I can preview and export only approved participant coupons when pending-review coupons should be excluded.
- As an admin, I can include pending-review participant coupons when preparing a fuller draft before final approval.
- As an admin, I can choose how many participant coupons fit in one coupon book page.
- As an admin, I can move coupons between coupon book pages to fill incomplete books without changing participant records.
- As an admin, I can use a global layout template so most coupons remain consistent.
- As an admin, I can override an individual coupon's content layout when that coupon needs special handling.
- As an admin, I can reload the page and continue from my latest local draft.
- As an admin, I can reset the editor back to the original generated defaults.
- As an admin, I can print or export the exact coupon book currently shown in the editor, including unsaved local draft changes.
- As an admin, I can Save once I am satisfied, committing the edited coupon book state.

## 8) Functional Requirements

### 8.1 Source Data & Initial Draft

- On first load, generate an initial coupon book draft from current activity data:
  - One initial group/variant per activity detail.
  - Include participant text proofs according to the selected review-status filter.
  - Exclude removed participants.
  - Hydrate coupon display data with participant name, stand labels, sector, avatar/logo, promo highlight, promo description, and promo conditions.
- The initial draft must include the default courtesy coupon.
- If a saved coupon book configuration exists for the activity, the editor should load that saved configuration as the canonical starting point, then apply any newer local draft over it when available.
- If participant source data changed since the saved configuration, the editor must surface a reconciliation state for new, removed, or changed participant coupons.

### 8.2 Coupon Book Draft Model

The editor draft must represent the full printable state, not only layout controls.

Required draft fields:

- Draft metadata: `festivalId`, `activityId`, `schemaVersion`, `updatedAt`, and optional `savedRevision`.
- Global settings:
  - PDF canvas width, height, and orientation.
  - Coupon book page width/height.
  - Dynamic coupons per coupon book page.
  - Participant inclusion mode: approved only, or approved + pending review.
  - Global coupon layout template.
  - Header image scale and per-book header image references.
- Coupon books/pages:
  - Stable page/book ID.
  - Label.
  - Source activity detail ID when applicable.
  - Ordered coupon slot IDs.
  - Header image URL.
- Coupon entries:
  - Stable coupon ID.
  - Source participation ID when applicable.
  - `type`: `courtesy` or `participant`.
  - Editable display fields: participant/display name, stand labels, sector name, promo highlight, promo description, promo conditions/validity, image URL.
  - Source proof status for reference.
  - Optional per-coupon layout override.

### 8.3 Courtesy Coupon Editing

- The default courtesy coupon must be editable from the same editor workflow as participant coupons.
- Editable fields include name, stand labels, sector, image/logo, promo highlight, promo description, and validity text.
- Courtesy coupon edits are draft settings and must persist in local storage.
- Reset restores the courtesy coupon to `COURTESY_COUPON_ENTRY` defaults unless a saved server configuration is being reset to.

### 8.4 Participant Coupon Editing

- Every participant coupon entry must be editable by an admin.
- Editing a coupon changes only the coupon book draft until Save.
- Admins must be able to restore an edited participant coupon to its source proof/participant values.
- Empty validity/conditions should still render the fallback validity text unless the admin explicitly clears or overrides it according to the final UI rules.

### 8.5 Participant Status Filter

- Admins must be able to toggle the coupon book between:
  - Approved only: include participant coupons with proof status `approved`.
  - Approved + pending review: include participant coupons with proof status `approved` or `pending_review`.
- The selected inclusion mode must affect preview, page counts, coupon movement controls, local storage draft state, Save, and PDF export.
- Toggling the inclusion mode must not change proof statuses or participant records.
- When pending-review coupons are hidden, their draft edits and per-coupon overrides should be preserved so they can reappear if the admin toggles pending-review coupons back on.
- The UI must clearly display the active inclusion mode and the count of included/hidden coupons.

### 8.6 Coupon Count Per Page

- Admins must be able to configure the number of dynamic participant coupons per coupon book page.
- This setting must not be coupled to the activity's participant limit or activity detail capacity.
- The UI must show the resulting page count and empty slot count.
- Changing the coupon count per page must reflow coupons predictably while preserving manual ordering as much as possible.
- The courtesy coupon remains separate from the dynamic participant coupon count unless the UI explicitly adds a future option to include it in capacity.

### 8.7 Moving Coupons Between Coupon Book Pages

- Admins must be able to move participant coupons from one coupon book page to another.
- Supported interactions should include at least explicit move controls; drag-and-drop can be added if accessible keyboard alternatives exist.
- Moving a coupon changes only the draft assignment/order.
- Moving a coupon must not update activity detail membership, participation records, proof records, or any database row until Save.
- Save commits the edited coupon book composition/configuration, not the participant's source activity variant.

### 8.8 Global Layout & Per-Coupon Overrides

- All coupons inherit a global layout template by default:
  - Left column width.
  - Stand and sector font sizes.
  - Header image scale.
  - Text box position/size/multiline behavior for name, highlight, description, and validity.
- Each individual coupon may define an override for:
  - Text box position/size/multiline behavior.
  - Left column width.
  - Stand and sector font sizes.
  - Image/avatar display behavior if added to the UI.
- The editor must make inheritance clear: unset values use the global template; overridden values affect only that coupon.
- Reset all settings removes per-coupon overrides and restores global defaults.

### 8.9 Local Storage Persistence

- All editor state must persist in local storage:
  - Global layout settings.
  - PDF canvas settings.
  - Participant inclusion mode.
  - Coupon count per page.
  - Courtesy coupon edits.
  - Participant coupon edits.
  - Coupon ordering and page assignments.
  - Per-coupon overrides.
  - Selected editor state where useful, such as selected page/coupon.
- Local storage key should be scoped by festival ID, activity ID, and schema version.
- The editor must tolerate malformed or older local storage data by migrating when possible or falling back safely.
- The Reset button must reset all local editor settings and draft edits, not only layout controls.

### 8.10 Save Behavior

- Provide an explicit Save action.
- Before Save, changes remain local draft state and must not mutate the database.
- On Save, persist the coupon book configuration needed to reproduce the current editor state.
- Saved state should include coupon composition, content overrides, global settings, per-coupon overrides, and print/export settings.
- Saved state should include the selected participant inclusion mode.
- Save should not rewrite source participant/proof data unless a future, separate action explicitly supports that.
- The UI must indicate unsaved changes and Save success/failure.

### 8.11 Preview & Printable Output

- Preview must render from the editor draft state.
- Printable route/export must render from the same draft state currently shown in preview.
- Exporting with unsaved local draft changes must still print those changes.
- Printable output must respect the active participant inclusion mode.
- Because the current GET query approach is insufficient for full draft state, implementation should use one of:
  - A draft print session API that stores a temporary serialized draft and passes a session ID to the print route.
  - A POST export endpoint that receives the serialized draft body.
  - Another equivalent mechanism that avoids rebuilding print output only from database state.
- The print renderer should continue to share visual components with preview wherever possible.

### 8.12 PDF Export

- Export one selected coupon book/page group or all coupon books from the current draft.
- PDF canvas dimensions and orientation remain configurable.
- Packing algorithm computes coupon book pages per physical sheet from canvas dimensions.
- Export must include only coupon book content, with no app chrome.
- Export must use the current draft, including coupon moves, content edits, courtesy coupon edits, coupon count per page, and per-coupon overrides.
- Export must respect whether the admin selected approved-only or approved + pending-review coupons.

## 9) UX Requirements

- Keep export controls visible in the page header.
- Add Save and unsaved-change status near the export controls.
- The editor panel must include sections for:
  - PDF settings.
  - Participant status filter.
  - Coupon book/page settings.
  - Global coupon layout.
  - Selected coupon content.
  - Selected coupon layout overrides.
- The preview should allow selecting a coupon so its content and override controls can be edited.
- Page navigation should show page count, coupon count, configured coupons per page, and empty slots.
- The status filter control should show included and hidden coupon counts.
- Moving coupons should be understandable without relying only on drag-and-drop.
- Reset must clearly communicate that it resets all local draft edits/settings.

## 10) Technical Design Summary

- Introduce a serializable `CouponBookDraft` domain model shared by preview, print, save, and export.
- Refactor pagination to accept `dynamicCouponsPerPage` and ordered coupon IDs instead of using only `COUPON_BOOK_DYNAMIC_SLOTS_PER_PAGE`.
- Refactor `CouponBookPrintPage` and `CouponBookCardPrint` to accept effective coupon config per entry: global template plus per-coupon override.
- Replace hard-coded courtesy coupon rendering with a courtesy coupon entry from the draft.
- Update local storage persistence from layout-only (`couponbook-layout:v1`) to full draft persistence with schema versioning.
- Add server persistence for saved coupon book configuration.
- Update print/export flow so it can render a full draft payload or temporary print session, not only query params.
- Preserve the existing Playwright PDF generation approach for deterministic output.

## 11) API Contract (Proposed)

Exact route names can be adjusted to existing API conventions, but the feature needs these capabilities:

- `GET /api/festival_activities/[activityId]/couponbook/config`
  - Returns saved coupon book configuration if present.
  - Returns enough metadata to reconcile with current participant/proof source data.

- `PUT /api/festival_activities/[activityId]/couponbook/config`
  - Persists the current draft as the saved coupon book configuration.
  - Requires `admin` or `festival_admin`.
  - Validates draft schema version, activity ownership, source participation IDs, and payload size.

- `POST /api/festival_activities/[activityId]/couponbook/export`
  - Receives the current draft payload and export scope.
  - Returns PDF binary.
  - Supports selected page/book or all pages/books.

Alternative: keep the current `GET /export` route only for saved-state export, and add a temporary print-session route for unsaved drafts. The chosen design must satisfy the requirement that printable output follows the current editor state.

## 12) Data & Persistence

- Local storage is the immediate draft persistence layer and protects admins from losing work on reload.
- Server persistence is the saved configuration layer and is updated only by explicit Save.
- Suggested storage model:
  - A coupon book configuration table keyed by `activityId`.
  - JSON payload for draft/config data.
  - `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, and `revision`.
- The saved JSON must be versioned so future layout/template changes can migrate cleanly.
- Payload validation must reject invalid source participation IDs for the activity and unsafe image URLs.

## 13) Acceptance Criteria

1. Admin can edit the default courtesy coupon and see those edits in preview and PDF.
2. Admin can edit every participant coupon's displayed promotion fields.
3. Admin can toggle between approved-only coupons and approved + pending-review coupons.
4. The active participant status filter affects preview, page counts, Save, and PDF export.
5. Admin can configure dynamic coupons per coupon book page independently from participant limits.
6. Admin can move participant coupons between coupon book pages without changing activity detail membership or participant/proof records.
7. Before Save, reload restores all draft edits from local storage.
8. Reset clears all local draft edits/settings and restores generated defaults or saved defaults according to the chosen reset mode.
9. Save persists the coupon book configuration and reloads use the saved state as the starting point.
10. Global coupon layout applies to all coupons by default.
11. Individual coupon layout overrides affect only that coupon.
12. Preview and PDF export reflect the current editor draft, including unsaved local changes.
13. Exported PDF includes only coupon book content and keeps the existing no-chrome behavior.
14. Text fitting remains consistent between preview and PDF with no clipping/ellipsis regressions.
15. Empty validity conditions render fallback validity text consistently.
16. Malformed local storage data does not break the editor.

## 14) Risks & Mitigations

- Risk: Full draft payloads become too large for query strings.
  - Mitigation: use POST export or temporary server-side print sessions.
- Risk: Admin edits diverge from later participant proof changes.
  - Mitigation: store source metadata and show reconciliation for changed/new/removed source coupons.
- Risk: Preview/PDF divergence over time.
  - Mitigation: share print components and render PDF from the same draft model.
- Risk: Per-coupon overrides make the UI complex.
  - Mitigation: use global defaults first, expose overrides only for selected coupon editing, and provide restore-to-global controls.
- Risk: Local storage schema changes break existing drafts.
  - Mitigation: version local storage keys and add migrations/fallback.

## 15) Future Enhancements

- Drag-and-drop coupon rearrangement with keyboard parity.
- Named layout presets per festival.
- Visual diff/reconciliation for source proof changes.
- Export job queue + progress UI for very large coupon books.
- Visual regression tests for print fidelity.
- Custom courtesy coupon templates per festival.
