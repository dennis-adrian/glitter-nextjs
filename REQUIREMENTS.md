# Productora Glitter - Comprehensive App Requirements

## 1. App Overview

**Productora Glitter** is a Spanish-language (Bolivia-focused) festival management platform for art and creative festivals. It manages the full event lifecycle: festival creation, artist registration, stand reservations, payments, festival-day activities, voting, a merchandise store, and visitor ticketing.

**Target users**: Festival organizers (admins), artists/creators (participants), and festival visitors/attendees.

---

## 2. User Roles & Permissions

| Role | Description | Access Level |
|------|-------------|-------------|
| **user** (default) | Regular visitor/attendee | Public pages, store (if verified), own profile, tickets |
| **artist** | Creative participant/vendor | Everything above + festival participation, product submissions, stand reservations |
| **festival_admin** | Festival-level administrator | Festival-specific management tools |
| **admin** | Super administrator | Full admin dashboard, user management, all system settings |

### User Statuses
- **pending**: New user, must complete profile within 3 days or account is auto-deleted
- **verified**: Full platform access
- **rejected**: Account creation rejected by admin
- **banned**: Account suspended, minimal access

### Artist Categories
- Illustration (purple-coded)
- Gastronomy (orange-coded)
- Entrepreneurship (pink-coded)
- New Artist

Each artist can also have subcategories (specializations) and tags.

---

## 3. Public Pages (No Authentication Required)

### 3.1 Landing Page
**Route**: `/`

- Hero banner with festival branding imagery
- Active or upcoming festival information card
- Call-to-action button directing to the next event or registration
- Skeleton loading state while data loads

### 3.2 Festival Detail Page
**Route**: `/festivals/[id]`

- Festival name, description, and key dates
- Three tabbed sections:
  - **General Info**: Overview, description, location, dates
  - **Sectors**: Festival zones/areas with descriptions
  - **Activities**: List of available activities with reservation counts
- Festival status indicator

### 3.3 Festival Categories Browse
**Route**: `/festivals/categories`

- Grid of all festival categories and subcategories
- Each category includes a description and representative imagery
- Glitter mascot illustration
- Educational content about what each category type means

### 3.4 Festicker Festival Landing
**Route**: `/festivals/festicker`

- Dedicated branded landing page for sticker-focused festival type
- Sections:
  - Hero with banner image and title
  - Features list explaining what Festicker offers
  - FAQ accordion (expandable questions and answers)
  - Interactive festival map
  - Registration call-to-action button

### 3.5 Public User Profile
**Route**: `/public_profiles/[id]`

- User avatar image
- Display name
- Bio text
- Category and subcategory badges
- Social media links (Instagram, Facebook, TikTok, Twitter, YouTube)
- Error state if profile doesn't exist

### 3.6 Festival Registration (Visitor)
**Route**: `/festivals/[id]/registration`

3-step registration wizard:
1. **Step 1 - Email**: User enters their email address
2. **Step 2 - Personal Data**: First name, last name, email confirmation
3. **Step 3 - Tickets & Payment**: Select ticket type, complete payment

Query parameters track progress: `email`, `step` (1|2|3), `visitorId`

### 3.7 Event Day Registration
**Route**: `/festivals/[id]/event_day_registration`

- Simplified single-step registration for walk-in attendees on the day of the event
- Quick form for essential information only

### 3.8 Visitor Tickets
**Route**: `/visitors/[id]/tickets`

- List of tickets filtered by active festival
- Each ticket shows: status, date, QR code
- Actions: check-in toggle, resend email confirmation
- Ticket status management

### 3.9 Public Activity Detail
**Route**: `/festivals/[id]/activity/[activityId]`

- Activity description for visitors
- Current reservation/participation count
- Activity content and details

---

## 4. Authentication

- **Provider**: Clerk
- **Methods**: Email/password + social login
- **Localization**: Spanish
- **Sign In Page**: `/sign_in` (Clerk-managed, catch-all route)
- **Sign Up Page**: `/sign_up` (Clerk-managed, catch-all route)
- On first sign-up, a user profile is automatically created with data from Clerk (name, email, image)
- A 3-day deadline is set for profile completion; incomplete profiles are auto-deleted

