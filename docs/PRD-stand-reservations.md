# PRD: Sistema de Reservas de Stand

> **Producto:** Glitter — Plataforma de gestión de festivales  
> **Módulo:** Reservas de stand  
> **Fecha:** 2026-02-14  
> **Estado:** Documentación de implementación existente  
> **Stack:** Next.js 16 · React 19 · Drizzle ORM · PostgreSQL · Clerk · Resend

---

## 1. Resumen ejecutivo

El sistema de reservas de stand permite a artistas verificados seleccionar y reservar un espacio físico dentro de un festival gestionado por Glitter. El flujo abarca desde la visualización de un mapa interactivo de stands, la selección de un espacio, el pago mediante comprobante, y la gestión administrativa (confirmación/rechazo) de cada reserva. El sistema integra facturación automática, notificaciones por correo electrónico y recordatorios programados.

---

## 2. Objetivos

| Objetivo | Métrica implícita |
|---|---|
| Permitir a artistas reservar stands de forma autoservicio | Reservas creadas sin intervención manual |
| Garantizar que solo usuarios verificados reserven | Tasa de reservas inválidas = 0 |
| Sincronizar disponibilidad de stands en tiempo real | Conflictos de reserva duplicada minimizados |
| Automatizar facturación y notificaciones | Emails enviados por reserva creada/confirmada/rechazada |
| Dar a los administradores visibilidad y control total | Dashboard con filtros, acciones de confirmar/rechazar |

---

## 3. Historias de usuario

### 3.1 Artista / Participante

| ID | Historia | Criterios de aceptación |
|---|---|---|
| **US-01** | Como artista verificado, quiero ver un mapa interactivo de los stands del festival para identificar los espacios disponibles. | El mapa muestra stands coloreados por estado (disponible, reservado, confirmado, deshabilitado). Soporta zoom, pan y leyenda. |
| **US-02** | Como artista verificado, quiero reservar un stand disponible que coincida con mi categoría. | Solo puedo reservar stands cuya categoría coincida con mi perfil (`illustration` ↔ `new_artist`, `gastronomy`, `entrepreneurship`). Se crea reserva, factura, y tarea programada. |
| **US-03** | Como artista, quiero agregar un compañero (partner) a mi reserva de stand. | Puedo buscar artistas de la misma categoría y agregarlos como participantes durante la creación de la reserva. |
| **US-04** | Como artista, quiero subir mi comprobante de pago para completar mi reserva. | Puedo subir una imagen de voucher. El sistema registra el pago, actualiza la factura a `paid`, y cambia la reserva a `verification_payment`. |
| **US-05** | Como artista, quiero recibir un email de confirmación cuando mi reserva sea aprobada. | Recibo un email con los detalles del festival, stand asignado y mi perfil. |
| **US-06** | Como artista, quiero recibir un email si mi reserva es rechazada, con la razón del rechazo. | Recibo un email con la razón (opcional) del rechazo. Mi stand vuelve a estar disponible. |
| **US-07** | Como artista, quiero recibir un recordatorio si no he completado el pago de mi reserva. | Recibo un email de recordatorio (cron diario) si mi reserva lleva tiempo en estado `pending`. |
| **US-08** | Como artista, quiero agregar colaboradores a mi reserva confirmada para el día del evento. | Puedo agregar personas (nombre, apellido, documento) como colaboradores de mi stand. |

### 3.2 Administrador

| ID | Historia | Criterios de aceptación |
|---|---|---|
| **US-09** | Como admin, quiero ver todas las reservas en un dashboard con filtros por festival y estado. | Tabla con búsqueda por texto, filtro por festival y estado, ordenada por fecha de actualización. |
| **US-10** | Como admin, quiero confirmar una reserva verificando el pago. | Al confirmar: estado de reserva → `accepted`, estado de stand → `confirmed`, tarea programada se completa, se envían emails a todos los participantes. |
| **US-11** | Como admin, quiero rechazar una reserva con una razón opcional. | Al rechazar: estado de reserva → `rejected`, estado de stand → `available`, se envían emails a todos los participantes. |
| **US-12** | Como admin, quiero eliminar una reserva completamente. | Se eliminan tareas programadas, la reserva, y el stand vuelve a `available`. |
| **US-13** | Como admin, quiero recibir un email cuando se crea una nueva reserva. | Todos los usuarios con rol `admin` reciben un email con detalles de la reserva. |
| **US-14** | Como admin, quiero recibir un email cuando un usuario sube un comprobante de pago. | Todos los admins reciben notificación con los detalles de la factura. |
| **US-15** | Como admin, quiero editar los participantes de una reserva existente. | Puedo buscar artistas y cambiar/agregar participantes desde el formulario de edición. |

