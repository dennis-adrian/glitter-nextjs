<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Glitter Next.js app. The integration uses the `instrumentation-client.ts` approach (appropriate for Next.js 15.3+), with a `/ingest` reverse proxy to avoid ad-blocker interference. Client-side events are captured via `posthog-js` imported directly in `"use client"` components. Server-side events use a `getPostHogClient()` helper from `posthog-node` with `flushAt: 1` to ensure immediate delivery. Users are identified on festival enrollment via `posthog.identify()`, correlating their profile ID with email and category.

| Event | Description | File |
|---|---|---|
| `festival_terms_accepted` | Fired when a vendor/gastronomy profile accepts festival terms and successfully enrolls. Includes `identify()` call. | `app/components/festivals/terms-form.tsx` |
| `reservation_confirmed` | Fired when a vendor confirms a stand hold and a reservation is successfully created. | `app/components/festivals/reservations/hold-confirmation-client.tsx` |
| `reservation_cancelled` | Fired when a vendor manually cancels their temporary stand hold. | `app/components/festivals/reservations/hold-confirmation-client.tsx` |
| `payment_uploaded` | Server-side event fired when a payment voucher is successfully uploaded via the API. | `app/api/payments/route.ts` |
| `free_reservation_confirmed` | Fired when a user confirms a free (zero-cost) reservation. | `app/components/payments/confirm-free-reservation-button.tsx` |
| `discount_code_applied` | Fired when a discount code is successfully validated and applied to an invoice. | `app/components/payments/discount-code-input.tsx` |
| `visitor_registration_completed` | Fired when an event-day visitor completes their registration form. | `app/components/events/registration/visitor-registration-form.tsx` |
| `visitor_email_submitted` | Fired when a visitor submits their email (top of registration funnel). | `app/components/events/registration/email-submission-form.tsx` |
| `festival_created` | Fired when an admin successfully creates a new festival. | `app/components/festivals/forms/new-festival.tsx` |
| `user_profile_created` | Server-side event fired when a new user profile is inserted into the database. | `app/lib/users/actions.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/59584/dashboard/1391607
- **Vendor enrollment funnel** (terms accepted → reservation confirmed → payment uploaded): https://us.posthog.com/project/59584/insights/HThJWIZ1
- **Visitor registration funnel** (email submitted → registration completed): https://us.posthog.com/project/59584/insights/buRVPVtW
- **Reservations: confirmed vs cancelled** (daily trend): https://us.posthog.com/project/59584/insights/cm0IeLJl
- **New profiles, enrollments & payments over time**: https://us.posthog.com/project/59584/insights/t40rgTDc
- **Discount codes & free reservation confirmations**: https://us.posthog.com/project/59584/insights/0Blednjp

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