---

## 5. Authenticated User Pages

### 5.1 Profile Management

#### My Profile
**Route**: `/my_profile`

- View and edit personal profile information
- Profile avatar (uploadable via UploadThing)
- Display name, bio, contact details
- Social media links management
- Error state with support contact if profile not found

#### Profile Creation (Automatic)
**Route**: `/my_profile/creation`

- Triggered on first visit after sign-up
- Auto-populates from Clerk data (first name, last name, email, image)
- Shows success or error status after creation

#### Profile Verification
**Route**: `/my_profile/verification`

- Shows current verification status
- Falls back to profile creation flow if no profile exists

#### Complete Profile Modal (Global Overlay)
Appears on any page when profile is incomplete. Multi-step wizard with 6 steps:

1. **Categories**: Select artist category (illustration, gastronomy, entrepreneurship, new_artist)
2. **Display Name & Bio**: Set public display name and biography text
3. **Contact Info**: Email address, phone number (with international formatting)
4. **Personal Info**: Birthdate, gender, country, state/region
5. **Social Links**: Instagram, Facebook, TikTok, Twitter, YouTube URLs
6. **Profile Picture**: Upload profile image

### 5.2 My Participations
**Route**: `/my_participations`

- Current festival participation status card
- Alert banners for:
  - Product submission deadline reminders
  - "Best Stand" voting notification
  - "Festival Sticker" voting notification
  - Upcoming festival participation info
- Link to product submission page

#### Submit Products
**Route**: `/my_participations/submit_products`

- Image upload interface for festival products
- Gallery of already-submitted products
- Deadline awareness messaging
- Delete product option

### 5.3 Participation History
**Route**: `/my_history`

- Complete historical list of all festival participations
- Participation cards with festival name, date, status

### 5.4 My Orders
**Route**: `/my_orders`

- List of all merchandise orders placed
- Order summary cards with status indicator
- Links to individual order detail pages

### 5.5 Merchandise Store - "Tiendita Glitter"
**Route**: `/store`

- **Access**: Only verified users can browse and purchase
- Product card grid displaying:
  - Product images (carousel)
  - Product name and description
  - Price (with discount display if applicable)
  - Stock availability
- Quantity selection input per product
- "Add to order" / purchase flow
- Stock validation at order creation (atomic, prevents overselling)

### 5.6 Order Detail
**Route**: `/profiles/[profileId]/orders/[orderId]`

- Order items list with individual prices
- Price totals and summary
- Shipping information
- Payment details
- Order status indicator

---

## 6. Festival Participation Flow (Artist/Vendor)

### 6.1 Reservation Creation
**Route**: `/profiles/[profileId]/festivals/[festivalId]/reservations/new`

- Browse available stands (filtered by artist category)
- Stand selection from interactive map or list
- Reservation form
- Collaborator management (add/remove team members)

### 6.2 Reservation Payment
**Route**: `/profiles/[profileId]/festivals/[festivalId]/reservations/[reservationId]/payments`

- Display of pending invoices
- QR code for payment (category-specific QR codes for illustration, gastronomy, entrepreneurship)
- Payment voucher/proof upload with image preview
- Payment summary showing product details, amounts
- Barcode generation for payment tracking

### 6.3 Payment Success
**Route**: `/profiles/[profileId]/invoices/[invoiceId]/success`

- Confirmation message with invoice details
- Success state display

### 6.4 Festival Terms & Conditions
**Route**: `/profiles/[profileId]/festivals/[festivalId]/terms`

- Festival-specific terms and conditions text
- Must be accepted to participate

### 6.5 Product Submission
**Route**: `/my_participations/submit_products`

- Upload product images that will be displayed at the festival
- View gallery of submitted products
- Deadline-aware interface with countdown/alerts
- Delete product functionality

---

## 7. Festival Activities System

### 7.1 Activity Types