### 3.3 Visitante (público)

| ID | Historia | Criterios de aceptación |
|---|---|---|
| **US-16** | Como visitante, quiero ver el mapa del festival con los artistas que ya confirmaron su participación. | Mapa público muestra stands con participantes (avatares, nombres) para stands reservados/confirmados. |

---

## 4. Modelo de datos

### 4.1 Diagrama entidad-relación

```
┌─────────────┐       ┌─────────────────────┐       ┌──────────────┐
│  festivals   │──1:N──│       stands         │──1:N──│stand_reserva-│
│              │       │                     │       │   tions      │
└─────────────┘       └─────────────────────┘       └──────┬───────┘
                        │                                   │
                        │ N:1                          1:N  │  1:N
                        ▼                              ▼    ▼
                ┌───────────────┐          ┌──────────┐ ┌──────────┐
                │festival_sectors│          │participa-│ │ invoices │
                └───────────────┘          │  tions   │ └────┬─────┘
                                           └────┬─────┘      │ 1:N
                                                │ N:1         ▼
                                                ▼        ┌──────────┐
                                           ┌────────┐   │ payments │
                                           │ users  │   └──────────┘
                                           └────────┘
                                                         ┌────────────────────┐
                                                         │reservation_collabo-│
                                  stand_reservations 1:N─│     rators         │
                                                         └────────┬───────────┘
                                                                  │ N:1
                                                                  ▼
                                                         ┌───────────────┐
                                                         │ collaborators │
                                                         └───────────────┘
```

### 4.2 Tablas principales

#### `stands`

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `id` | serial | PK | Identificador único |
| `label` | text | — | Etiqueta del stand (e.g. "A") |
| `stand_number` | integer | NOT NULL | Número del stand |
| `status` | enum | `available` | `available` · `reserved` · `confirmed` · `disabled` |
| `orientation` | enum | `landscape` | `portrait` · `landscape` |
| `stand_category` | enum | `illustration` | `illustration` · `gastronomy` · `entrepreneurship` · `none` |
| `zone` | enum | `main` | `main` · `secondary` |
| `width` | real | — | Ancho en unidades del mapa |
| `height` | real | — | Alto en unidades del mapa |
| `position_left` | real | — | Posición X en el mapa |
| `position_top` | real | — | Posición Y en el mapa |
| `price` | real | `0` | Precio del stand |
| `festival_id` | integer | FK | Festival al que pertenece |
| `festival_sector_id` | integer | FK | Sector del festival |
| `qr_code_id` | integer | FK | Código QR asociado |
| `created_at` | timestamp | `now()` | Fecha de creación |
| `updated_at` | timestamp | `now()` | Última actualización |

#### `stand_reservations`

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `id` | serial | PK | Identificador único |
| `stand_id` | integer | NOT NULL | Stand reservado |
| `festival_id` | integer | NOT NULL | Festival asociado |
| `status` | enum | `pending` | `pending` · `verification_payment` · `accepted` · `rejected` |
| `created_at` | timestamp | `now()` | Fecha de creación |
| `updated_at` | timestamp | `now()` | Última actualización |

#### `participations` (reservation_participants)

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `id` | serial | PK | Identificador único |
| `user_id` | integer | NOT NULL, FK → users, CASCADE | Usuario participante |
| `reservation_id` | integer | NOT NULL, FK → stand_reservations, CASCADE | Reserva asociada |
| `has_stamp` | boolean | `false` | Si el participante tiene sello |
| `created_at` | timestamp | `now()` | Fecha de creación |
| `updated_at` | timestamp | `now()` | Última actualización |

