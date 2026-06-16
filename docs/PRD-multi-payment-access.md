# PRD: Múltiples Reservas y Acceso a Pagos por Festival

**Producto:** Glitter
**Fecha:** 2026-05-05
**Estado:** Implementado
**Rama de referencia:** `support-for-multiple-payment-access`

---

## 1. Resumen

Hasta ahora la UI asumía que un participante tendría una única reserva (y, por lo tanto, una única factura) por festival. En la práctica esto no es cierto: aunque un participante no puede crear más de una reserva propia por festival, los administradores pueden crear reservas adicionales en su nombre, y un participante puede compartir una reserva con un compañero (partner) que se suma como segundo participante. El esquema ya soportaba estos casos (no hay constraint único en `(user_id, festival_id)` para reservas, e `invoices.userId` apunta a un único titular), pero las pantallas usaban `.find()` y selectores singulares que ocultaban reservas adicionales y dirigían a flujos de pago incompatibles con múltiples facturas.

Esta entrega introduce una página central de facturas por festival, agrega copys de agregación en el portal del participante, y formaliza el modelo de acceso a facturas como **"el titular paga, el partner ve"**: cualquier participante de una reserva puede ver la factura, pero solo el titular (`invoices.userId`) puede ejecutar el flujo de pago.

---

## 2. Historias de Usuario

### Participante titular (creador)

| ID    | Historia                                                                                                               | Criterio de aceptación                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-01 | Como titular con varias reservas en un festival, quiero ver todas mis facturas en un mismo lugar                       | La página `/profiles/[id]/festivals/[id]/invoices` lista cada factura con monto, estado, fecha de creación, fecha de vencimiento, espacio y sector |
| US-02 | Como titular con un pago pendiente, quiero llegar a esa página desde el portal                                         | El card "Mi participación" del portal muestra "Completar pago" y enlaza a `/invoices` (no al pago directo de una sola reserva)                     |
| US-03 | Como titular con varias reservas/facturas, quiero un copy que refleje correctamente cuántas tengo y cuántos pagos debo | El banner del card muestra "Tenés N reservas y M pagos pendientes" cuando `reservationCount > 1`, "Tenés M pagos pendientes" en caso contrario     |
| US-04 | Como titular, quiero seguir pagando una factura específica desde el flujo existente                                    | Cada factura pendiente en `/invoices` tiene un botón "Completar pago" / "Confirmar reserva" que abre `/reservations/[id]/payments`                 |
| US-05 | Como titular de una factura vencida, quiero que la UI lo señale visualmente                                            | Si `now > invoice.createdAt + 5 días`, la línea "Vencida el …" aparece en rojo en lugar de "Vence el …"                                            |

### Participante partner (no titular)

| ID    | Historia                                                                                        | Criterio de aceptación                                                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-06 | Como partner, quiero saber que mi reserva tiene un pago pendiente                               | El card del portal sigue mostrando "Pago pendiente" con CTA a `/invoices` (mismo comportamiento que para el titular)                                                   |
| US-07 | Como partner, quiero ver el detalle de la factura para entender qué falta y a quién contactar   | En `/invoices` cada factura pendiente que no me pertenece muestra un mensaje informativo: "Contactá al titular de la reserva, **{nombre}**, para completar este pago." |
| US-08 | Como partner, no debería poder acceder al flujo de pago de una reserva en la que no soy titular | Navegar a `/reservations/[id]/payments` redirecciona a `/invoices` cuando el usuario actual no aparece en `invoices.userId` de ninguna factura de esa reserva          |

### Administrador

| ID    | Historia                                                                              | Criterio de aceptación                                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-09 | Como admin, quiero crear reservas adicionales para un participante existente          | El flujo `/dashboard/festivals/[id]/reservations/new` sigue permitiendo crear múltiples reservas para el mismo `userId`; la UI del participante refleja todas |
| US-10 | Como admin, quiero que el email de extensión de plazo siga funcionando para titulares | El link del email apunta a `/reservations/[id]/payments`. Si lo abre el titular, accede al pago. Si lo abre el partner, redirecciona a `/invoices`            |

---

## 3. Flujo de Usuario