| Activity Type | Description | User Action |
|---------------|-------------|-------------|
| **stamp_passport** | Collect stamps by visiting stands | Visit stands, get passport stamped |
| **sticker_print** | Participate in sticker design | Submit design, get stickers printed |
| **best_stand** | Vote for the best stand at the festival | Browse stands, cast vote |
| **festival_sticker** | Vote for/collect festival stickers | Browse stickers, cast vote |

### 7.2 Activity Hub
**Route**: `/profiles/[profileId]/festivals/[festivalId]/activity`

- Grid of available festival activities
- Activity cards showing type, name, icon, description
- Status indicators (open, closed, enrolled)

### 7.3 Activity Detail
**Route**: `/profiles/[profileId]/festivals/[festivalId]/activity/[activityId]`

- Type-specific UI rendering:
  - **stamp_passport**: Passport view with stamp collection progress
  - **festival_sticker**: Sticker gallery with voting
  - **best_stand**: Stand gallery with voting
  - **sticker_print**: Design submission and participation
- Enrollment button
- Participation tracking and status

### 7.4 Activity Enrollment
**Route**: `/profiles/[profileId]/festivals/[festivalId]/activity/enroll`

- Enrollment form for Sticker-Print activity
- Shows dates and conditions
- Design selection interface
- Participation limit checking (max participants)
- Already-enrolled status display

#### Enrollment Success
**Route**: `/profiles/[profileId]/festivals/[festivalId]/activity/enroll/success`

- Success confirmation message
- Auto-redirects to `/my_participations` after 3 seconds
- Manual return link

### 7.5 Activity Voting
**Route**: `/profiles/[profileId]/festivals/[festivalId]/activity/[activityId]/voting`

- Voting interface (differs by activity type):
  - **best_stand**: Browse stands, select favorite, confirm vote
  - **festival_sticker**: Browse sticker designs, select favorite, confirm vote
- Vote confirmation modal
- One vote per user enforcement

---

## 8. User Infractions
**Route**: `/profiles/[profileId]/infractions`

- Personal infraction history list
- Each infraction shows:
  - Type and description
  - Severity level: low, medium, high, critical
  - Date
  - Associated sanction (if any)
- Sanction types: ban, warning, reservation_delay

---

## 9. Admin Dashboard

**Access**: Requires `admin` or `festival_admin` role. Protected via layout-level authentication check.

### 9.1 Dashboard Home
**Route**: `/dashboard`

- Overview landing page for administrators

### 9.2 User Management
**Route**: `/dashboard/users`

- Data table with all registered users
- **Table features**: Searchable, sortable columns, pagination, column visibility toggle
- **Filter options**:
  - User status (verified, pending, rejected, banned)
  - Profile completion level
  - Artist category
  - Include/exclude admins
  - Free text search query
  - Sort direction
- Skeleton loading states for filters and table

#### User Detail
**Route**: `/dashboard/users/[profileId]`

- Full user profile information display
- Quick info overview

#### Edit User Categories
**Route**: `/dashboard/users/[profileId]/edit-categories`

- Change user's artist category
- Manage subcategories/specializations
- Triggers notification email on change

#### User Requests
**Route**: `/dashboard/users/[profileId]/requests`

- View participation requests from/to user

### 9.3 Festival Management
**Route**: `/dashboard/festivals`

- Table of all festivals with action menus
- "Add Festival" button

#### Create Festival
**Route**: `/dashboard/festivals/add`

- Form: festival name, description, type (glitter, twinkler, festicker), dates, sectors
- Breadcrumb navigation

#### Edit Festival
**Route**: `/dashboard/festivals/[id]/edit`

- Edit all festival details
- Update dates, description, configuration

#### Festival Status Management
Festival lifecycle: **draft** → **published** → **active** → **archived**
- Activating a festival triggers bulk email notifications to all verified artists in matching categories
- Opening registration sends emails to visitors

#### Per-Festival Management Sub-Pages

**Participants** (`/dashboard/festivals/[id]/participants`):
- List of confirmed festival participants
- Participant cards/table