#### `invoices`

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `id` | serial | PK | Identificador único |
| `amount` | real | — | Monto de la factura |
| `date` | timestamp | — | Fecha de emisión |
| `status` | enum | `pending` | `pending` · `paid` · `cancelled` |
| `user_id` | integer | FK → users | Usuario responsable del pago |
| `reservation_id` | integer | FK → stand_reservations | Reserva asociada |

#### `payments`

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `id` | serial | PK | Identificador único |
| `amount` | real | — | Monto pagado |
| `date` | timestamp | — | Fecha del pago |
| `invoice_id` | integer | FK → invoices | Factura asociada |
| `voucher_url` | text | — | URL del comprobante de pago |

#### `reservation_collaborators`

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `id` | serial | PK | Identificador único |
| `reservation_id` | integer | FK → stand_reservations | Reserva |
| `collaborator_id` | integer | FK → collaborators | Colaborador |
| `arrived_at` | timestamp | — | Marca de llegada el día del evento |

---

## 5. Contratos de API

### 5.1 Server Actions (Next.js)

Las siguientes funciones son Server Actions invocadas directamente desde componentes React.

#### Crear reserva

```typescript
// app/api/user_requests/actions.ts
async function createReservation(
  reservation: NewStandReservation,
  price: number,
  forUser: BaseProfile
): Promise<{
  success: boolean;
  message: string;
  description?: string;
  reservationId?: number;
}>

// Input type
type NewStandReservation = {
  standId: number;
  festivalId: number;
  participantIds: number[];
}
```

**Precondiciones:**
1. `forUser.status === "verified"`
2. No existen reservas no rechazadas para el stand
3. La categoría del stand coincide con la del usuario
4. El stand tiene status `available`
5. La fecha actual ≥ `reservationsStartDate` del festival (excepto admins)
6. El usuario está registrado en el festival (via `userRequests`)

**Efectos secundarios:**
- Crea registro en `stand_reservations` (status: `pending`)
- Crea registros en `participations` para cada participante
- Actualiza stand a `reserved`
- Crea `invoice` con el precio del stand
- Crea `scheduled_task` con recordatorio a 5 días
- Envía email a todos los administradores
- Revalida cache de `/profiles` y `/my_profile`

#### Confirmar reserva

```typescript
// app/api/reservations/actions.ts
async function confirmReservation(
  reservationId: number,
  user: BaseProfile,
  standId: number,
  standLabel: string,
  festival: FestivalWithDates,
  participants: ReservationParticipantWithUser[]
): Promise<{ success: boolean; message: string }>
```

**Efectos secundarios:**
- Actualiza reserva a `accepted`
- Actualiza stand a `confirmed`
- Completa `scheduled_task` asociada
- Envía email de confirmación a todos los participantes (sin duplicados)
- Revalida cache de `/dashboard/payments`

#### Rechazar reserva

```typescript
// app/api/reservations/actions.ts
async function rejectReservation(
  reservation: ReservationWithParticipantsAndUsersAndStandAndFestival,
  reason?: string
): Promise<{ success: boolean; message: string }>
```

**Efectos secundarios:**
- Actualiza reserva a `rejected`
- Actualiza stand a `available`
- Envía email de rechazo a cada participante
- Revalida cache de `/dashboard/reservations`

#### Eliminar reserva

```typescript
// app/api/reservations/actions.ts
async function deleteReservation(
  reservationId: number,
  standId: number
): Promise<{ success: boolean; message: string }>
```

**Efectos secundarios:**
- Elimina `scheduled_tasks` asociadas
- Elimina la reserva (cascade elimina participaciones)
- Actualiza stand a `available`
- Revalida cache de `/dashboard/reservations`

#### Consultar reservas

