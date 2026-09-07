# PRD: Product Rentals

## 1) Overview

The Product Rentals feature allows store products to be offered for rent in addition to purchase. Admins can decide per product whether rentals share the same stock pool as sales or use a separate rental-only stock pool. When a rental order is created, the appropriate stock pool decreases; when an admin marks rented units as returned, that same pool increases again.

Rentals are only available to authenticated, verified users who are active participants in an active festival and have an accepted stand reservation for the festival they select as the rental context. Guest users and unverified, rejected, or banned users can still use the regular purchase flow where allowed, but they cannot rent products.

Rental availability and pricing are visible to everyone who can view the product. This does **not** change page-level access: the supplies store that lists rentable products remains restricted to verified users (non-verified users are redirected away as today). The change is that, among users who can already see the product, rental information is no longer hidden from those who are not rental-eligible. Rather than hiding rental components from ineligible viewers, the store shows rental information everywhere it is relevant (product cards and product detail pages) but keeps the rental action disabled by default and only enables it for eligible users. Ineligible viewers (e.g. a verified user without an accepted reservation in an active festival) see a notice on the product detail page explaining why renting is unavailable. Eligibility still gates the action itself, and server actions remain the source of truth that reject ineligible rental attempts.

The feature also introduces a return log so admins can document every return event, including condition notes, missing or broken pieces, partial returns, and who processed the return. Product listings and individual product variants can include configurable content sections for details such as warranty, use instructions, size, weight, care notes, or rental process notes. These sections can be free text or bullet lists, and admins can add as many as needed.

## 2) Problem Statement

The current store flow supports selling products and decrementing stock when an order is created. Glitter also needs to support rentable products where:

- Customers can choose to rent instead of buy when a product supports rental.
- Inventory is reserved while products are out on rental, either from shared sale/rental stock or a separate rental-only stock pool.
- Rentals are limited to verified users who are participating in the festival currently in progress.
- Admins can mark rented items as returned and restore stock.
- Every return has an auditable note trail for operational follow-up.
- Product detail sections can vary per product and can include rental-specific process notes where needed.

Without this, admins have to track rentals manually, which makes stock unreliable and makes it easy to lose context about broken or missing rented pieces.

## 3) Goals

- Add a rental purchase mode for eligible products.
- Preserve the existing buy flow for products that are only sold.
- Allow products to support buy only, rent only, or both.
- Allow admins to choose whether a product uses shared sale/rental stock or separate rental stock.
- Restrict rentals to verified, non-blocked users with an accepted reservation in the selected active festival.
- Decrease stock when a rental order is created, using the same stock validation rules as purchases.
- Let admins mark rental quantities as returned, restoring stock only for the returned quantity.
- Create an immutable return log entry for every return action.
- Support configurable product detail sections, including rental-relevant sections visible before checkout and preserved on rental order items.
- Make rental state visible in customer order views and admin order management views.

## 4) Non-Goals

- Subscription rentals or recurring billing.
- Automated late fees, deposits, refunds, or damage charges in the first release.
- Calendar-based availability windows or reservations before payment.
- Barcode/QR-based item-level asset tracking.
- Customer self-service return confirmation.
- Renting products for general use outside the active festival participation context.

## 5) Users & Roles

- Verified active festival participant: can select rent vs buy for eligible products, choose an eligible active festival when needed, review rental-relevant product sections, and place rental orders while they have at least one accepted reservation in the selected active festival.
- Customer / guest customer: can purchase eligible products through the existing sale flow, but cannot rent products.
- Admin / store admin: can configure rental availability, product content sections, review rental orders, mark items as returned, and read return logs.
- System: validates stock, decreases stock on rental checkout, restores stock on returns, and records audit metadata.

## 6) User Stories

### Customer

| ID    | Story                                                                                                                                                                                 | Acceptance Criteria                                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-01 | As a customer, I can see whether a product is available to buy, rent, or both.                                                                                                        | Product cards/details show rental indicators and rental pricing for any rentable product to all viewers; the rental action is enabled only for eligible viewers.                                                                                                         |
| US-02 | As a verified active festival participant, I can choose "Rent" for a rentable product before adding it to my cart.                                                                    | Cart line records the selected mode and keeps rent/buy lines separate.                                                                                                                                                                                                   |
| US-03 | As a customer, I can read product-specific detail sections before checkout.                                                                                                           | Configured sections appear on the product detail page; rental-relevant sections also appear in cart/checkout summary and order confirmation for rental lines.                                                                                                            |
| US-04 | As a verified active festival participant, I can complete checkout with a mix of purchased and rented products.                                                                       | Order creation validates eligibility and stock across all lines and creates order items with their selected mode.                                                                                                                                                        |
| US-05 | As a customer, I can see which items in my order are rented and whether they have been returned.                                                                                      | Order detail labels rental items and shows return status/quantity.                                                                                                                                                                                                       |
| US-06 | As a verified user who can browse the store but is not rental-eligible (e.g. no accepted reservation in an active festival), I can see that a product is rentable but cannot rent it. | Rental indicators/pricing render for ineligible users who can reach the product, but the rental action is disabled and the detail page shows an eligibility notice. Page access stays verified-only, and server actions reject rental attempts from any ineligible user. |