**Allowed Participants** (`/dashboard/festivals/[id]/allowed_participants`):
- Whitelist management for approved participants
- Add/remove from approved list

**Collaborators** (`/dashboard/festivals/[id]/collaborators`):
- Team member management per stand
- Arrival tracking per festival date (log arrival time)
- Remove arrival log option

**Stands** (`/dashboard/festivals/[id]/stands`):
- Interactive map editor
- Stand placement with drag-and-drop positioning
- Stand configuration: pricing, orientation, zone, category
- QR code generation per stand
- Map toolbar with editing controls
- Category-color-coded stand markers
- Stand tooltips on hover
- Map legend
- Map template import/export between festivals

**Festival Activities** (`/dashboard/festivals/[id]/festival_activities`):
- Create and manage activities (stamp_passport, sticker_print, best_stand, festival_sticker)
- Configure activity variants with participation limits
- Enable/disable voting

**Activity Review** (`/dashboard/festivals/[id]/festival_activities/[activityId]/review`):
- Review participant submissions and proofs
- Approve/reject activity completions

**Tickets** (`/dashboard/festivals/[id]/tickets`):
- View all visitor tickets
- Ticket status management

**Ticket Verification** (`/dashboard/festivals/[id]/tickets/verification`):
- Check-in interface for event day
- QR code scanning/verification
- Mark tickets as checked-in

**Payments** (`/dashboard/festivals/[id]/payments`):
- Payment verification dashboard
- View uploaded vouchers/proofs
- Approve/reject payments
- Payment status tracking

**Reservations** (`/dashboard/festivals/[id]/reservations`):
- All reservations for the festival
- Reservation status management (pending → accepted/rejected)

### 9.4 Global Management Pages

#### Reservations
**Route**: `/dashboard/reservations`

- All reservations across all festivals
- Filterable table
- Edit reservation (`/dashboard/reservations/[id]/edit`)
- View reservation payments (`/dashboard/reservations/[id]/payments`)

#### Payments
**Route**: `/dashboard/payments`

- All payments across all festivals
- Payment verification workflow

#### Orders
**Route**: `/dashboard/orders`

- All merchandise orders
- Order status management (pending → processing → delivered)
- Delete order capability

#### Requests
**Route**: `/dashboard/requests`

- All participation requests across the system
- Approve/reject requests

#### Badges
**Route**: `/dashboard/badges`

- Create and manage achievement badges
- Badge creation form (`/dashboard/badges/add`)
- Assign badges to users

#### Tags
**Route**: `/dashboard/tags`

- CRUD management for user tags
- Tags used for categorization and filtering

#### Subcategories
**Route**: `/dashboard/subcategories`

- CRUD management for artist subcategories/specializations

---

## 10. Interactive Map System

- Zoomable and pannable festival map (pinch-to-zoom on mobile)
- Two views:
  - **Public view**: Browse stands, see artist names, category colors
  - **Admin editor**: Place, move, resize, and configure stands
- Stand features:
  - Category-color-coded markers (purple, orange, pink)
  - Hover tooltips showing stand info
  - Click to view stand details and assigned artists
- Map legend explaining color codes
- Admin toolbar with editing tools
- Template system: export map layout as reusable template, import template to new festival

---

## 11. Notification System

### In-App Notifications
- Toast notifications via Sonner library
- Types: success, error, info, warning
- Auto-dismiss with configurable duration
- Action buttons within toasts

### Email Notifications (via Resend)

| Trigger | Recipients | Content |
|---------|-----------|---------|
| Profile creation | New user | Welcome, complete your profile |
| Profile completion reminder | User (1 day after signup) | Reminder to complete profile |
| Profile deletion warning | User (3 days if incomplete) | Account will be deleted |
| Profile verified | User | Congratulations, you're verified |
| Category changed | User | Your category has been updated |
| Festival activated | All verified artists in matching categories | New festival announcement |
| Registration opened | Visitors | Festival registration is now open |
| Reservation created | User + admins | Reservation confirmation |
| Payment received | User + admins | Payment confirmation |
| Payment reminder | User with pending reservation | Reminder to complete payment |
| Order confirmation | User + admins | Order placed successfully |
| Activity enrollment | User | Enrollment confirmation |