```typescript
// app/api/reservations/actions.ts
async function fetchReservations(options: {
  query?: string;
  festivalId?: number;
}): Promise<ReservationWithParticipantsAndUsersAndStandAndFestivalAndInvoicesWithPayments[]>

async function fetchReservation(id: number):
  Promise<ReservationWithParticipantsAndUsersAndStandAndFestival | undefined | null>

async function fetchConfirmedReservationsByFestival(festivalId: number):
  Promise<ReservationWithParticipantsAndUsersAndStandAndCollaborators[]>

async function fetchValidReservationsByFestival(festivalId: number):
  Promise<ReservationWithParticipantsAndUsersAndStandAndCollaborators[]>
```

#### Gestión de colaboradores

```typescript
// app/lib/reservations/actions.ts
async function addCollaborator(
  reservationId: number,
  collaborator: NewCollaborator | Collaborator
): Promise<{ success: boolean; message: string }>

async function deleteReservationCollaborator(
  reservationId: number,
  collaboratorId: number
): Promise<{ success: boolean; message: string }>
```

### 5.2 REST API Routes

#### `POST /api/payments`

Crea o actualiza un pago asociado a una factura.

**Request body (Zod-validated):**

```typescript
{
  id?: number;           // Si se incluye, actualiza el pago existente
  amount: number;        // Monto del pago
  date: Date;            // Fecha del pago (coerced from string)
  invoiceId: number;     // Factura asociada
  voucherUrl: string;    // URL del comprobante (must be valid URL)
  oldVoucherUrl?: string; // URL anterior (se elimina de UploadThing)
  reservationId: number; // Reserva asociada
  standId: number;       // Stand asociado
}
```

**Response:**

```typescript
// 200 OK
{ success: true; message: "Pago creado con éxito" | "Pago actualizado con éxito" }

// 400 Bad Request (validation)
{ success: false; message: "Invalid payment data"; errors: ZodIssue[] }

// 400 Bad Request (server error)
{ success: false; message: "No se pudo guardar el pago. Intenta nuevamente" }
```

**Efectos secundarios:**
- Crea/actualiza registro en `payments`
- Actualiza factura a `paid`
- Elimina voucher anterior de UploadThing (si aplica)
- Envía email de confirmación al usuario
- Envía email de notificación a administradores
- Actualiza reserva a `verification_payment`

#### `GET /api/cron/morning/reservationReminders`

Endpoint de cron job que envía recordatorios de pago para reservas pendientes.

**Autenticación:** Vercel Cron (header de autorización)  
**Response:** Resultados del envío de emails

---

## 6. Máquina de estados

### 6.1 Estado de la reserva (`stand_reservations.status`)

```
                    ┌──────────────┐
                    │   pending    │ ← Estado inicial al crear
                    └──────┬───────┘
                           │
                    usuario sube pago
                           │
                           ▼
              ┌────────────────────────┐
              │  verification_payment  │
              └────────────┬───────────┘
                           │
               ┌───────────┴───────────┐
               │                       │
          admin confirma          admin rechaza
               │                       │
               ▼                       ▼
        ┌─────────────┐       ┌─────────────┐
        │   accepted   │       │   rejected   │
        └─────────────┘       └─────────────┘
```

> **Nota:** Un admin puede rechazar desde cualquier estado (no solo desde `verification_payment`).  
> La eliminación directa también es posible desde cualquier estado.

### 6.2 Estado del stand (`stands.status`)

| Evento | Stand status anterior | Stand status nuevo |
|---|---|---|
| Reserva creada | `available` | `reserved` |
| Reserva confirmada | `reserved` | `confirmed` |
| Reserva rechazada | `reserved`/`confirmed` | `available` |
| Reserva eliminada | cualquiera | `available` |
| Pago verificándose | `reserved` | `confirmed`* |

> *En `updateReservationStatus`, si el status de la reserva es `verification_payment` o `accepted`, el stand pasa a `confirmed`.

---

## 7. Flujo de usuario (end-to-end)

### 7.1 Artista crea reserva

