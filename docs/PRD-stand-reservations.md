# PRD: Reserva de Stands en Festivales

**Producto:** Glitter
**Fecha:** 2026-02-17
**Estado:** Implementado
**Rama de referencia:** `feat/add-polling-for-improved-realtime-updates-during-reservations`

---

## 1. Resumen

El sistema de reserva de stands permite a participantes verificados de un festival seleccionar y reservar un espacio (stand) a través de un flujo guiado de 4 pasos. Incluye un mecanismo de hold temporal de 3 minutos para evitar conflictos entre usuarios, y polling en tiempo real cada 4 segundos para reflejar la disponibilidad actualizada del mapa.

---

## 2. Historias de Usuario

### Participante

| ID    | Historia                                                                                                                          | Criterio de aceptación                                                                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-01 | Como participante verificado, quiero ver los sectores disponibles filtrados por mi categoría para elegir dónde reservar           | Sectores sin stands disponibles para mi categoría aparecen deshabilitados. Se muestra cantidad de stands libres y precio por espacio                               |
| US-02 | Como participante, quiero ver un mapa interactivo del sector con el estado actual de cada stand en tiempo real                    | Los stands se colorean por estado (verde=disponible, rojo=reservado, ámbar=en hold). El estado se actualiza cada 4 segundos sin recargar la página                 |
| US-03 | Como participante, quiero seleccionar un stand y que se reserve temporalmente por 3 minutos mientras confirmo                     | Al seleccionar, se crea un hold de 3 min. El stand se muestra como "held" para otros usuarios. Si tengo un hold previo en otro stand, se libera automáticamente    |
| US-04 | Como participante, quiero ver un resumen con countdown antes de confirmar mi reserva                                              | Se muestra: stand seleccionado, sector, precio, mapa miniatura, y un temporizador de cuenta regresiva. El banner cambia de ámbar a rojo cuando quedan ≤30 segundos |
| US-05 | Como participante de categoría ilustración/nuevo artista, quiero poder agregar un compañero de stand al confirmar                 | Se muestra un selector de partners opcional. El partner se agrega como participante de la reserva                                                                  |
| US-06 | Como participante, quiero que al confirmar la reserva se genere automáticamente una factura y se me redirija a la página de pagos | Se crea la reserva, la factura con el precio del stand, y una tarea programada con vencimiento a 5 días                                                            |
| US-07 | Como participante, quiero que si mi hold expira, el stand se libere automáticamente y yo sea redirigido al mapa                   | Al llegar el timer a 0, se cancela el hold, se muestra un toast informativo y se redirige a la selección de stand                                                  |

### Administrador

| ID    | Historia                                                                                             | Criterio de aceptación                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-08 | Como admin, quiero recibir un email cuando se crea una nueva reserva                                 | Se envía email a todos los admins con nombre del festival, creador, stand y categoría                                                              |
| US-09 | Como admin, quiero poder confirmar o rechazar reservas, y que se notifique al participante por email | Al confirmar: stand pasa a "confirmed", se envía email de confirmación. Al rechazar: stand vuelve a "available", se envía email con razón opcional |
| US-10 | Como admin, quiero ver todas las reservas de un festival con filtros y estado de pago                | La tabla de reservas muestra participantes, stand, estado, facturas y pagos                                                                        |

---

## 3. Flujo de Usuario

```
Paso 1                    Paso 2                     Paso 3                    Paso 4
Selección de Sector  -->  Selección de Stand    -->  Confirmación         -->  Pago
/reservations/new         /sectors/[sectorId]        /confirm/[holdId]         /payments
```

### Paso 1 — Selección de Sector

- Se muestran cards de sectores ordenados por disponibilidad
- Filtrado por categoría del usuario (illustration, gastronomy, entrepreneurship, new_artist)
- Cada card muestra: nombre, descripción, precio, stands disponibles
- Sectores sin disponibilidad aparecen deshabilitados

### Paso 2 — Selección de Stand en Mapa

- Mapa SVG interactivo con zoom (1-4x) y pan
- Stands coloreados por estado con leyenda
- Polling cada 4s actualiza estados en vivo
- Al tocar un stand disponible, se despliega una card inferior con detalles
- El botón "Seleccionar Stand" ejecuta `createStandHold()` y redirige al Paso 3

### Paso 3 — Confirmación de Reserva