---

## 12. Background Processes (Automated Cron Jobs)

| Job | Schedule | Action |
|-----|----------|--------|
| Profile reminders | Morning | Send completion reminder 1 day after signup |
| Profile deletion | Morning | Delete incomplete profiles after 3 days + delete Clerk user |
| Reservation reminders | Morning | Email users with pending reservation payments |

---

## 13. File Upload System

| Upload Type | Provider | Context |
|-------------|----------|---------|
| Profile pictures | UploadThing | Profile management |
| Payment vouchers | UploadThing | Reservation payment proof |
| Activity proofs | UploadThing | Activity participation evidence |
| Product images | UploadThing | Festival product submissions |

- Automatic cleanup: old files are deleted when replaced
- Authentication required for all uploads
- Image preview before submission

---

## 14. Navigation Structure

### Desktop Main Navigation
- **Home** (`/`)
- **Proximo Evento** (`/next_event`) - Next/active festival
- **Tiendita** (`/store`) - Merchandise store (verified users only)
- **Festivales** (dropdown):
  - Festicker (`/festivals/festicker`)
  - Categorias (`/festivals/categories`)

### Admin Navigation (admin role only)
- **Dashboard** (dropdown):
  - Usuarios (`/dashboard/users`)
  - Reservas (`/dashboard/reservations`)
  - Pagos (`/dashboard/payments`)
  - Festivales (`/dashboard/festivals`)
  - Pedidos (`/dashboard/orders`)
  - Subcategorias (`/dashboard/subcategories`)
  - Tags (`/dashboard/tags`)
  - Solicitudes (`/dashboard/requests`)

### User Menu (Authenticated, dropdown)
- Mi perfil (`/my_profile`)
- Mi historial (`/my_history`)
- Mis pedidos (`/my_orders`)
- Cerrar sesion (Sign out)

### Session Buttons (Unauthenticated)
- Iniciar sesion (Sign in)
- Crear cuenta (Sign up)

### Mobile Navigation
- Hamburger menu icon
- Sidebar drawer with all navigation items
- Same structure as desktop, adapted for touch

### Breadcrumb Navigation
- Used throughout dashboard and nested pages
- Shows hierarchical path for deep navigation

---

## 15. Design System & Visual Identity

### Brand Colors
- **Primary**: Custom blue spectrum (11 shades, 50-950)
- **Secondary**: Complementary spectrum (11 shades)
- **Glitter Blue**: Brand-specific blue
- **Festicker Pink**: #FB0A76

### Category Colors
| Category | Background | Border | Text |
|----------|-----------|--------|------|
| Illustration | Purple-100 | Purple-300 | Purple-900 |
| Gastronomy | Orange-100 | Orange-300 | Orange-900 |
| Entrepreneurship | Pink-100 | Pink-300 | Pink-900 |

### Typography
- **Body font**: Inter (sans-serif)
- **Brand/headline font**: Isidora (custom)

### Icons
- Primary: Lucide React icon set
- Secondary: FontAwesome 6.5

### Theme
- Light and dark mode support (via next-themes)
- CSS custom properties for theme switching

### Responsive Breakpoints
| Name | Width |
|------|-------|
| xxs | 320px |
| xs | 375px |
| sm | 640px |
| md | 768px |
| lg | 1024px |
| xl | 1280px |
| 2xl | 1536px |

### Component Library
- Base: 45+ shadcn/ui components built on Radix UI primitives
- Custom: 380+ total application components
- Component categories:
  - **Form controls**: Input, textarea, select, combobox, multiselect, checkbox, radio, switch, slider, date picker, phone input, file dropzone
  - **Layout**: Card, accordion, tabs, separator, scroll area
  - **Navigation**: Navigation menu, breadcrumb, dropdown menu
  - **Overlays**: Dialog, alert dialog, drawer, popover, hover card, sheet
  - **Data display**: Table (with TanStack React Table), badge, avatar, avatar group, progress, skeleton
  - **Search**: Search input with debouncing, command palette (combobox)
  - **Feedback**: Toast (Sonner), loading spinner, skeleton loaders