```
1. Navega a /profiles/{profileId}/festivals/{festivalId}/reservations/new
2. Sistema verifica:
   - Usuario autenticado (Clerk)
   - Perfil verificado
   - Participación en el festival
   - Fecha de reservas abierta
3. Ve mapa interactivo con stands por sector
4. Hace click/tap en stand disponible (color ámbar)
5. Se abre modal (desktop) o drawer (mobile)
6. Formulario muestra:
   - Stand seleccionado
   - Usuario actual como participante principal
   - Opción de agregar compañero (solo categoría illustration/new_artist)
7. Clic en "Reservar espacio"
8. Sistema ejecuta createReservation()
9. En éxito:
   - Animación de confetti
   - Toast de éxito
   - Redirección a página de pagos
10. En error:
    - Toast con mensaje descriptivo
```

### 7.2 Artista realiza pago

```
1. Navega a /profiles/{profileId}/festivals/{festivalId}/reservations/{reservationId}/payments
2. Ve detalles de factura y código QR de pago
3. Sube comprobante de pago (imagen via UploadThing)
4. Sistema ejecuta POST /api/payments
5. Se actualiza factura a "paid"
6. Se actualiza reserva a "verification_payment"
7. Se notifica al usuario y administradores por email
```

### 7.3 Admin gestiona reserva

```
1. Navega a /dashboard/reservations
2. Ve tabla de reservas con filtros
3. Selecciona reserva para editar
4. Puede:
   a. Confirmar → confirmReservation() → emails a participantes
   b. Rechazar → rejectReservation(reason?) → emails a participantes
   c. Eliminar → deleteReservation() → stand liberado
   d. Editar participantes
```

---

## 8. Arquitectura técnica

### 8.1 Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16.1 (App Router) |
| Runtime | React 19 (Server Components + Server Actions) |
| ORM | Drizzle ORM 0.44 |
| Base de datos | PostgreSQL (SSL) |
| Autenticación | Clerk 6.36 |
| Validación | Zod 4.3 |
| Formularios | React Hook Form 7.71 |
| Estilos | Tailwind CSS 4 + shadcn/ui |
| Email | React Email 3.0 + Resend |
| Almacenamiento | UploadThing + EdgeStore |
| Despliegue | Vercel |

### 8.2 Componentes clave

```
app/
├── api/
│   ├── reservations/
│   │   ├── actions.ts          # CRUD de reservas (Server Actions)
│   │   ├── definitions.ts      # Tipos TypeScript
│   │   └── helpers.ts          # Funciones auxiliares
│   ├── stands/
│   │   ├── actions.ts          # CRUD de stands
│   │   └── definitions.ts      # Tipos de stands
│   ├── user_requests/
│   │   └── actions.ts          # createReservation (lógica principal)
│   └── payments/
│       └── route.ts            # REST endpoint de pagos
├── lib/
│   ├── reservations/
│   │   ├── actions.ts          # Funciones adicionales (colaboradores, status)
│   │   └── definitions.ts      # Tipos de colaboradores
│   └── stands/
│       └── helpers.ts          # canStandBeReserved()
├── data/
│   └── invoices/
│       └── actions.ts          # CRUD de facturas y pagos
├── components/
│   ├── maps/                   # Mapa interactivo SVG
│   │   ├── user/user-map.tsx   # Contenedor principal del mapa
│   │   ├── map-stand.tsx       # Stand individual (SVG rect)
│   │   ├── map-canvas.tsx      # Canvas SVG
│   │   ├── map-tooltip.tsx     # Tooltip en hover
│   │   ├── map-stand-drawer.tsx # Drawer en mobile
│   │   ├── map-legend.tsx      # Leyenda de colores
│   │   └── map-utils.ts        # Utilidades de posición y color
│   ├── next_event/reservation/ # Flujo de reserva
│   │   ├── form.tsx            # Formulario de reserva
│   │   ├── modal.tsx           # Modal (desktop)
│   │   └── drawer.tsx          # Drawer (mobile)
│   └── reservations/           # Dashboard admin
│       ├── columns.tsx         # Columnas de tabla
│       ├── table.tsx           # Tabla de reservas
│       ├── edit-form.tsx       # Edición de reserva
│       └── filters/            # Filtros
├── emails/                     # Templates de email
│   ├── reservation-created.tsx
│   ├── reservation-confirmation.tsx
│   ├── reservation-rejection.tsx
│   ├── reservation-reminder.tsx
│   ├── payment-confirmation-for-user.tsx
│   └── payment-confirmation-for-admins.tsx
└── db/
    └── schema.ts               # Schema Drizzle completo
```