### Admin

| ID    | Story                                                                                      | Acceptance Criteria                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| US-07 | As an admin, I can configure whether a product can be bought, rented, or both.             | Product create/edit supports rental availability without breaking existing products.                                                           |
| US-08 | As an admin, I can choose whether rental stock is shared with sales or tracked separately. | Product create/edit exposes stock mode and rental stock fields when applicable.                                                                |
| US-09 | As an admin, I can add configurable detail sections per product.                           | Product sections are editable in product admin, support free text or bullet lists, and can be shown for all purchases or rental-only contexts. |
| US-10 | As an admin, I can mark a rented order item as returned.                                   | Admin can return all or part of the outstanding rental quantity. Stock increases by the returned quantity in the correct stock pool.           |
| US-11 | As an admin, I can document the condition of returned items.                               | Return action requires or strongly prompts for condition notes and supports optional issue flags.                                              |
| US-12 | As an admin, I can review return history for an order item.                                | Return logs show date, admin, quantity, condition/status, notes, and stock impact.                                                             |
| US-13 | As an admin, I cannot accidentally restore stock twice for the same rented units.          | System tracks returned quantity and blocks returns above the outstanding rented quantity.                                                      |

## 7) Functional Requirements

### 7.1 Product Rental Configuration

Products gain rental configuration fields:

- `isRentable`: boolean; default `false`.
- `isPurchasable`: boolean; default `true` for backwards compatibility.
- `rentalPrice`: numeric/real; required when `isRentable = true`.
- `rentalStockMode`: `shared` or `separate`; default `shared`.
- `rentalStock`: integer; required for rentable products when `rentalStockMode = separate`.
- `rentalTermsRequired`: boolean; optional future-facing flag if the UI needs explicit customer acknowledgement.

Rules:

- At least one of `isPurchasable` or `isRentable` must be true for visible products.
- Product variants inherit the parent product rental eligibility in v1.
- Variant-specific rental price overrides are out of scope for v1.
- Products with variants continue to manage stock at variant level.
- For products with variants and `rentalStockMode = separate`, each variant needs its own `rentalStock`.
- For `rentalStockMode = shared`, purchase and rental stock validation both use the existing product/variant `stock`.
- For `rentalStockMode = separate`, purchases use existing product/variant `stock`; rentals use product/variant `rentalStock`.

### 7.2 Configurable Product Content Sections

Products and product variants can have zero or more configurable content sections. This replaces the idea of a single `rentalInstructions` text field.

Examples:

- Warranty
- Use instructions
- Size
- Weight
- Included pieces
- Care instructions
- Rental process
- Return checklist
- Damage policy

Section fields:

- `productId`: required for every section.
- `productVariantId`: nullable; null means product-level section, non-null means variant-level section.
- `title`: required short heading.
- `format`: `free_text` or `bullet_list`.
- `body`: text content for `free_text` sections.
- `items`: ordered text items for `bullet_list` sections.
- `displayContext`: `all`, `purchase`, or `rental`.
- `isVisible`: boolean; default `true`.
- `sortOrder`: integer for display order.

Rules:

- Admins can add, edit, delete, reorder, hide, and show sections per product.
- Admins can attach a section to the whole product listing or to one specific variant.
- Sections with `displayContext = all` appear on the product detail page for both purchase and rental modes.
- Sections with `displayContext = purchase` appear only when the purchase mode is selected.
- Sections with `displayContext = rental` appear only when the rental mode is selected and should be included in rental cart/checkout/order contexts.
- Product-level sections are shown whenever the product is viewed.
- Variant-level sections are shown only after that variant is selected.
- Product-level and variant-level sections can be shown together; variant-level sections do not automatically replace product-level sections unless a future explicit override mechanism is added.
- Bullet list sections must have at least one non-empty item.
- Free text sections must have non-empty body text.
- Rental order items should snapshot the rental-visible product-level sections and selected variant-level sections shown at checkout, so later product edits do not change the terms/details associated with that rental.

### 7.3 Rental Eligibility

Rental actions require all of the following:

- User is authenticated; guest checkout is not allowed for rental lines.
- User `status` is `verified`.
- User is not `pending`, `rejected`, or `banned`.
- There is at least one active festival. The first implementation should use `festivals.status = active`.
- User has a `participations` row joined to a `stand_reservations` row for the selected active festival.
- The reservation is confirmed for operational purposes: `stand_reservations.status = accepted`. If the implementation also validates stand state, the related `stands.status` should be `confirmed`.

Rules:

- Eligibility must be evaluated when rendering product cards and product detail pages to decide whether the rental action is enabled and whether to show the eligibility notice. Rental indicators and pricing are shown to all viewers regardless of eligibility.
- Eligibility must also be checked on the server when adding a rental to cart and again during checkout.
- UI checks disable the rental action and surface a notice for ineligible users; they do not hide rental information. Server actions remain the source of truth and reject ineligible rental attempts.
- A user who becomes ineligible after adding a rental line cannot checkout until rental lines are removed or eligibility is restored.
- Purchase lines remain available to guests/unverified users according to the existing store rules.
- If the user has accepted reservations in exactly one eligible active festival, the system may auto-select that festival as the rental context.
- If the user has accepted reservations across more than one eligible active festival, the user must choose which festival they are renting for before adding rental lines or before checkout.
- Multiple accepted reservations in the same active festival are one festival participation for rental eligibility. The eligibility response should collapse them into one festival context and may include all underlying stand/reservation details for display and validation.
- The selected rental context must be consistent by festival for all rental lines in the same order in v1. Mixing rental lines for multiple festivals in one checkout is out of scope.
- If the selected festival becomes inactive or the user loses all accepted reservations in that festival before checkout, checkout blocks rental lines until the user chooses a valid rental context or removes rental lines.

### 7.4 Product Discovery & Detail UX

- Page-level access is unchanged: the supplies store that lists rentable products stays restricted to verified users. "All viewers" below means everyone who can already reach the product, not guests/unverified users who are redirected away.
- Product cards show a concise rental indicator whenever `isRentable = true`, for all viewers regardless of rental eligibility.
- Product cards show rental pricing for rentable products to all viewers. The rental quick-action (e.g. `Alquilar`) is enabled only for eligible viewers; for ineligible viewers it is disabled or routes to the detail page where the eligibility notice explains the requirement.
- Product detail pages show a transaction mode control when both buy and rent are available, for all viewers.
- If a product is rent-only, rent is the default (and only) mode for all viewers. Eligible viewers get an active add-to-rental action; ineligible viewers see the rental information plus the eligibility notice and a disabled rental action.
- If a product is buy-only, the UI remains effectively unchanged.
- For ineligible viewers, the product detail page still renders the rental information together with an eligibility notice placed just below the controls. For buy + rent products the side-by-side buy/rent mode cards remain, with the rental card disabled (not selectable) and the purchase flow active. For rent-only products the rental price is shown as a read-only panel. In all cases no actionable rental control is rendered for ineligible viewers.
- If a rent-only product is viewed by an ineligible user, the page shows the regular product information and the rental details with a disabled add-to-rental action; the purchase action remains available only if `isPurchasable = true`.
- Price display must distinguish purchase price from rental price.
- On product cards, when a rentable + purchasable product is fully out of stock, the displayed price is the lowest of the purchase and rental prices (generally the rental price), so the card reflects the cheapest way the product would have been available. This is shown to all viewers.
- Configured product-level content sections are shown on the product detail page according to the selected mode.
- Configured variant-level content sections are shown after the shopper selects the corresponding variant.
- Rental-visible sections are shown near the mode selector or add-to-cart area when rent is selected.

Suggested labels:

- Buy: `Comprar`
- Rent: `Alquilar`
- Rental process/content section example: `Instrucciones de alquiler`
- Rental price: `Precio de alquiler`
- Eligibility notice (ineligible viewers, single generic message): `El alquiler está disponible solo para participantes verificados con una reserva de stand aceptada en un festival activo.`

Eligibility notice rules:

- The product detail page shows a single generic eligibility notice to any viewer who is not eligible to rent. The copy does not branch per reason (guest vs unverified vs no reservation) in v1.
- The notice appears near the rental mode control / disabled rental action so the reason for the disabled state is clear.
- The notice is not shown to eligible viewers and is not required on product cards.

### 7.5 Cart Behavior

Cart items gain a transaction mode:

- `purchase`
- `rental`

Rules:

- Rental lines can only be added by eligible authenticated users.
- The same product/variant can exist twice in the cart if one line is purchase and one line is rental.
- Quantity validation uses the configured stock pool.
- For shared stock products, combined cart quantity for the same product/variant across buy and rent lines must not exceed existing stock.
- For separate stock products, purchase quantity validates against sale stock and rental quantity validates against rental stock independently.
- Rental-visible product-level and selected variant-level content sections are visible for rental lines.
- Cart totals use purchase price for purchase lines and rental price for rental lines.
- Guest/localStorage carts should not accept rental lines. If legacy/local tampering creates one, checkout rejects it.

### 7.6 Checkout & Order Creation

Order items preserve the transaction mode and rental terms at checkout:

- `transaction_type`: `purchase` or `rental`.
- `priceAtPurchase`: stores the charged unit price, using rental price for rental lines.
- `rentalContentSectionsSnapshot`: nullable JSON copied from rental-visible product sections at order creation.
- `rentalStockModeSnapshot`: `shared` or `separate`, copied from product at order creation.
- `rentalFestivalId`: nullable for purchase lines, required for rental lines; copied from the selected rental context.
- `rentalReservationId`: nullable for purchase lines, required for rental lines; copied from the selected rental context.
- `rentalReturnedQuantity`: integer default `0`.
- `rentalStatus`: derived or stored as `not_applicable`, `out`, `partially_returned`, `returned`.

