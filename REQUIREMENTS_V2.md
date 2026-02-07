# Productora Glitter - App Requirements (Authenticated Experience)

Productora Glitter is a Spanish-language festival management platform for art and creative events in Bolivia. It handles the full festival lifecycle: artist registration, stand reservations, payments, on-site activities, voting, a merchandise store, and administrative tools. This document describes every screen and feature available to authenticated users.

**Style direction**: All UI should use shadcn/ui-style components (clean, minimal, consistent design tokens, Radix-based primitives). Support light and dark mode. Mobile-first responsive design.

---

## User Roles

| Role               | Description                                                                     |
| ------------------ | ------------------------------------------------------------------------------- |
| **User**           | Default role. Can browse festivals, buy merchandise, manage their profile.      |
| **Artist**         | Can participate in festivals, reserve stands, submit products, join activities. |
| **Festival Admin** | Can manage specific festivals assigned to them.                                 |
| **Admin**          | Full access to the admin dashboard and all management tools.                    |

### User Statuses

- **Pending**: New account, profile incomplete. Must complete profile or account is auto-deleted after 3 days.
- **Verified**: Full access to all features.
- **Rejected**: Account rejected by admin.
- **Banned**: Account suspended.

### Artist Categories

Artists belong to one category, each with a distinct color identity:

- **Illustration** (purple)
- **Gastronomy** (orange)
- **Entrepreneurship** (pink)

Artists can also have multiple subcategories (specializations) and tags.

The categories colors can change if new colors will improve user experience

---

## Global UI

### Navigation

The Participant Dashboard serves as the home page and central hub, reducing the need for many top-level menu items. Most features are accessible directly from the dashboard.

- **Main menu**: Dashboard (home), Store, Festivals
- **User menu** (avatar dropdown): My Profile, My Orders, Sign Out
- **Admin menu** (visible only to admins): Admin Dashboard with links to Users, Reservations, Payments, Festivals, Orders, Subcategories, Tags, Requests
- **Mobile**: Collapsible sidebar/hamburger menu
- **Breadcrumbs**: Used in nested pages for hierarchical context

Navigation structure can be updated based on user experience analysis

### Notifications

- In-app toast notifications for success, error, and informational feedback
- Email notifications for key events (payment confirmations, reminders, festival announcements, order confirmations)

### Theme

- Light and dark mode toggle
- Brand colors: primary hsl(260, 80, 40), secondary complementary palette
- Category-specific accent colors (purple, orange, pink) -- colors can be changed if needed

---

## User Screens

### Participant Dashboard (Home)

The authenticated home page. This is the central hub users land on after signing in. It consolidates the most important information and actions into a single view so users can quickly see what needs their attention without navigating through multiple pages.

**News Banner**: A prominent banner area at the top of the dashboard where admins can publish announcements, festival news, or promotional messages. Supports rotating or dismissible banners. When no news is available, shows a default welcome or brand message.

**Festival Registration & Status**: The main focal point of the dashboard. Behavior changes based on the user's current state:
- *No active festival*: Shows a message that there are no festivals open for registration at the moment
- *Festival open, not registered*: Shows a call-to-action to sign up for the upcoming festival with key details (name, dates, location)
- *Registered, pending payment*: Shows the reservation status with a prominent alert about missing payment and a direct link to upload their payment voucher
- *Registered, payment submitted*: Shows that payment is under review
- *Fully confirmed*: Shows confirmed status with stand assignment and upcoming dates

**Tasks & Notifications**: An action-item feed driven by admin needs. When admins need participants to do something, tasks appear here. Examples:
- "Submit your product images before [deadline]"
- "Vote for Best Stand is now open"
- "Your profile is missing required information"
- "Payment reminder: your reservation will expire soon"
- "New festival sticker voting is live"
Each task links directly to the relevant page or action.

**Profile Overview**: A compact summary of the user's profile: avatar, display name, category badge, verification status, and profile completion percentage. Links to the full profile editing page.

**Active Festival Activities**: During festival season, shows quick-access cards for any ongoing activities the user can participate in (voting, stamp passport, sticker print). Only visible when a festival is active and has activities available.