### 8.3 Mapa interactivo

- **Biblioteca:** `react-zoom-pan-pinch` para zoom/pan
- **Renderizado:** SVG con `<rect>` por cada stand
- **Colores:**
  - Ámbar claro → disponible (reservable por el usuario)
  - Gris → disponible (no reservable por categoría)
  - Esmeralda → reservado
  - Rosa/rojo → confirmado
  - Gris oscuro → deshabilitado
- **Responsivo:** Modal en desktop, Drawer en mobile (detección via `useMediaQuery`)
- **Accesibilidad:** Navegación por teclado (Enter/Space), atributos ARIA

---

## 9. Notificaciones por email

| Trigger | Destinatario | Template | Asunto |
|---|---|---|---|
| Reserva creada | Admins | `reservation-created.tsx` | "Nueva reserva creada" |
| Reserva confirmada | Participantes | `reservation-confirmation.tsx` | "Reserva confirmada para el festival {name}" |
| Reserva rechazada | Participantes | `reservation-rejection.tsx` | "{userName}, tu reserva ha sido eliminada" |
| Recordatorio pendiente | Participante principal | `reservation-reminder.tsx` | (cron diario) |
| Pago registrado | Usuario | `payment-confirmation-for-user.tsx` | "Tu pago ha sido registrado" |
| Pago registrado | Admins | `payment-confirmation-for-admins.tsx` | "{displayName} hizo el pago de su reserva" |

---

## 10. Reglas de negocio

1. **Verificación obligatoria:** Solo usuarios con `status === "verified"` pueden crear reservas.
2. **Coincidencia de categoría:** La categoría del stand debe coincidir con la del usuario. `new_artist` se mapea a `illustration`.
3. **Una reserva por stand:** No se permiten múltiples reservas no rechazadas para un mismo stand.
4. **Fecha de apertura:** Las reservas solo se pueden crear después de `reservationsStartDate` del festival. Los administradores pueden saltarse esta restricción.
5. **Participación requerida:** El usuario debe estar registrado en el festival (tabla `userRequests`).
6. **Facturación automática:** Al crear una reserva se genera automáticamente una factura por el precio del stand.
7. **Recordatorio automático:** Se programa un recordatorio a 5 días para reservas pendientes.
8. **Transacciones atómicas:** Todas las operaciones de escritura que afectan múltiples tablas usan transacciones de base de datos.

---

## 11. Limitaciones y problemas conocidos

### 11.1 Condiciones de carrera (Race Conditions)

- **Descripción:** La verificación de disponibilidad del stand se realiza con una consulta previa al `INSERT`. Si dos usuarios intentan reservar el mismo stand simultáneamente, ambos podrían pasar la validación antes de que cualquiera complete la transacción.
- **Mitigación actual:** Verificación dentro de `createReservation()` antes de la transacción. No hay lock optimista ni constraint `UNIQUE` a nivel de base de datos sobre `(stand_id, status != 'rejected')`.
- **Recomendación:** Agregar un constraint parcial en PostgreSQL o usar `SELECT ... FOR UPDATE` dentro de la transacción.

### 11.2 Ausencia de tests

- **Descripción:** No existen tests unitarios ni de integración para el flujo de reservas.
- **Impacto:** Riesgo de regresiones en lógica de negocio crítica (estados, validaciones, transacciones).
- **Recomendación:** Agregar tests para `createReservation`, `confirmReservation`, `rejectReservation` y `canStandBeReserved`.

### 11.3 Sin actualización en tiempo real

- **Descripción:** No hay WebSocket ni Server-Sent Events. La disponibilidad de stands se verifica solo al hacer click/crear reserva.
- **Impacto:** Un usuario puede estar viendo stands como "disponibles" que ya fueron reservados por otro usuario.
- **Recomendación:** Implementar polling periódico o SSE para actualizar el mapa en tiempo real.