Rules:

- Rental checkout revalidates the user is still eligible and has an accepted reservation in the selected active festival.
- Stock decreases when an order is created for both purchase and rental lines, using sale stock for purchase lines and the configured rental stock pool for rental lines.
- Existing stock restoration for cancelled orders applies to rental lines that have not already been returned.
- If a rental line has partial returns and the order is later cancelled, only the still-outstanding quantity should be restored.
- Payment, voucher, and order status flows remain unchanged unless a future policy requires rental-specific payment handling.

### 7.7 Admin Return Workflow

Admins can return rented units from order management screens.

Return action fields:

- Quantity returned.
- Condition status: `good`, `damaged`, `missing_parts`, `lost`, `other`.
- Stock restored: integer from 0 to `quantityReturned`; admin-controlled per return.
- Notes: text; required when condition is not `good`.
- Optional photo/file attachments are a future enhancement.

Rules:

- Only rental order items can be returned.
- Return quantity must be greater than 0.
- Return quantity cannot exceed `quantity - rentalReturnedQuantity`.
- `stockRestored` defaults to `quantityReturned` when condition is `good`, otherwise `0`; admins may override within the allowed range.
- Stock increases by `stockRestored` (not necessarily by `quantityReturned`) in the same transaction that creates the return log, using the rental stock mode snapshot from the order item.
- `rentalReturnedQuantity` always increases by `quantityReturned`, even when `stockRestored` is `0`, so lost or damaged units can close the rental line without re-entering inventory.
- Return action is idempotency-safe at the business level because outstanding quantity is checked inside the transaction.
- A fully returned item cannot be returned again.

### 7.8 Return Logs

Every return action creates an immutable log entry.

Required log fields:

- `id`
- `orderItemId`
- `orderId`
- `productId`
- `productVariantId`
- `quantityReturned`
- `conditionStatus`
- `notes`
- `stockRestored`
- `stockPool`: `shared` or `rental`
- `processedByUserId`
- `createdAt`

Recommended optional fields:

- `previousReturnedQuantity`
- `newReturnedQuantity`
- `productNameSnapshot`
- `variantLabelSnapshot`
- `customerNameSnapshot`

Rules:

- Logs are append-only.
- Editing/deleting return logs is out of scope for v1.
- If a correction is needed, admins should add a new compensating log through a future inventory adjustment workflow.

### 7.9 Admin Visibility

Admin order lists and order detail pages should expose rental state:

- Badge for rental lines.
- Outstanding return quantity.
- Return status filter: all, out, partially returned, returned.
- Return history on order detail.
- Festival/reservation context for rental lines.
- Low-stock alerts continue to use current stock and do not need rental-specific treatment in v1.

### 7.10 Customer Order Visibility

Customer order pages and emails should show:

- Rental label on rental items.
- Rental-visible product-level and selected variant-level content sections snapshot.
- Return status when returned/partially returned.
- Festival context for the rental when useful.

Customer-facing broken/damaged notes are not required in v1; those are admin-only unless later policy says otherwise.

### 7.11 Current Rentals Tracking

Admins need a reliable way to answer:

- Which products are currently rented?
- How many units are currently out?
- Who rented them?
- Which order, festival, reservation, and stand are they tied to?

Source of truth:

- `order_items` remains the source of truth for active rental quantities.
- `rental_return_logs` remains the source of truth for return history.
- A rental line is currently out when `transaction_type = rental`, the parent order is not cancelled, and `rental_returned_quantity < quantity`.
- Current outstanding quantity is derived as `quantity - rental_returned_quantity`.

Admin "Current Rentals" view:

| Column              | Source                                                                     |
| ------------------- | -------------------------------------------------------------------------- |
| Product             | `order_items.productId -> products.name`                                   |
| Variant             | `order_items.productVariantId` + `productVariantLabel`                     |
| Quantity out        | `order_items.quantity - order_items.rentalReturnedQuantity`                |
| Rented to           | `orders.userId -> users` or guest fields if ever allowed by admin override |
| Order               | `orders.id`                                                                |
| Festival            | `order_items.rentalFestivalId -> festivals`                                |
| Reservation / stand | `order_items.rentalReservationId -> stand_reservations -> stands`          |
| Rented at           | `order_items.createdAt`                                                    |
| Return status       | derived from returned vs ordered quantity                                  |

Product-level summary:

- Total sale stock, when applicable.
- Total rental stock, when `rentalStockMode = separate`.
- Currently rented quantity.
- Available rental quantity.
- Count of open rental order items.

Rules:

- Do not add a separate `active_rentals` table for v1; it would duplicate order-item state and introduce sync risk.
- The dashboard/report should be query-derived from rental order items and return quantities.
- If exact physical unit tracking becomes required, add item-level asset tracking as a future enhancement.

## 8) Data Model Proposal

### 8.1 Enums

