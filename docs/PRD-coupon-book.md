# Coupon Book Feature PRD

## 1) Overview

The Coupon Book feature enables festival admins to generate a printable coupon sheet from participant proof content in festival activities. It provides a collapsible side panel for layout tuning and exports high-fidelity PDFs with configurable sheet size/orientation. The preview is WYSIWYG in that it matches print output exactly.

The implementation is designed so preview and print use the same visual structure, minimizing divergence between UI and exported documents.

## 2) Problem Statement

Admins need to:

- Build a couponbook that matches a specific print template.
- Ensure all coupon text remains visible (no clipping/ellipsis).
- Control print output dimensions and packing per sheet.
- Export reliable, consistent PDFs for production printing.

## 3) Goals

- Provide exact-ish print preview parity with final PDF.
- Support dynamic text fitting so content is always visible.
- Include only approved + pending-review proofs.
- Allow admin-controlled layout tuning (text boxes, columns, font sizes, header image scale).
- Persist editor configuration locally across reloads.
- Generate PDF with configurable canvas width, height, and orientation.
- Centralize export endpoint under API routing conventions.

## 4) Non-Goals

- End-user/self-service coupon generation (this is admin review workflow).
- Generic document designer for arbitrary layouts.
- Persistent server-side storage of per-admin layout presets (currently local storage).
- Full visual editor for non-coupon activity types.

## 5) Users & Roles

- Primary user: `admin` / `festival_admin`
- Permissions: Only these roles can access export and print routes.

## 6) User Stories

- As an admin, I can preview couponbooks exactly as they will print.
- As an admin, I can export one variant or all variants to PDF.
- As an admin, I can adjust text containers (position/size), multiline behavior, and font settings.
- As an admin, I can tune sheet dimensions/orientation to control how many couponbooks fit per sheet.
- As an admin, I can use a header image per variant and scale it without cropping.

## 7) Functional Requirements

### 7.1 Data Inclusion Rules

- Source: festival activity participants/proofs.
- Include proofs with status: `approved`, `pending_review`.
- Exclude removed participants.
- Hydrate coupon entries with participant name, stand labels, sector, avatar/logo where available.

### 7.2 Couponbook Composition

- Fixed couponbook page size: `21.59cm x 16.5cm`.
- Grid layout:
  - Header area with 3-column header region + 2 coupon slots on top-right.
  - First top-right slot is fixed courtesy/sample coupon.
  - Second top-right slot is first dynamic coupon.
  - Remaining dynamic coupons fill body slots.
- Pagination implemented when entries exceed page capacity.

### 7.3 Preview & Layout Editor

- WYSIWYG page preview for selected variant and selected page.
- Layout controls live in a collapsible side panel (inline on desktop, Sheet overlay on mobile).
- Configurable:
  - Text boxes: `name`, `highlight`, `description`, `validity` (x/y/width/height). Multiline behavior is fixed to per-box defaults and is not exposed in the UI.
  - Coupon column split (left column width %).
  - Left-column font sizes (stand, sector).
  - Header image scale (%).
  - PDF canvas: width cm, height cm, orientation.
- Local persistence via `localStorage`.
- Panel is toggled via an "Editor" button in the page header; hidden by default on mobile.

### 7.4 Dynamic Text Fitting

- Automatic font-size fitting with min/max constraints.
- Supports single-line and multiline modes per text box.
- Must avoid clipping and ellipsis in both preview and PDF output.

### 7.5 Header & Visual Assets

- Variant-level dedicated header image field is supported.
- Header image uses contain-style fitting and adjustable scale.
- Courtesy coupon uses branded logo sample with white avatar background.
- No couponbook watermark/background image in final output.

### 7.6 PDF Export

- Endpoint: `/api/festival_activities/[activityId]/couponbook/export`.
- Query parameters include layout config + PDF canvas options + optional `detailId`.
- Exports:
  - One variant (when `detailId` provided),
  - All variants (when omitted).
- Uses Playwright server-side rendering for deterministic print output.
- Uses cookie forwarding for authenticated render.
- Isolates printable DOM root to avoid app chrome (navbar/footer) in PDF.

## 8) Technical Design Summary

- Render source of truth: React print page route (`/couponbook-print/[festivalId]/[activityId]`).
- Export flow: API route opens print page in Playwright and prints to PDF.
- Shared config parser: `coupon-book-print-config` parses layout/pdf query values.
- Print precision: dimensions converted to inches with fixed precision for PDF API.
- Packing algorithm: computes rows/columns/slots per sheet from canvas dimensions.

## 9) API Contract (Current)

`GET /api/festival_activities/[activityId]/couponbook/export`

Query params (key examples):

- `detailId` (optional)
- `pdfWcm`, `pdfHcm`, `pdfOrientation`
- `leftColW`, `standFsMm`, `sectorFsMm`, `headerScalePct`
- `nameX/nameY/nameW/nameH/nameM`
- `highlightX/...`
- `descriptionX/...`
- `validityX/...`

Response:

- `200` PDF binary (`application/pdf`)
- `401` unauthorized
- `400` invalid params
- `404` activity not found
- `500` Playwright missing

## 10) UX Requirements

- Preview must match printed couponbook layout.
- Export controls (variant + all variants) are always visible in the page header, independent of the editor panel state.
- Real-time feedback on expected couponbooks-per-sheet based on current canvas settings, shown in the layout editor panel.

## 11) Acceptance Criteria

1. Exported PDF includes only couponbook content (no site navbar/footer).
2. Preview and PDF have consistent layout and text fit behavior.
3. Empty conditions show fallback validity text; non-empty conditions show provided value.
4. Stand and sector render in printable output when available.
5. Header image displays with contain behavior and scale control.
6. PDF canvas dimensions and orientation materially affect packing and page size.
7. Layout settings persist across reloads locally.
8. Endpoint is centralized under `/api/...` and functional from review UI.

## 12) Risks & Mitigations

- Risk: Preview/PDF divergence over time.
  - Mitigation: Keep print rendering through shared React print page.
- Risk: Font/render differences across environments.
  - Mitigation: Server-side Playwright + explicit fitting pass + fixed physical units.
- Risk: Large exports impacting performance.
  - Mitigation: Paginate and sheet-pack efficiently; future: background jobs if needed.

## 13) Future Enhancements

- Persist layout presets server-side (per activity/admin/team).
- Add explicit template versioning.
- Add export job queue + progress UI for very large datasets.
- Add visual regression tests for print fidelity.
- Support custom courtesy coupon templates per festival.