```
            /portal                       /profiles/[id]/festivals/[id]/invoices
        Card "Mi participación"  ───>     Lista de facturas (titular y partner)
        "Completar pago"                          │
                                                  │ (solo titular)
                                                  v
                                  /reservations/[id]/payments
                                  Subir comprobante de pago
```

### Reglas clave del flujo

- El portal **no** distingue titular vs. partner: ambos ven la misma señal "Pago pendiente" y son redirigidos a `/invoices` para tomar acción.
- En `/invoices` la UX se diferencia **por factura**: el botón "Completar pago" aparece solo si `invoice.userId === currentUser.id`. En caso contrario, en su lugar se muestra un banner informativo que nombra al titular.
- El acceso directo a `/reservations/[id]/payments` es **solo del titular**. Si un partner u otro usuario llega ahí (vía URL pegada, link de email, etc.), se redirecciona a `/invoices`.

---

## 4. Requisitos Funcionales

### 4.1 Modelo de acceso a facturas

| Concepto       | Alcance                                                          | Mecanismo                                                                                                                  |
| -------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Visibilidad    | Cualquier participante (`reservationParticipants`) ve la factura | Query `fetchReservationsWithInvoicesByProfileAndFestival` filtra reservas vía join con `reservationParticipants`           |
| Acción de pago | Solo el titular (`invoices.userId === currentUser.id`)           | Filtro `ownerInvoices = invoices.filter(i => i.userId === profile.id)` en el route de pagos + condicional en `InvoiceCard` |

### 4.2 Página de facturas (`/profiles/[id]/festivals/[id]/invoices`)

- Header con nombre del festival y subtítulo "Tus pagos para este festival".
- Lista plana de facturas (no agrupadas por reserva). Cada `InvoiceCard` muestra:
  - Monto (o "Reserva sin costo" cuando `amount === 0`).
  - Sector + espacio (label + número).
  - Fecha de creación (`invoice.createdAt`).
  - Fecha de vencimiento (`createdAt + 5 días`) — solo si la factura está pendiente; pintada en rojo si ya venció.
  - Badge de estado (Pendiente / Pagada / Cancelada).
  - CTA o banner según titularidad.
- Las facturas se ordenan por prioridad de estado (`pending → paid → cancelled`) y por fecha descendente dentro de cada grupo.
- Reservas con `status === "rejected"` se excluyen.
- Estado vacío: "No tienes facturas en este festival." dentro de un `Card`.
- La carga de la lista se realiza en un `<Suspense>` con `FestivalInvoicesListSkeleton` para que el header se renderice de inmediato.

### 4.3 Card del portal (`ReservationCard`)

- Recibe `activeParticipations: Participation[]` (todas las participaciones del usuario en el festival activo, no rechazadas), `outstandingInvoiceCount: number` y `reservationCount: number`.
- Cálculo de `cardStatus` basado en agregados:
  1. `outstandingInvoiceCount > 0` → `pending_payment`.
  2. Si alguna reserva está en `verification_payment` → `pending_payment_approval`.
  3. Si alguna reserva está en `accepted` → `confirmed_reservation`.
- Copy del banner cuando `cardStatus === "pending_payment"`:
  - `outstandingInvoiceCount === 1`: "Hacé tu pago para confirmar tu reserva" / "tus reservas".
  - `outstandingInvoiceCount > 1`: "Completá tus pagos para confirmar tu reserva" / "tus reservas".
  - Descripción: `Tenés ${reservationCount} reservas y ${invoiceLabel}.` cuando hay varias reservas, o `Tenés ${invoiceLabel}.` para una sola.
  - Fallback (anomalía con `outstandingInvoiceCount === 0` pero alguna reserva pendiente): copy con fecha límite calculada desde `reservation.createdAt + 5 días`.
- CTA `actionHref` para `pending_payment` siempre apunta a `/profiles/${profile.id}/festivals/${activeFestival.id}/invoices`.

### 4.4 Card de anuncios (`announcements_cards/card.tsx`)

- Reemplaza `.find()` por `.filter()` sobre las participaciones del festival.
- Cuando hay varias participaciones no rechazadas, usa la más reciente (mayor `createdAt`) como representativa para el `ReservedStandCard`.