```ts
product_transaction_type: "purchase" | "rental";
product_rental_stock_mode: "shared" | "separate";
product_content_section_format: "free_text" | "bullet_list";
product_content_section_display_context: "all" | "purchase" | "rental";
rental_return_condition: "good" |
  "damaged" |
  "missing_parts" |
  "lost" |
  "other";
```

### 8.2 Products

Add columns to `products`:

| Field               | Type                           | Notes                                                                               |
| ------------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| `is_purchasable`    | boolean not null default true  | Backwards compatible with current behavior.                                         |
| `is_rentable`       | boolean not null default false | Enables rental mode.                                                                |
| `rental_price`      | numeric/real nullable          | Required by validation when rentable.                                               |
| `rental_stock_mode` | enum not null default `shared` | `shared` uses existing stock; `separate` uses rental stock.                         |
| `rental_stock`      | integer nullable               | Required when product is rentable, has no variants, and uses separate rental stock. |

### 8.3 Product Content Sections

Create `product_content_sections`:

| Field                | Type                                 | Notes                                                                   |
| -------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| `id`                 | serial PK                            |                                                                         |
| `product_id`         | FK -> `products.id`                  | Cascade delete with product.                                            |
| `product_variant_id` | FK -> `product_variants.id` nullable | Null means product-level section; non-null means variant-level section. |
| `title`              | text not null                        | Section heading, e.g. `Warranty`, `Use instructions`, `Rental process`. |
| `format`             | enum not null                        | `free_text` or `bullet_list`.                                           |
| `body`               | text nullable                        | Required when `format = free_text`.                                     |
| `items`              | jsonb nullable                       | Ordered string array; required when `format = bullet_list`.             |
| `display_context`    | enum not null default `all`          | `all`, `purchase`, or `rental`.                                         |
| `is_visible`         | boolean not null default true        | Allows hiding without deletion.                                         |
| `sort_order`         | integer not null default 0           | Controls display order.                                                 |
| `created_at`         | timestamp not null default now       |                                                                         |
| `updated_at`         | timestamp not null default now       |                                                                         |

Indexes:

- `product_content_sections_product_id_idx`
- `product_content_sections_variant_id_idx`
- `product_content_sections_product_sort_idx` on `(product_id, product_variant_id, sort_order)`
- Optional check: `product_variant_id`, when present, must belong to the same `product_id`.
- Optional check: `free_text` sections require non-empty `body`; `bullet_list` sections require non-empty `items`.

### 8.4 Product Variants

Add column to `product_variants`:

| Field          | Type             | Notes                                                                    |
| -------------- | ---------------- | ------------------------------------------------------------------------ |
| `rental_stock` | integer nullable | Required when parent product is rentable and uses separate rental stock. |

### 8.5 Cart Items

Add column to `cart_items`:

| Field              | Type                             | Notes                             |
| ------------------ | -------------------------------- | --------------------------------- |
| `transaction_type` | enum not null default `purchase` | Included in cart line uniqueness. |

Update uniqueness:

- Base product unique key should include `(cart_id, product_id, transaction_type)` when `product_variant_id IS NULL`.
- Variant unique key should include `(cart_id, product_id, product_variant_id, transaction_type)` when `product_variant_id IS NOT NULL`.

### 8.6 Order Items

Add columns to `order_items`:

| Field                              | Type                                   | Notes                                                                                                               |
| ---------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `transaction_type`                 | enum not null default `purchase`       | Determines purchase vs rental behavior.                                                                             |
| `rental_content_sections_snapshot` | jsonb nullable                         | Ordered snapshot of visible `all` + `rental` product-level and selected variant-level content sections at checkout. |
| `rental_stock_mode_snapshot`       | enum nullable                          | Copied from product at checkout for rental stock restoration.                                                       |
| `rental_festival_id`               | FK -> `festivals.id` nullable          | Required for rental order items.                                                                                    |
| `rental_reservation_id`            | FK -> `stand_reservations.id` nullable | Required for rental order items.                                                                                    |
| `rental_returned_quantity`         | integer not null default 0             | Must stay between 0 and `quantity`.                                                                                 |

Derived status:

- `purchase`: not applicable.
- `rental + returnedQuantity = 0`: out.
- `rental + 0 < returnedQuantity < quantity`: partially returned.
- `rental + returnedQuantity = quantity`: returned.

### 8.7 Rental Return Logs

Create `rental_return_logs`:

| Field                  | Type                                 | Notes                                                           |
| ---------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `id`                   | serial PK                            |                                                                 |
| `order_item_id`        | FK -> `order_items.id`               | Restrict/cascade based on existing order-item deletion policy.  |
| `order_id`             | FK -> `orders.id`                    | Denormalized for easier querying.                               |
| `product_id`           | FK -> `products.id`                  | Snapshot relation.                                              |
| `product_variant_id`   | FK -> `product_variants.id` nullable | Snapshot relation.                                              |
| `quantity_returned`    | integer not null                     | Check `> 0`.                                                    |
| `condition_status`     | enum not null                        |                                                                 |
| `notes`                | text nullable                        | Required in app validation for non-good conditions.             |
| `stock_restored`       | integer not null                     | Usually equals `quantity_returned`; explicit for audit clarity. |
| `stock_pool`           | text/enum not null                   | `shared` or `rental`; copied from the order item snapshot.      |
| `processed_by_user_id` | FK -> `users.id`                     | Admin who processed return.                                     |
| `created_at`           | timestamp not null default now       |                                                                 |