- Countdown de 3 minutos (MM:SS) con cambio de color visual
- Resumen: stand, sector, mapa miniatura, precio total (BOB)
- Selector opcional de partner (solo para illustration/new_artist)
- Botones: "Cancelar" / "Confirmar Reserva"
- Confirmación ejecuta `confirmStandHold()`, muestra confetti y redirige al Paso 4
- Si expira: cancela hold automáticamente y redirige al Paso 2

### Paso 4 — Pago

- Detalle del producto, monto adeudado, código QR para pago
- Solo muestra facturas pendientes

---

## 4. Requisitos Técnicos

### 4.1 Stack

| Componente     | Tecnología                           |
| -------------- | ------------------------------------ |
| Framework      | Next.js (App Router)                 |
| Base de datos  | PostgreSQL                           |
| ORM            | Drizzle ORM                          |
| Autenticación  | Clerk                                |
| Email          | Resend                               |
| Validación     | Zod                                  |
| UI             | Tailwind CSS, Radix UI, Lucide Icons |
| Notificaciones | Sonner (toasts)                      |

### 4.2 Mecanismo de Hold Temporal

- **Duración:** 3 minutos (`HOLD_DURATION_MINUTES = 3`)
- **Concurrencia:** Un solo hold activo por usuario por festival
- **Bloqueo:** `SELECT FOR UPDATE` en la fila del stand para prevenir race conditions
- **Reemplazo:** Si el usuario selecciona otro stand, el hold anterior se libera en la misma transacción
- **Expiración server-side:** `cleanupExpiredHolds()` ejecutado como fire-and-forget cada 2 min máximo (throttled via `lastCleanupTime`)
- **Expiración client-side:** Timer de 1 segundo que redirige al mapa cuando llega a 0

### 4.3 Polling en Tiempo Real

- **Endpoint:** `GET /api/stands/status?sectorId={id}`
- **Intervalo:** 4000ms (configurable)
- **Payload:** Solo `{ id, status }` por stand (lightweight)
- **Optimización:** Pausa polling cuando el tab está oculto (Page Visibility API), reanuda inmediatamente al volver
- **Cleanup acoplado:** El endpoint de polling dispara la limpieza de holds expirados (throttled)

### 4.4 Transacciones y Consistencia

Todas las operaciones de mutación usan transacciones Drizzle:

- `createStandHold`: Verifica holds existentes + bloquea stand + crea hold + actualiza status
- `confirmStandHold`: Valida hold + crea reserva + participantes + factura + tarea programada + elimina hold
- `cancelStandHold`: Elimina hold + resetea stand
- `cleanupExpiredHolds`: Itera holds expirados y resetea stands

### 4.5 Emails Transaccionales

| Evento                       | Destinatario  | Template                               |
| ---------------------------- | ------------- | -------------------------------------- |
| Reserva creada               | Admins        | `ReservationCreatedEmailTemplate`      |
| Reserva confirmada por admin | Participantes | `ReservationConfirmationEmailTemplate` |
| Reserva rechazada por admin  | Participantes | `ReservationRejectionEmailTemplate`    |

Remitente: `Reservas Glitter <reservas@productoraglitter.com>`

---

## 5. Modelo de Datos

### 5.1 Tabla `stands`

| Campo            | Tipo       | Descripción                                                                |
| ---------------- | ---------- | -------------------------------------------------------------------------- |
| id               | serial PK  |                                                                            |
| label            | text       | Etiqueta visual (ej: "A")                                                  |
| status           | enum       | `available` · `held` · `reserved` · `confirmed` · `disabled`               |
| standNumber      | integer    | Número de stand                                                            |
| standCategory    | enum       | `none` · `illustration` · `gastronomy` · `entrepreneurship` · `new_artist` |
| zone             | enum       | `main` · `secondary`                                                       |
| orientation      | enum       | `portrait` · `landscape`                                                   |
| width            | real       | Ancho en unidades de mapa                                                  |
| height           | real       | Alto en unidades de mapa                                                   |
| positionLeft     | real       | Posición X en mapa SVG                                                     |
| positionTop      | real       | Posición Y en mapa SVG                                                     |
| price            | real       | Precio en BOB                                                              |
| festivalId       | integer FK | Festival al que pertenece                                                  |
| festivalSectorId | integer FK | Sector del festival                                                        |

### 5.2 Tabla `stand_holds`

| Campo      | Tipo       | Descripción                                |
| ---------- | ---------- | ------------------------------------------ |
| id         | serial PK  |                                            |
| standId    | integer FK | Stand en hold (cascade delete)             |
| userId     | integer FK | Usuario que hizo el hold (cascade delete)  |
| festivalId | integer FK | Festival (cascade delete)                  |
| expiresAt  | timestamp  | Momento de expiración (created_at + 3 min) |