**Product Submission Status**: During an active festival where the user is a confirmed participant, shows whether they've submitted their product images, how many they've uploaded, and the submission deadline. Links to the submission page.

**Upcoming Dates**: A countdown or calendar highlight showing the next important date — whether it's a registration deadline, payment deadline, or the festival itself.

**Badges & Achievements**: A showcase of badges the user has earned across festivals. Encourages engagement and festival participation.

**Store Highlights**: A small carousel or grid of featured or recently added merchandise from the Glitter store. Shows a few product cards with images, names, and prices. Links to the full store page.

**Participation History**: A compact list or timeline of past festival participations showing festival name, date, and outcome. Links to a full history view for more details.

**Infractions & Sanctions**: If the user has any active sanctions or past infractions, shows a summary with severity indicators. Hidden entirely if the user has a clean record. Links to the full infractions detail page.

---

### Profile Setup (Onboarding)

When a new user signs in for the first time, they see a multi-step profile completion wizard. The wizard appears as a modal overlay and guides them through:

1. **Category selection**: Pick their artist category
2. **Display name & bio**: Set their public-facing name and biography
3. **Contact information**: Email and phone number
4. **Personal details**: Birthdate, gender, country, state/region
5. **Social media links**: Instagram, Facebook, TikTok, Twitter, YouTube
6. **Profile picture**: Upload an avatar image

The user cannot fully use the platform until their profile is complete and verified by an admin.

### My Profile

A page to view and edit all profile information: avatar, display name, bio, contact details, personal info, social media links, category, and subcategories. Shows current verification status.

### Submit Products

An upload interface where artists submit images of the products they'll showcase at the festival. Shows already-submitted products in a gallery with the option to delete. Displays deadline information.

### Store ("Tiendita Glitter")

A merchandise store accessible only to verified users. Displays product cards with images, name, price, discount (if any), and stock availability. Users can select quantities and place orders. Stock is validated at purchase time to prevent overselling. Product images are shown in a carousel.

### My Orders

A list of all merchandise orders placed by the user. Each order shows a summary with status. Clicking an order shows full detail: items, prices, totals, shipping info, and payment status.

### Festival Reservation

When an artist wants to participate in a festival, they create a reservation:

- Select an available stand (filtered by their category)
- Add collaborators (team members who will work the stand)
- Accept festival terms and conditions
- View an invoice with QR code for payment
- Upload a payment voucher/proof image
- See confirmation once payment is verified

### Festival Activities

During a festival, users can participate in various activities:

- **Stamp Passport**: Visit stands and collect stamps in a digital passport
- **Sticker Print**: Submit a sticker design and participate in printing
- **Best Stand**: Vote for the best-decorated or best-themed stand
- **Festival Sticker**: Vote for favorite festival sticker designs

Each activity has its own detail screen with enrollment, participation tracking, and (where applicable) a voting interface with confirmation. Activities may have participation limits.

### Infractions (Full View)

A detailed page showing the user's complete infraction history. Each infraction shows the type, severity (low/medium/high/critical), and any resulting sanction (warning, temporary ban, reservation delay).

### Participation History (Full View)

A complete list of all past festival participations, showing festival name, dates, participation status, and stand details for each.

---

## Admin Screens

### Dashboard Home

Landing page for administrators with an overview of the platform.

### User Management

A searchable, sortable, paginated table of all users. Admins can filter by status, profile completion, category, and whether to include other admins. Clicking a user opens their detail page where admins can:

- View full profile information
- Edit the user's category and subcategories
- View participation requests associated with the user

### Festival Management

A table listing all festivals with options to create, edit, and delete. Each festival has a status lifecycle: **Draft → Published → Active → Archived**.

Activating a festival sends bulk email notifications to all verified artists in matching categories. Opening registration notifies visitors.

#### Festival Detail (Admin)

Each festival has several management sub-sections:

**Participants**: List of confirmed participants with their stand assignments.

**Allowed Participants**: A whitelist of pre-approved artists who can register for the festival.

**Collaborators**: Team members working at stands. Includes arrival tracking per festival date (log when each collaborator checks in).