Indexes:

- `rental_return_logs_order_item_id_idx`
- `rental_return_logs_order_id_idx`
- `rental_return_logs_product_id_idx`
- `rental_return_logs_created_at_idx`

## 9) State & Stock Rules

### 9.1 Rental Lifecycle

```text
Product configured as rentable
  -> Eligible verified active participant adds rental line to cart
  -> Checkout creates order item with transaction_type = rental
  -> Sale/shared stock or rental-only stock decreases by quantity
  -> Rental item is "out"
  -> Admin records return
  -> Same stock pool increases by stockRestored (0..quantityReturned)
  -> Item becomes partially_returned or returned
  -> Return log remains available for audit
```

### 9.2 Stock Restoration Rules

| Event                                                              | Stock Impact                                                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Purchase order created                                             | Decrease by quantity.                                                                                             |
| Rental order created with shared stock                             | Decrease existing product/variant `stock` by quantity.                                                            |
| Rental order created with separate stock                           | Decrease product/variant `rentalStock` by quantity.                                                               |
| Purchase order cancelled                                           | Increase by quantity according to existing rules.                                                                 |
| Rental order cancelled before return                               | Increase outstanding quantity in the rental order item's original stock pool.                                     |
| Rental item partially returned                                     | Increase the order item's stock pool by `stockRestored`; increase `rentalReturnedQuantity` by `quantityReturned`. |
| Rental item fully returned                                         | Same as partial return; item becomes fully returned when `rentalReturnedQuantity` reaches `quantity`.             |
| Non-good return (`damaged`, `lost`, etc.) with `stockRestored = 0` | No stock change; return log and `rentalReturnedQuantity` still update.                                            |
| Attempted duplicate return                                         | Blocked; no stock change.                                                                                         |

### 9.3 Concurrency

- Return processing must run inside a database transaction.
- The order item row should be locked or conditionally updated so two admins cannot return the same outstanding quantity concurrently.
- The stock update and return log insert must commit together.

## 10) API / Server Actions

Suggested server actions:

- `updateProductRentalSettings(productId, payload)`
- `upsertProductContentSection(productId, payload)`
- `reorderProductContentSections(productId, orderedSectionIds)`
- `deleteProductContentSection(sectionId)`
- `addToCart(productId, quantity, productVariantId, transactionType)`
- `updateCartItemQuantity(cartItemId, quantity)` with combined stock validation by product/variant across transaction types.
- `getRentalEligibilityForCurrentUser()` returning eligible festival contexts with underlying reservation/stand details.
- `assertRentalEligibility(userId, rentalFestivalId, rentalReservationId)`
- `markRentalOrderItemReturned(orderItemId, payload)`
- `fetchRentalReturnLogs(orderItemId | orderId)`

`assertRentalEligibility` / rental checkout response:

```ts
type RentalEligibilityResult =
  | {
      eligible: true;
      userId: number;
      contexts: Array<{
        festivalId: number;
        festivalName: string;
        festivalStartDate: Date | null;
        reservationId: number; // representative reservation for current DB constraints
        standId: number; // representative stand for current DB constraints
        standLabel: string | null;
        standNumber: number;
        reservationIds: number[];
        stands: Array<{
          reservationId: number;
          standId: number;
          standLabel: string | null;
          standNumber: number;
        }>;
      }>;
    }
  | {
      eligible: false;
      error:
        | "guest_not_allowed"
        | "not_verified"
        | "not_active_participant"
        | "no_active_festival"
        | "invalid_rental_context";
      message: string;
    };
```

`markRentalOrderItemReturned` response:

```ts
type MarkRentalReturnResult =
  | { success: true; returnedQuantity: number; outstandingQuantity: number }
  | {
      success: false;
      error:
        | "not_found"
        | "forbidden"
        | "not_rental"
        | "invalid_quantity"
        | "already_returned"
        | "stock_update_failed";
      message: string;
    };
```

## 11) UX Requirements

- Rental mode selection must be explicit when both modes are available.
- Rental card indicators and rental pricing are rendered for all viewers of a rentable product. The rental CTA/action is enabled only for eligible verified active participants and is disabled for everyone else.
- When more than one active festival is eligible, the user must select the rental festival before adding or checking out rental lines.
- Ineligible users see rental options on product cards and product pages, but the rental action is disabled and the product detail page shows a generic eligibility notice explaining why renting is unavailable.
- If an ineligible user reaches a rental action through a disabled control, stale UI, direct URL, localStorage tampering, or a crafted request, the server must reject it.
- Rental lines must be visually distinguishable from purchase lines in cart, checkout, order details, and admin order views.
- Admin return controls should be disabled or hidden for purchase items and fully returned rental items.
- Return notes should support enough detail for operational follow-up.
- Product content sections should support both multiline free text and ordered bullet lists.
- Product content sections should be reorderable in admin product forms.
- Separate-stock products should expose rental stock in admin inventory views.
- Existing purchase-only products should not visually change except where admin forms expose new optional rental fields.