**Índices:** `stand_holds_stand_idx(standId)`, `stand_holds_user_festival_idx(userId, festivalId)`

### 5.3 Tabla `stand_reservations`

| Campo      | Tipo      | Descripción                                                  |
| ---------- | --------- | ------------------------------------------------------------ |
| id         | serial PK |                                                              |
| standId    | integer   | Stand reservado                                              |
| festivalId | integer   | Festival                                                     |
| status     | enum      | `pending` · `verification_payment` · `accepted` · `rejected` |

**Relaciones:** participants (many), collaborators (many), invoices (many), stand (one), festival (one)

### 5.4 Diagrama de Estados del Stand

```
                  createStandHold()
  available ─────────────────────────> held
      ^                                  │
      │ cancelStandHold()                │ confirmStandHold()
      │ cleanupExpiredHolds()            │
      │ rejectReservation()              v
      │ deleteReservation()           reserved
      │                                  │
      │                                  │ confirmReservation()
      │                                  v
      └──────────────────────────── confirmed
```

---

## 6. Contratos de API

### 6.1 Endpoint REST

#### `GET /api/stands/status`

Retorna el estado actual de todos los stands de un sector. Usado por el polling.

**Query params:**
| Param | Tipo | Requerido | Validación |
|-------|------|-----------|-----------|
| sectorId | number | Sí | Entero positivo (Zod) |

**Response 200:**

```json
{
	"stands": [
		{ "id": 1, "status": "available" },
		{ "id": 2, "status": "held" },
		{ "id": 3, "status": "reserved" }
	],
	"timestamp": 1708200000000
}
```

**Response 400:**

```json
{ "error": "Invalid parameters" }
```

**Notas:** No requiere autenticación. Dispara cleanup de holds expirados (throttled a 2 min).

---

### 6.2 Server Actions

#### `createStandHold(standId, userId, festivalId)`

Crea un hold temporal de 3 minutos sobre un stand.

```typescript
// Request
createStandHold(standId: number, userId: number, festivalId: number)

// Response
{
  success: boolean;
  message: string;
  holdId?: number;       // ID del hold creado
  alreadyHeld?: boolean; // true si el usuario ya tenía hold en este stand
}
```

**Comportamiento:**

- Si el usuario tiene hold en el mismo stand → retorna hold existente con `alreadyHeld: true`
- Si el usuario tiene hold en otro stand → libera el anterior y crea uno nuevo
- Si el stand no está available → retorna `success: false`
- Usa `SELECT FOR UPDATE` para evitar race conditions

---

#### `confirmStandHold(holdId, userId, partnerId?)`

Convierte un hold activo en una reserva formal.

```typescript
// Request
confirmStandHold(holdId: number, userId: number, partnerId?: number)

// Response
{
  success: boolean;
  message: string;
  reservationId?: number;
  description?: string;
}
```

**Efectos secundarios:**

- Crea `standReservations` (status: pending)
- Crea `reservationParticipants` (usuario + partner opcional)
- Actualiza stand a status `reserved`
- Crea `invoices` con el precio del stand
- Crea `scheduledTasks` (vencimiento: 5 días, reminder: 4 días)
- Elimina el hold
- Envía email a admins (fuera de transacción)
- Revalida paths: `/profiles`, `/my_profile`

---

#### `cancelStandHold(holdId, userId)`

Cancela un hold y libera el stand.

```typescript
// Request
cancelStandHold(holdId: number, userId: number)

// Response
{ success: boolean; message: string }
```

---

#### `getActiveHold(userId, festivalId)`

Consulta si el usuario tiene un hold activo en el festival.

```typescript
// Request
getActiveHold(userId: number, festivalId: number)

// Response
{ id: number; standId: number } | null
```

---

#### `cleanupExpiredHolds()`

Limpia holds expirados y restaura stands a available.

```typescript
// Response
number; // cantidad de holds limpiados
```

---

#### `confirmReservation(reservationId, user, standId, standLabel, festival, participants)`

Confirma una reserva (acción admin). Cambia stand a `confirmed`, envía emails de confirmación.

---

#### `rejectReservation(reservation, reason?)`

Rechaza una reserva (acción admin). Resetea stand a `available`, envía emails con razón opcional.

---

#### `deleteReservation(reservationId, standId)`

Elimina una reserva y sus tareas programadas. Resetea stand a `available`.