---

## 16. Key User Flows

### Flow 1: New User Onboarding
```
Sign Up (Clerk) → Auto Profile Creation → Complete Profile Modal (6 steps) → Admin Review → Verified Status → Full Platform Access
```
- If profile not completed within 3 days: reminder at day 1, auto-deletion at day 3

### Flow 2: Festival Participation (Artist)
```
Browse Festivals → View Festival Detail → Create Reservation → Select Stand → Add Collaborators → Accept Terms → Upload Payment Voucher → Admin Verifies Payment → Reservation Confirmed → Submit Product Images → Attend Festival
```

### Flow 3: Festival Day Activities
```
Visit Activity Hub → Browse Activities → Enroll in Activity → Participate (stamp passport / vote / design stickers) → Upload Proof Images → View Results
```

### Flow 4: Visitor Registration & Attendance
```
Visit Festival Page → Start Registration → Enter Email → Provide Personal Data → Receive Tickets via Email → Show Ticket QR at Event → Check-in
```

### Flow 5: Store Purchase
```
Browse Store → Select Products → Set Quantities → Create Order (stock validated) → Receive Confirmation Email → Admin Processes Order → Delivery
```

### Flow 6: Admin Festival Setup
```
Create Festival (name, dates, type, sectors) → Configure Stands on Map → Set Pricing → Publish Festival → Activate (triggers artist emails) → Open Registration (triggers visitor emails) → Manage Participants → Verify Payments → Accept Reservations → Event Day: Ticket Check-in + Collaborator Arrival Tracking → Archive Festival
```

---

## 17. Data Entities Summary

| Entity | Description |
|--------|-------------|
| Users | Profiles with roles, categories, status, social links |
| Festivals | Events with types, dates, sectors, status lifecycle |
| Festival Dates | Multiple date ranges per festival |
| Festival Sectors | Zones/areas within a festival |
| Stands | Vendor/artist booths with pricing, position, QR codes |
| Stand Reservations | Booking a stand (status: pending → accepted/rejected) |
| Reservation Participants | Multiple users per reservation |
| Collaborators | Team members working at stands |
| Collaborator Attendance | Arrival tracking per festival date |
| Invoices | Payment invoices linked to reservations |
| Payments | Payment records with voucher uploads |
| QR Codes | Generated codes for payments and stands |
| Festival Activities | Events within festivals (voting, stamping, etc.) |
| Activity Details | Variants with participation limits |
| Activity Participants | Users enrolled in activities |
| Activity Proofs | Image evidence of participation |
| Activity Votes | Votes cast for participants or stands |
| Visitors | Festival attendees (non-artist) |
| Tickets | Visitor entry tickets with check-in status |
| Products | Merchandise items with pricing and stock |
| Product Images | Gallery images for products |
| Orders | Merchandise purchases |
| Order Items | Individual items within orders |
| Infractions | User violations with severity levels |
| Infraction Types | Defined violation categories |
| Sanctions | Consequences (ban, warning, reservation delay) |
| Badges | Achievement/recognition awards |
| Tags | User categorization labels |
| Subcategories | Artist specialization labels |
| Scheduled Tasks | Background job tracking (reminders, deletions) |
| Map Templates | Reusable festival map layouts |

---

## 18. External Integrations

| Service | Purpose |
|---------|---------|
| **Clerk** | Authentication (email/password + social login), user management |
| **Resend** | Transactional email delivery with React email templates |
| **UploadThing** | File/image upload and hosting |
| **EdgeStore** | Secondary file storage |
| **PostgreSQL** | Primary database (via Drizzle ORM) |
| **Vercel Analytics** | Usage analytics and performance monitoring |

---

## 19. Localization

- **Primary language**: Spanish
- **Region**: Bolivia
- **Localized elements**:
  - All UI labels and navigation
  - Clerk authentication pages
  - Email notification templates
  - Error messages and status labels
  - Date and phone number formatting (international)