### 4.5 Mensaje al partner en `InvoiceCard`

- Cuando `invoice.status === "pending"` y `invoice.userId !== profileId`:
  - Se reemplaza el `Button` por un `Banner` con `variant="info"`.
  - Texto: "Contactá al titular de la reserva, **{nombre}**, para completar este pago."
  - Resolución del nombre del titular: `displayName` → `firstName + lastName` → `"el titular"` (fallback genérico).

### 4.6 Gate de seguridad en el flujo de pago

- En `app/(routes)/profiles/[profileId]/festivals/[festivalId]/reservations/[reservationId]/payments/page.tsx`:
  - Se obtiene `ownerInvoices = invoices.filter(i => i.userId === profile.id)`.
  - Si `ownerInvoices.length === 0` → `redirect("/profiles/${profileId}/festivals/${festivalId}/invoices")`.
  - El render itera sobre `ownerInvoices` (no `invoices`), garantizando que solo se muestran facturas del usuario actual incluso si en el futuro existieran facturas de distintos titulares en una misma reserva.
- Esto cubre dos casos en una sola validación:
  1. Partner intentando pagar (redirige a `/invoices` donde verá el mensaje del titular).
  2. URL-guessing por terceros (un usuario que no participa en la reserva tampoco será titular de ninguna factura).

---

## 5. Requisitos Técnicos

### 5.1 Stack

Mismo stack del resto del proyecto: Next.js (App Router), PostgreSQL, Drizzle ORM, Clerk, Resend, Zod, Tailwind, Lucide. Sin dependencias nuevas.

### 5.2 Convenciones aplicadas

- **Una sola componente por archivo** bajo `app/components/<feature>/<component-name>.tsx`. Las route files (`page.tsx`) sólo contienen el componente de ruta, su validación de params y helpers no-componentes.
- **`invoice.createdAt` como fuente canónica** del timestamp de creación para el cálculo de `dueDate`. Convive con `invoice.date` (que actualmente se setea al mismo valor) pero ambos consumidores nuevos usan `createdAt`, alineados con `lib/payments/helpers.ts:53` y `maps/admin/admin-overview-map.tsx:136,157`.
- **Streaming con Suspense** para queries pesadas. La página `/invoices` aplica `<Suspense fallback={<FestivalInvoicesListSkeleton />}>` sobre `<FestivalInvoicesList />` para que el header pinte sin esperar la consulta.

### 5.3 Caching

- `getCurrentUserProfile()` y `protectRoute()` siguen usando el caching ya existente (`react.cache` en `cachedFetchUserProfileByClerkId`). No se introduce caching adicional en las nuevas queries.

---

## 6. Modelo de Datos

No hay cambios de esquema. Las siguientes columnas y relaciones existentes son las relevantes:

### 6.1 Tabla `stand_reservations`

- Sin constraint único en `(userId, festivalId)`: schema permite múltiples reservas por usuario por festival.
- Estados: `pending` · `verification_payment` · `accepted` · `rejected`.

### 6.2 Tabla `participations` (alias schema: `reservationParticipants`)

- Join `users ↔ stand_reservations`. Permite que múltiples usuarios compartan una reserva (creador + partner).

### 6.3 Tabla `invoices`

| Campo         | Tipo       | Descripción                                                     |
| ------------- | ---------- | --------------------------------------------------------------- |
| id            | serial PK  |                                                                 |
| userId        | integer FK | **Titular** — único usuario con autoridad de pago en la factura |
| reservationId | integer FK | Reserva asociada                                                |
| amount        | real       | Monto en BOB                                                    |
| status        | enum       | `pending` · `paid` · `cancelled`                                |
| date          | timestamp  | Fecha de la factura (hoy se setea = `createdAt`)                |
| createdAt     | timestamp  | Fuente canónica para calcular `dueDate = createdAt + 5 días`    |

### 6.4 Tipos derivados (TypeScript)

Definidos en `app/data/invoices/definitions.ts`:

```typescript
type InvoiceWithPayments = InvoiceBase & { payments: PaymentBase[] };
type InvoiceWithPaymentsAndOwner = InvoiceWithPayments & { user: User };
type ReservationWithStandAndInvoicesAndFestival = StandReservation & {
  stand: StandBase & { festivalSector: FestivalSector | null };
  invoices: InvoiceWithPaymentsAndOwner[];
  festival: FestivalWithDates;
};
```

---

## 7. Server Actions y Queries

Definidas en `app/data/invoices/actions.ts`. Todas son `"use server"`.

#### `fetchReservationsWithInvoicesByProfileAndFestival(profileId, festivalId)`

Devuelve todas las reservas del usuario en el festival (joined vía `reservationParticipants`) con sus invoices anidadas (incluyendo el `user` titular y los `payments`). Excluye reservas sin coincidencia de participante; **no** filtra por `invoices.userId` (intencional — el partner debe ver las facturas para mostrar el mensaje al titular).

```typescript
fetchReservationsWithInvoicesByProfileAndFestival(
  profileId: number,
  festivalId: number,
): Promise<ReservationWithStandAndInvoicesAndFestival[]>
```

#### `fetchOutstandingInvoiceCountByProfileAndFestival(profileId, festivalId)`

Conteo agregado para el card del portal.

```typescript
fetchOutstandingInvoiceCountByProfileAndFestival(
  profileId: number,
  festivalId: number,
): Promise<{ reservationCount: number; outstandingInvoiceCount: number }>
```

`reservationCount` = reservas no rechazadas en las que el usuario participa.
`outstandingInvoiceCount` = facturas con `status === "pending"` en esas reservas (sin distinción de titularidad — el portal informa a partners también).

#### `fetchPendingInvoicesByProfile(profileId)`

Devuelve facturas `pending` donde `invoices.userId === profileId` (alcance estrictamente del titular). Disponible para futuros consumidores; no usado actualmente en producción tras la eliminación del banner sticky en otra rama.

---

## 8. Componentes Clave