### 11.4 No hay límite de reservas por usuario por festival

- **Descripción:** Aunque hay una función `profileHasReservation()` a nivel de frontend, no hay un constraint a nivel de base de datos que impida que un usuario tenga múltiples reservas en un mismo festival.
- **Impacto:** Un usuario podría, mediante manipulación de API, crear múltiples reservas.
- **Recomendación:** Agregar validación server-side y/o constraint `UNIQUE(user_id, festival_id)` en participaciones.

### 11.5 Falta de soft-delete

- **Descripción:** `deleteReservation` hace un `DELETE` físico, no un soft-delete. Se pierde el historial.
- **Impacto:** No se puede auditar reservas eliminadas.
- **Recomendación:** Considerar agregar un campo `deleted_at` para soft-delete.

### 11.6 Inconsistencia en la máquina de estados del stand

- **Descripción:** En `updateReservationStatus()`, si la reserva pasa a `verification_payment`, el stand cambia a `confirmed`. Esto es inconsistente con el flujo principal donde `confirmed` debería ser solo para reservas `accepted`.
- **Impacto:** Un stand podría mostrarse como "confirmado" cuando en realidad el pago aún está pendiente de verificación.
- **Recomendación:** Alinear la lógica para que `verification_payment` mantenga el stand como `reserved`.

### 11.7 Emails sin retry

- **Descripción:** Los envíos de email no tienen lógica de reintentos. Si Resend falla, el email se pierde.
- **Impacto:** Usuarios o admins podrían no recibir notificaciones críticas.
- **Recomendación:** Implementar cola de emails con reintentos o usar el sistema de webhooks de Resend.

### 11.8 Foreign keys sin cascade completo

- **Descripción:** `stand_reservations.stand_id` y `stand_reservations.festival_id` no tienen `ON DELETE` definido.
- **Impacto:** Eliminar un stand o festival con reservas asociadas podría causar errores de integridad referencial.
- **Recomendación:** Definir políticas de cascade o restrict según la lógica de negocio deseada.

### 11.9 TODO pendiente en el código

- **Descripción:** `deleteReservationCollaborator` elimina el registro de `collaborators` directamente en lugar de solo la relación en `reservation_collaborators`. Hay un TODO en el código reconociendo este problema.
- **Impacto:** Si un colaborador participa en múltiples reservas, eliminarlo de una elimina su registro completo.
- **Recomendación:** Implementar la lógica comentada que solo elimina la relación.

---

## 12. Métricas sugeridas

| Métrica | Fuente |
|---|---|
| Reservas creadas por festival | `stand_reservations` WHERE `festival_id` |
| Tiempo promedio de pending → accepted | `created_at` vs `updated_at` con status `accepted` |
| Tasa de rechazo | `rejected` / total por festival |
| Conversión de reserva a pago | `verification_payment` / `pending` |
| Stands sin reservar al cierre | `stands` WHERE `status = 'available'` al final |

---

## 13. Mejoras futuras (backlog sugerido)

1. **Lock optimista:** Agregar `version` column o usar `SELECT FOR UPDATE` para prevenir race conditions.
2. **Tiempo real:** Implementar SSE o WebSocket para actualizar el mapa cuando cambie la disponibilidad.
3. **Tests automatizados:** Cubrir flujos críticos con tests de integración.
4. **Pasarela de pago:** Integrar con MercadoPago/Stripe para pagos en línea en lugar de comprobantes manuales.
5. **Waitlist:** Lista de espera para stands populares.
6. **Auditoría:** Log de cambios de estado para trazabilidad.
7. **Soft-delete:** Para preservar historial de reservas eliminadas.
8. **Notificaciones in-app:** Además de email, notificaciones dentro de la plataforma.
9. **Bulk operations:** Permitir a admins confirmar/rechazar múltiples reservas a la vez.
10. **Exportar datos:** Exportar listado de reservas a CSV/Excel para gestión offline.