## 12) Acceptance Criteria

1. Admin can configure a product as buy-only, rent-only, or buy-and-rent.
2. Admin can configure a rentable product to use shared stock or separate rental stock.
3. Verified user with an accepted reservation in an active festival can add a rentable product to cart as a rental line.
4. Guest, pending, rejected, or banned users cannot add rental lines or checkout with rental lines.
5. Verified user without an accepted reservation in an active festival cannot add rental lines or checkout with rental lines.
6. Product cards render rental indicators and rental pricing for all viewers of a rentable product; the rental quick-action is disabled for ineligible users.
7. Product detail pages render rental mode controls and rental information for ineligible users, with the rental CTA disabled and a generic eligibility notice shown.
8. Server actions reject rental lines for ineligible users even if a rental request is crafted manually.
9. Verified user with accepted reservations across multiple active festivals must select which festival the rental is for; multiple reservations in the same active festival are treated as one participation.
10. Rental order items snapshot the selected `rental_festival_id` and `rental_reservation_id`.
11. Customer can add the same product/variant as both purchase and rental lines, and the lines remain separate.
12. Shared-stock products validate combined purchase/rental quantity against existing stock.
13. Separate-stock products validate purchase quantity against sale stock and rental quantity against rental stock.
14. Rental checkout decreases the correct stock pool by rented quantity.
15. Admin can add, edit, reorder, hide, and delete product-level and variant-level content sections.
16. Product content sections support both free text and bullet list formats.
17. Product content sections can be shown for all modes, purchase only, or rental only.
18. Product-level sections show for the whole listing; variant-level sections show only when the matching variant is selected.
19. Order item stores `transaction_type = rental`, rental unit price, rental stock mode snapshot, rental festival plus representative reservation/stand context, and rental-visible product/variant content section snapshot.
20. Admin can return a partial rental quantity; `rentalReturnedQuantity` increases by the returned quantity and stock increases in the correct pool by the admin-specified `stockRestored` (default: returned quantity when condition is `good`, otherwise `0`).
21. Admin can return the remaining rental quantity later and the item becomes fully returned, with the same `stockRestored` rules.
22. Admin cannot return more than the outstanding quantity.
23. Every return creates a return log with admin, quantity, condition, notes, stock pool, stock restored, and timestamp.
24. Return logs remain visible after the item is fully returned.
25. Cancelling an order with rental items restores only outstanding, not already-returned, rental quantity.
26. Admin can view a current rentals report showing product, variant, quantity out, renter, order, festival, reservation/stand, rented-at date, and return status.
27. Product admin/inventory views can show currently rented quantity and available rental quantity.
28. Existing purchase-only checkout behavior continues to work.
29. When a rentable + purchasable product is fully out of stock, its product card displays the lowest of the purchase and rental prices to all viewers.

## 13) Edge Cases

- Product has variants: rental stock and returns apply to the selected variant stock.
- Product uses shared stock: purchases and rentals compete for the same available units.
- Product uses separate stock: purchases cannot consume rental stock and rentals cannot consume sale stock.
- Product rental price changes after checkout: order item keeps the original rental price.
- Product-level or variant-level content sections change after checkout: rental order item keeps the original rental-visible section snapshot.
- Product changes from shared to separate stock after checkout: order item stock mode snapshot determines where returns are restored.
- Guest checkout: rental lines are not allowed; guest purchase lines continue through the existing guest checkout flow.
- User had an accepted reservation when adding to cart but loses it before checkout: checkout blocks rental lines.
- User has multiple active-festival reservations in the same festival: the UI treats them as one festival participation and does not force a stand/reservation choice.
- User has accepted reservations in multiple active festivals: user must choose one rental festival; v1 checkout does not mix festivals in the same order.
- Active festival changes before checkout: checkout revalidates against the selected rental festival and the user's accepted reservations, then blocks stale rental lines if that context is no longer valid.
- Product deleted after order: order item and return logs should preserve enough snapshot data to remain understandable.
- Admin processes two returns at the same time: transaction/conditional update prevents over-return.
- Rental line has condition `lost` or other non-good condition: admin records `quantityReturned` to close the rental line, sets `stockRestored` to `0` by default (may increase up to `quantityReturned` if the unit should re-enter inventory), and provides required notes. A return log is always created; only `stockRestored > 0` increases inventory.

## 14) Open Questions

1. Should rentals require a due date, or is "currently out / returned" enough for v1?
2. Should rental deposits be charged separately from rental price?
3. Should any product content section be able to require explicit customer acknowledgement at checkout?
4. Should rental return notes ever be visible to customers, or remain admin-only?
5. Do rent-only products still use the existing product `price` field for display/admin forms, or should `price` become optional when `isPurchasable = false`?
6. Should v2 allow rental lines for multiple festivals in the same checkout, or keep one rental context per order permanently?
7. Should admins be able to create rental orders manually for eligible participants from the dashboard?