| Archivo                                                                                                   | Tipo           | Responsabilidad                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/(routes)/profiles/[profileId]/festivals/[festivalId]/invoices/page.tsx`                              | Server (route) | Auth, validación de params, header del festival, suspense para la lista                                                                          |
| `app/components/payments/festival-invoices-list.tsx`                                                      | Server (async) | Fetch + flatten + sort de facturas, renderiza `<InvoiceCard />`                                                                                  |
| `app/components/payments/festival-invoices-list-skeleton.tsx`                                             | Server         | Fallback para el suspense                                                                                                                        |
| `app/components/payments/invoice-card.tsx`                                                                | Server         | Card individual de factura, decide CTA vs banner partner-vs-titular                                                                              |
| `app/(routes)/portal/page.tsx`                                                                            | Server (route) | `.filter()` sobre participaciones, fetch de counts, pasa props al card                                                                           |
| `app/components/participant_dashboard/reservation-card.tsx`                                               | Server         | Cálculo agregado del card status, copy con singular/plural, link a `/invoices`                                                                   |
| `app/components/user_profile/announcements_cards/card.tsx`                                                | Server         | Selección de participación representativa (más reciente no rechazada)                                                                            |
| `app/(routes)/profiles/[profileId]/festivals/[festivalId]/reservations/[reservationId]/payments/page.tsx` | Server (route) | Gate `ownerInvoices` + redirect, render solo de facturas del titular                                                                             |
| `app/data/invoices/actions.ts`                                                                            | Server Actions | Queries `fetchReservationsWithInvoicesByProfileAndFestival`, `fetchOutstandingInvoiceCountByProfileAndFestival`, `fetchPendingInvoicesByProfile` |
| `app/data/invoices/definitions.ts`                                                                        | Tipos          | `InvoiceWithPaymentsAndOwner`, `ReservationWithStandAndInvoicesAndFestival`                                                                      |

---

## 9. Limitaciones y Problemas Conocidos

### Modelo de pago

| #   | Problema                                                                                                                                            | Impacto                                                                              | Severidad |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- |
| 1   | **Solo el titular puede pagar** — Si el titular no está disponible (vacaciones, bloqueado), el partner no tiene forma de completar el pago          | Reservas pueden vencer aunque el partner esté dispuesto a pagar                      | Media     |
| 2   | **No existe transferencia de titularidad** — `invoices.userId` no se puede reasignar entre participantes desde la UI                                | Si el titular original deja el equipo, no hay flujo para que otro participante asuma | Baja      |
| 3   | **Sin canal de contacto integrado al partner** — El mensaje "Contactá al titular" muestra el nombre pero no abre WhatsApp/email/notificación in-app | El partner debe contactar al titular por canales externos                            | Baja      |

### Datos / Esquema

| #   | Problema                                                                                                                                                                                                        | Impacto                                                                                     | Severidad |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------- |
| 4   | **Convivencia de `invoice.date` y `invoice.createdAt`** — Ambos campos existen y hoy se setean al mismo valor en inserts                                                                                        | Riesgo de divergencia si un futuro flujo edita uno sin el otro                              | Baja      |
| 5   | **`dueDate` derivado de `createdAt`, no de un campo persistido** — El plazo real puede extenderse vía `scheduledTasks.dueDate` pero el card del portal y `/invoices` siguen mostrando `createdAt + 5 días`      | El usuario puede ver una "fecha de vencimiento" que ya no aplica si admin extendió el plazo | Media     |
| 6   | **Sin constraint único en `(userId, festivalId)` para reservas** — Es intencional para soportar admin-created multi-reservation, pero implica que la UI debe estar siempre lista para listas en lugar de single | Si alguien introduce un `.find()` por hábito vuelven los bugs originales                    | Baja      |

### UX

| #   | Problema                                                                                                                                                                                                | Impacto                                                                       | Severidad |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| 7   | **El portal muestra el mismo "Pago pendiente" al partner que al titular** — Decisión explícita; el partner descubre su rol recién en `/invoices`                                                        | El partner puede sentir que se le pide acción cuando en realidad debe esperar | Baja      |
| 8   | **Página `/invoices` no surfacea contacto del titular más allá del nombre** — No hay email ni link directo de mensajería                                                                                | El partner debe buscar el contacto por sus medios                             | Baja      |
| 9   | **Card del portal no muestra desglose por reserva cuando hay varias** — Solo cuenta agregada                                                                                                            | Para entender el detalle hay que ir a `/invoices`                             | Baja      |
| 10  | **Email de extensión de plazo dirige al `/payments` aunque lo abra un partner** — Funciona porque el redirect lo manda a `/invoices`, pero ese rebote es ruido en analytics y puede percibirse como bug | El destino final es correcto pero el hop intermedio es subóptimo              | Baja      |

### Seguridad

| #   | Problema                                                                                                                                                         | Impacto                                                                              | Severidad |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- |
| 11  | **`protectRoute` sigue siendo el primer gate** — Solo verifica `currentUser.id === URL profileId`. La autorización fina vive en cada página (filtro de `userId`) | Cualquier ruta nueva bajo `/profiles/[id]/...` debe agregar su propio gate explícito | Media     |

---

## 10. Verificación Manual

1. **Titular con una reserva pendiente** → portal muestra "Hacé tu pago para confirmar tu reserva" con descripción "Tenés 1 pago pendiente." → CTA a `/invoices` → factura con botón "Completar pago" → flujo de pago accesible.
2. **Titular con varias reservas, varias pendientes** → portal muestra "Completá tus pagos para confirmar tus reservas" + "Tenés N reservas y M pagos pendientes." → `/invoices` lista todas, ordenadas con pendientes arriba.
3. **Partner en reserva compartida (titular pendiente)** → portal muestra el mismo "Pago pendiente" → `/invoices` muestra la factura con banner "Contactá al titular de la reserva, **{nombre}**, …" → navegar manualmente a `/reservations/[id]/payments` redirecciona a `/invoices`.
4. **URL-guessing** → usuario A sin participación en reserva R → `/profiles/<A>/festivals/F/reservations/R/payments` → redirect a `/invoices`.
5. **Email de extensión de plazo** → click "Realizar pago" como partner → aterriza vía redirect en `/invoices` con el banner del titular visible.
6. **Reserva con factura vencida** → línea "Vencida el …" en rojo en `InvoiceCard`.