**Stands (Map Editor)**: An interactive, zoomable/pannable map where admins can:

- Place and position stands visually
- Configure each stand: pricing, orientation, zone, assigned category
- Generate QR codes per stand
- Color-code stands by category
- See tooltips on hover with stand info
- Import/export map layouts as reusable templates between festivals
- View a legend explaining the color coding

**Activities**: Create and manage festival activities (stamp passport, sticker print, best stand, festival sticker). Configure variants with participation limits. Enable or disable voting. Review participant submissions and proof images.

**Tickets**: View and manage visitor tickets. Includes a check-in/verification interface for event-day use.

**Payments**: A dashboard to review uploaded payment vouchers, approve or reject payments, and track payment status for all reservations.

**Reservations**: View and manage all stand reservations for the festival. Accept or reject reservations (which updates stand status accordingly).

### Global Reservations

A cross-festival view of all reservations. Admins can filter, edit reservations, and manage their associated payments.

### Global Payments

A cross-festival view of all payments with verification workflow.

### Global Orders

A table of all merchandise orders across the platform. Admins can update order status (pending → processing → delivered) and delete orders.

### Requests

A view of all participation requests across the system for review and approval/rejection.

### Badges

Create and manage achievement badges that can be awarded to users.

### Tags

CRUD management for user tags used for categorization and filtering.

### Subcategories

CRUD management for artist subcategories/specializations.

---

## Key User Flows

### New User Onboarding

A new user signs up and lands on the Participant Dashboard. Since their profile is incomplete, the profile completion wizard immediately appears as a modal overlay guiding them through all steps (category, name/bio, contact, personal info, socials, avatar). They have 3 days to complete it — a reminder email is sent after 1 day, and the account is auto-deleted after 3 days if still incomplete. Once complete, an admin reviews and verifies the profile. Only then does the dashboard show full content and the user gets full platform access.

### Artist Festival Participation

An artist sees on their dashboard that a new festival is open for registration. They click to sign up, select a stand that matches their category, optionally add collaborators, and accept the festival terms. Their dashboard now shows the reservation status with a pending payment alert. They upload proof of payment directly from the dashboard link. Once an admin verifies the payment, the dashboard updates to show confirmed status. A task appears reminding them to submit product images before the deadline.

### Festival Day Activities

On the day of the festival, the dashboard's active activities section shows available activities. Participants can join activities like collecting stamps at stands, enrolling in sticker printing, or voting for the best stand and best sticker design. Each activity has enrollment, participation tracking, and proof submission. Voting activities show a gallery of options with a confirmation step.

### Store Purchase

A verified user sees featured merchandise on their dashboard's store highlights section, or navigates to the full store. They select products and quantities and place an order. Stock is checked in real time. After placing the order, both the user and admins receive confirmation emails. An admin processes and fulfills the order.

### Admin Festival Lifecycle

An admin creates a festival with dates, sectors, and type. They configure the stand map using the visual editor, setting up pricing and zones. They publish the festival, then activate it (triggering email blasts to eligible artists). As artists register and pay, the admin verifies payments and accepts reservations. On event day, the admin uses the ticket verification interface for visitor check-in and tracks collaborator arrivals. After the event, the festival is archived.

---

## Style Direction

- **Component style**: shadcn/ui (clean, consistent, accessible, built on Radix primitives)
- **Color system**: Primary brand blue, secondary complementary palette, category accent colors (purple for illustration, orange for gastronomy, pink for entrepreneurship)
- **Typography**: Clean sans-serif body font, distinctive brand font for headings
- **Theme**: Light and dark mode
- **Layout**: Mobile-first responsive design
- **Data tables**: Sortable, filterable, paginated with column visibility toggles
- **Forms**: Inline validation, clear error states, loading indicators on submit
- **Overlays**: Modals for confirmations and quick actions, drawers for detail panels on mobile
- **Feedback**: Toast notifications for actions, skeleton loaders for async content
- **Maps**: Interactive zoomable/pannable canvas for festival stand layouts
- **Language**: All labels, navigation, and content in Spanish