**Resolved (damaged/lost stock restoration):** v1 uses admin-controlled `stockRestored` per return. Defaults: `good` → restore full returned quantity; non-good (including `lost`) → `0`. Admins may override within `0..quantityReturned`. Return logs always record both values; inventory changes only when `stockRestored > 0`.

## 15) Implementation Plan

### Phase 1: Data & Admin Product Setup

- Add rental enums and schema fields, including stock mode, rental stock fields, and product/variant content sections.
- Add product admin fields for rental availability, rental price, rental stock mode, rental stock, and configurable product-level/variant-level content sections.
- Update product definitions, validation, and create/update actions.
- Backfill existing products as `isPurchasable = true`, `isRentable = false`.

### Phase 2: Eligibility & Customer Cart/Checkout

- Add a reusable rental eligibility helper based on verified user status, active festivals, participations, and accepted reservations.
- Add selected rental context state for rental cart/checkout flows.
- Add transaction type to cart lines and uniqueness rules.
- Update add-to-cart, quantity updates, cart provider, guest cart, and stock validation for shared/separate stock.
- Update product cards/details to evaluate eligibility before rendering rental indicators, mode controls, or rental CTAs.
- Update cart and checkout summaries.
- Persist rental-visible product-level and selected variant-level content sections, stock mode, festival, and reservation snapshots on order items.

### Phase 3: Admin Returns

- Add rental return log table and relations.
- Add return server action with transactional stock restoration.
- Add admin return UI on order detail/edit screens.
- Show return history and rental status in admin order views.
- Add current rentals query/report derived from outstanding rental order items.
- Add product-level rental inventory summaries.

### Phase 4: Polish & Notifications

- Add rental labels/statuses to customer order pages and order emails.
- Add admin filters for out/partially returned/returned rentals.
- Add tests for rental stock, partial returns, duplicate-return prevention, and cancellation behavior.

## 16) Testing Requirements

- Unit tests for cart line uniqueness and combined stock validation.
- Unit tests for shared vs separate rental stock validation.
- Unit tests for product content section validation and ordering.
- Unit tests for rental eligibility.
- Render/route tests that rental indicators/pricing render for ineligible users on product cards and product detail pages, with the rental action disabled and the eligibility notice shown on the detail page.
- Render test for the out-of-stock card showing the lowest of purchase/rental price for a rentable + purchasable product.
- Unit tests for rental status derivation.
- Integration/server-action tests for checkout stock decrement on rental lines.
- Integration/server-action tests that reject guest/unverified/non-participant rental attempts.
- Integration/server-action tests for partial and full returns.
- Query tests for current rentals report and product-level rental summaries.
- Regression tests for purchase-only checkout.
- Concurrency-oriented test or transaction-level test for over-return prevention.
- Cancellation tests covering no return, partial return, and full return rental scenarios.

## 17) Risks & Mitigations

| Risk                                                                                 | Impact                                                   | Mitigation                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stock is restored twice for the same rental units.                                   | Inventory becomes inaccurate.                            | Track returned quantity on order item and enforce outstanding quantity inside a transaction.                                                                                                    |
| Return restores to the wrong stock pool after product settings change.               | Sale/rental stock becomes inaccurate.                    | Snapshot rental stock mode on the order item and use that for returns/cancellations.                                                                                                            |
| Rental and purchase cart lines collapse into one line.                               | Wrong pricing and fulfillment mode.                      | Include transaction type in cart uniqueness and line keys.                                                                                                                                      |
| Ineligible users can rent through a disabled control, stale UI, or tampered request. | Rentals happen outside the event participation use case. | Rental information is visible to all, but the action is disabled for ineligible users; eligibility is revalidated in add-to-cart and checkout server actions, which remain the source of truth. |
| Multiple active festivals create ambiguous eligibility.                              | Rentals may attach to the wrong event.                   | Require the user to select an eligible festival and snapshot the festival plus representative reservation on rental order items.                                                                |
| Product content sections change after checkout.                                      | Customer/admin lose the details shown at rental time.    | Snapshot rental-visible content sections on the order item.                                                                                                                                     |
| Damaged/lost returns should not always increase sellable stock.                      | Inventory may overstate usable stock.                    | v1 uses admin-controlled `stockRestored` with non-good defaults to `0`; return logs record both `quantityReturned` and `stockRestored` for audit.                                               |
| Existing checkout regressions.                                                       | Purchase flow breaks.                                    | Defaults keep all existing products purchase-only; add focused regression tests.                                                                                                                |

## 18) Future Enhancements

- Due dates and overdue rental dashboards.
- Deposits, late fees, damage fees, and refund workflows.
- Photo attachments on return logs.
- Item-level asset tracking for serialized rental inventory.
- Customer return appointments or return requests.
- Rental-specific email reminders.