---

## 7. Componentes Clave

| Archivo                                                              | Tipo           | Responsabilidad                                            |
| -------------------------------------------------------------------- | -------------- | ---------------------------------------------------------- |
| `app/components/festivals/reservations/sector-selection-client.tsx`  | Client         | UI de selección de sector con filtrado por categoría       |
| `app/components/festivals/client-map.tsx`                            | Client         | Orquesta el mapa, polling y selección de stands            |
| `app/components/maps/user/user-map.tsx`                              | Client         | Mapa SVG interactivo con zoom/pan                          |
| `app/components/festivals/reservations/stand-info-card.tsx`          | Client         | Drawer inferior con detalles del stand seleccionado        |
| `app/components/festivals/reservations/hold-confirmation-client.tsx` | Client         | Página de confirmación con countdown y selector de partner |
| `app/components/pages/profiles/festivals/hold-confirmation.tsx`      | Server         | Fetch de datos del hold y validación de expiración         |
| `app/hooks/use-stand-polling.ts`                                     | Hook           | Polling periódico con visibility-aware pause/resume        |
| `app/lib/stands/hold-actions.ts`                                     | Server Actions | CRUD de holds y confirmación de reserva                    |
| `app/api/stands/status/route.ts`                                     | API Route      | Endpoint lightweight de estados para polling               |
| `app/api/reservations/actions.ts`                                    | Server Actions | Gestión admin de reservas (confirmar, rechazar, eliminar)  |

---

## 8. Limitaciones y Problemas Conocidos

### Arquitectura

| #   | Problema                                                                                                                                                                                                                  | Impacto                                                                                                     | Severidad |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------- |
| 1   | **Polling HTTP en lugar de WebSockets/SSE** — El estado se obtiene cada 4s via fetch. Con muchos usuarios concurrentes, esto genera carga significativa al servidor                                                       | Escalabilidad limitada; latencia de hasta 4s para ver cambios de otros usuarios                             | Media     |
| 2   | **Cleanup de holds acoplado al endpoint de polling** — La limpieza de holds expirados se ejecuta como side-effect del GET de status, throttled a 2 min. Si nadie está haciendo polling, los holds expirados no se limpian | Holds fantasma pueden bloquear stands hasta que alguien haga polling al sector                              | Media     |
| 3   | **Throttle de cleanup basado en variable in-memory** — `lastCleanupTime` se pierde al reiniciar el servidor o con múltiples instancias (serverless)                                                                       | En entornos serverless, el throttle no funciona correctamente y el cleanup puede ejecutarse en cada request | Baja      |
| 4   | **Sin endpoint de cron dedicado para cleanup** — No existe un cron job que limpie holds expirados independientemente del polling                                                                                          | Depende del tráfico para mantener datos consistentes                                                        | Baja      |

### Seguridad

| #   | Problema                                                                                                                                   | Impacto                                                                        | Severidad |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------- |
| 5   | **Endpoint de polling sin autenticación** — `GET /api/stands/status` no requiere auth, cualquier cliente puede consultar estados de stands | Exposición mínima (solo ids y status), pero permite scraping de disponibilidad | Baja      |
| 6   | **Sin rate limiting en el endpoint de polling** — No hay limitación de tasa en el endpoint de status                                       | Un cliente malicioso podría saturar el endpoint                                | Baja      |

### UX

| #   | Problema                                                                                                                                                   | Impacto                                                   | Severidad |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------- |
| 7   | **Hold de 3 minutos es corto para decisiones complejas** — Usuarios con conexión lenta o que necesitan consultar con su partner pueden quedarse sin tiempo | Frustración del usuario; necesita reiniciar el flujo      | Baja      |
| 8   | **Sin persistencia de selección entre sesiones** — Si el usuario cierra la pestaña durante el hold, pierde la selección al volver (hold puede expirar)     | El usuario debe reiniciar el flujo si cierra el navegador | Baja      |

### Configuración

| #   | Problema                                                                                                                                         | Impacto                                                    | Severidad |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------- |
| 9   | **Valores hardcoded** — `HOLD_DURATION_MINUTES = 3`, `CLEANUP_INTERVAL_MS = 2min`, polling interval `4000ms` están hardcoded en el código fuente | Requiere deploy para cambiar cualquier parámetro de timing | Baja      |
| 10  | **Precio en moneda fija (BOB)** — El sistema asume bolivianos como moneda sin configuración                                                      | No soporta multi-moneda sin cambios de código              | Baja      |
