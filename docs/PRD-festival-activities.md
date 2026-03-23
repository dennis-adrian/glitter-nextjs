# PRD: Actividades de Festivales para Participantes

**Producto:** Glitter
**Fecha:** 2026-03-16
**Estado:** Implementado (parcialmente)
**Actividad de referencia:** Carrera de Sellos — Festival Glitter

---

## 1. Resumen

El sistema de actividades de festival permite a los organizadores definir actividades temáticas a las que los participantes del festival pueden inscribirse. Cada actividad puede tener variantes por categoría, límite de cupos, período de inscripción, **tipo de prueba de participación** (`proofType`: sin prueba, imagen, texto o ambos) con revisión por admin (`proofStatus`), y votaciones. La actividad actualmente activa en el festival Glitter es la **Carrera de Sellos** (`stamp_passport`), donde los expositores coleccionan sellos de otros stands para ganar un pin de edición especial.

---

## 2. Tipos de Actividad

| Tipo               | Descripción                                                           |
| ------------------ | --------------------------------------------------------------------- |
| `stamp_passport`   | Carrera de sellos: participantes visitan stands y recolectan sellos   |
| `sticker_print`    | Impresión de stickers: actividad con diseño y producción de stickers  |
| `best_stand`       | Mejor stand: votación para elegir el stand más destacado del festival |
| `festival_sticker` | Sticker del festival: colección o entrega de stickers temáticos       |
| `coupon_book`      | Libro de cupones: participantes coleccionan o canjean cupones         |

---

## 3. Modelo de Datos

### Entidades Principales

**`festivalActivities`** — Actividad raíz

| Campo                   | Tipo           | Descripción                                                                                                                                                 |
| ----------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | serial PK      |                                                                                                                                                             |
| `festivalId`            | FK → festivals |                                                                                                                                                             |
| `name`                  | text           | Nombre público de la actividad                                                                                                                              |
| `description`           | text?          | Descripción corta para cards                                                                                                                                |
| `type`                  | enum           | `stamp_passport`, `sticker_print`, `best_stand`, `festival_sticker`, `coupon_book`                                                                          |
| `registrationStartDate` | timestamp      | Inicio del período de inscripción                                                                                                                           |
| `registrationEndDate`   | timestamp      | Fin del período de inscripción                                                                                                                              |
| `promotionalArtUrl`     | text?          | Imagen promocional                                                                                                                                          |
| `activityPrizeUrl`      | text?          | Imagen del premio                                                                                                                                           |
| `visitorsDescription`   | text?          | Descripción para visitantes no expositores                                                                                                                  |
| `proofType`             | enum?          | **Nulo = sin prueba.** Si está definido, la actividad exige prueba según el valor (ver tabla abajo).                                                        |
| `proofUploadLimitDate`  | timestamp?     | Fecha límite para cargar o corregir la prueba. **Debe configurarse cuando `proofType` no es nulo** (el formulario admin muestra el campo solo en ese caso). |
| `allowsVoting`          | boolean        | Si tiene sistema de votación                                                                                                                                |
| `votingStartDate`       | timestamp?     | Inicio de votación                                                                                                                                          |
| `votingEndDate`         | timestamp?     | Fin de votación                                                                                                                                             |
| `accessLevel`           | enum           | `public` o `festival_participants_only`                                                                                                                     |

**Semántica de `proofType` (enum `proof_type`; en DB el enum solo define valores no nulos (`image`, `text`, `both`) — el caso "sin prueba" se representa con `proofType` nulo en la columna de la tabla `festivalActivities`):**

| Valor    | Significado    | Qué debe aportar el participante                                                                  |
| -------- | -------------- | ------------------------------------------------------------------------------------------------- |
| _(nulo)_ | Sin prueba     | No se crea flujo de prueba; inscripción no exige carga.                                           |
| `image`  | Solo imagen    | Una o más imágenes (p. ej. diseño de sello); URL en `festivalActivityParticipantProofs.imageUrl`. |
| `text`   | Solo texto     | Descripción/condiciones de promoción (`promoDescription`, `promoConditions`).                     |
| `both`   | Imagen y texto | Combinación: columnas de imagen y de texto según corresponda.                                     |

**Semántica de `proofStatus` (enum `proof_status` en `festivalActivityParticipantProofs`):**

| Valor               | Significado                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pending_review`    | Enviada por el participante; pendiente de decisión del admin (valor por defecto al crear/reenviar).                                                    |
| `approved`          | Aprobada por admin; participación confirmada respecto a la prueba.                                                                                     |
| `rejected_resubmit` | Rechazada con posibilidad de corrección; el participante puede reenviar (vuelve a `pending_review`). Requiere `adminFeedback` obligatorio al rechazar. |
| `rejected_removed`  | Rechazo definitivo: participación dada de baja (`participants.removedAt`). No puede reenviar. Requiere `adminFeedback` al rechazar.                    |

**Reglas y transiciones:**

- Solo **admin** (acción `reviewActivityParticipantProof`) puede pasar de `pending_review` a `approved`, `rejected_resubmit` o `rejected_removed`. Al rechazar (`rejected_*`), `adminFeedback` es obligatorio.
- El **participante** puede subir/actualizar prueba mientras la actividad tiene `proofType` definido, no está fuera de plazo según `proofUploadLimitDate`, y el estado no es `rejected_removed`. Cada envío (alta o reenvío tras `rejected_resubmit`) pone `proofStatus` en `pending_review` y limpia feedback previo.
- Si `proofType` es nulo, no aplica subida ni `proofStatus`.

**`festivalActivityDetails`** — Variante/cupo por categoría

| Campo                | Tipo                    | Descripción                                   |
| -------------------- | ----------------------- | --------------------------------------------- |
| `id`                 | serial PK               |                                               |
| `activityId`         | FK → festivalActivities |                                               |
| `category`           | userCategoryEnum?       | Categoría de usuario aplicable (null = todas) |
| `description`        | text?                   | Descripción de la variante                    |
| `imageUrl`           | text?                   | Imagen de la variante                         |
| `participationLimit` | int?                    | Máximo de participantes (null = ilimitado)    |

**Nota — texto de reglas y “condiciones” para el participante:** el esquema no incluye un campo JSON de requisitos. Los textos editables desde admin (`description`, `visitorsDescription`, imágenes, fechas, `proofType` / `proofUploadLimitDate`, etc.) se muestran en los componentes de cada tipo de actividad donde el flujo lo implementa (p. ej. `coupon-book-activity.tsx`, `best-stand-activity.tsx`, `festival-sticker-activity.tsx`). La Carrera de Sellos (`stamp_passport`) usa en `passport-activity.tsx` copy fijo para la narrativa y la lista numerada; el plazo de subida de prueba se puede reflejar ahí cuando existen `proofType` y `proofUploadLimitDate`.

**`festivalActivityParticipants`** — Inscripción de un usuario

| Campo       | Tipo                         | Descripción                    |
| ----------- | ---------------------------- | ------------------------------ |
| `id`        | serial PK                    |                                |
| `detailsId` | FK → festivalActivityDetails |                                |
| `userId`    | FK → users                   |                                |
| Unique      | (detailsId, userId)          | Evita inscripciones duplicadas |

**`festivalActivityParticipantProofs`** — Prueba asociada a la inscripción (una fila típica por participante)

| Campo              | Tipo                              | Descripción                                                                                                           |
| ------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `id`               | serial PK                         |                                                                                                                       |
| `participationId`  | FK → festivalActivityParticipants |                                                                                                                       |
| `imageUrl`         | text?                             | URL de imagen (obligatoria en la práctica si la actividad es `proofType` `image`; puede acompañar a texto si aplica). |
| `promoDescription` | text?                             | Texto de promoción (flujos `text` / `both`).                                                                          |
| `promoConditions`  | text?                             | Condiciones de la promoción (opcional).                                                                               |
| `proofStatus`      | enum                              | `pending_review`, `approved`, `rejected_resubmit`, `rejected_removed`.                                                |
| `adminFeedback`    | text?                             | Comentario del admin al rechazar; obligatorio en rechazos.                                                            |

**`festivalActivityVotes`** — Voto emitido

| Campo               | Tipo                               | Descripción                      |
| ------------------- | ---------------------------------- | -------------------------------- |
| `id`                | serial PK                          |                                  |
| `voterId`           | FK → users                         |                                  |
| `activityVariantId` | FK → festivalActivityDetails       |                                  |
| `votableType`       | enum                               | `participant` o `stand`          |
| `participantId`     | FK → festivalActivityParticipants? |                                  |
| `standId`           | FK → stands?                       |                                  |
| Unique              | (voterId, activityVariantId)       | Un voto por usuario por variante |

---

## 4. Historias de Usuario

### Participante

| ID    | Historia                                                                                                                                   | Criterio de aceptación                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| US-01 | Como participante con reserva confirmada, quiero ver las actividades disponibles en mi dashboard para decidir en cuáles inscribirme        | Las actividades aparecen como cards en el dashboard del participante con estado de inscripción visible                                        |
| US-02 | Como participante, quiero ver el detalle de una actividad (reglas, condiciones, premio) para entender en qué consiste antes de inscribirme | La página de actividad muestra descripción, imagen promocional, imagen del premio, condiciones, y fecha límite de inscripción                 |
| US-03 | Como participante, quiero inscribirme a una actividad dentro del período de registro habilitado                                            | El botón de inscripción está activo solo durante el período de inscripción. Muestra mensaje de apertura si es temprano, o cierre si ya expiró |
| US-04 | Como participante, quiero confirmar que leí y acepto las condiciones antes de inscribirme                                                  | Se requiere tildar un checkbox de consentimiento antes de enviar el formulario                                                                |
| US-05 | Como participante inscrito en la Carrera de Sellos, quiero subir el diseño de mi sello para confirmar mi participación                     | Puedo subir una imagen (máx. 4MB) desde el dashboard o la página de actividad. La imagen queda asociada a mi inscripción                      |
| US-06 | Como participante inscrito en una actividad con votación, quiero emitir mi voto para el mejor stand o participante                         | Puedo votar una sola vez por variante dentro del período de votación habilitado                                                               |
| US-07 | Como participante, quiero saber el estado de mi prueba o mi voto desde el dashboard                                                        | El card/UI muestra: sin prueba, en revisión (`pending_review`), aprobada, corrección solicitada, removido; y estado de voto si aplica         |

### Administrador

| ID    | Historia                                                                               | Criterio de aceptación                                                                                                                                    |
| ----- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-08 | Como admin, quiero recibir un email cuando un participante se inscribe a una actividad | Se envía email con datos del participante y la actividad al inscribirse                                                                                   |
| US-09 | Como admin, quiero poder crear y configurar actividades para un festival               | Puedo definir tipo, fechas de inscripción, límites de cupo, variantes por categoría, tipo de prueba (`proofType`) y fecha límite (`proofUploadLimitDate`) |
| US-10 | Como admin, quiero poder bypasear las restricciones de fechas para probar la actividad | Los usuarios con rol `admin` pueden inscribirse independientemente del período de inscripción                                                             |

---

## 5. Flujo de Usuario — Carrera de Sellos (stamp_passport)

```text
Dashboard del participante
  └── Card de actividad "Carrera de Sellos"
        └── [Participar] → Página de detalle de actividad
              └── Lee condiciones + tilda consentimiento
                    └── [Inscribirme] → Inscripción creada
                          └── Redirect a página de éxito
                                └── Dashboard → card muestra "Subir Diseño"
                                      └── Modal de upload de imagen del sello
                                            └── Card muestra "Participación confirmada"
```

### Estados del Card de Actividad (Dashboard)

| Estado                                  | Condición                                                                         | CTA mostrado                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| No inscrito, registro no abierto        | `now < registrationStartDate`                                                     | "Registro no disponible" (deshabilitado), fecha de apertura                                                        |
| No inscrito, registro abierto           | `registrationStartDate ≤ now ≤ registrationEndDate`                               | "Participar" → redirige a página de actividad                                                                      |
| No inscrito, registro cerrado           | `now > registrationEndDate`                                                       | "Registro no disponible" (deshabilitado), fecha de cierre                                                          |
| Inscrito, prueba pendiente / corrección | `proofType` definido y (sin fila de prueba o `proofStatus === rejected_resubmit`) | Según tipo: modal de imagen o de texto/promoción; CTA "Subir diseño" / "Cargar mi promoción" / "Editar y reenviar" |
| Inscrito, prueba en revisión            | `proofStatus === pending_review`                                                  | Mensaje "Tu información está en revisión"                                                                          |
| Inscrito, prueba aprobada               | `proofStatus === approved`                                                        | "Participación confirmada" (sin acción de prueba)                                                                  |
| Inscrito, removido                      | `proofStatus === rejected_removed`                                                | Mensaje de baja con feedback del admin                                                                             |
| Inscrito, votación pendiente            | `allowsVoting && !hasVoted`                                                       | "Votar Ahora" → redirige a página de votación                                                                      |
| Inscrito, voto emitido                  | `allowsVoting && hasVoted`                                                        | Estado confirmado con fecha límite de votación                                                                     |
| Cupos llenos                            | `participants.count >= participationLimit`                                        | "Límite de inscripciones alcanzado"                                                                                |

---

## 6. Lógica de Validación

### Inscripción (`enrollInActivity`)

1. **Categoría**: Si la variante tiene `category`, el usuario debe pertenecer a ella
2. **Duplicado**: Restricción unique en `(detailsId, userId)` — retorna error si ya inscrito
3. **Cupos**: Transacción atómica que verifica `COUNT < participationLimit` antes de insertar
4. **Tipo `sticker_print`**: Omite validación de cupos (sin límite por diseño)

### Carrera de Sellos (`enrollInBestStandActivity`)

1. Valida que el usuario tenga reserva confirmada en el festival
2. Verifica que el stand del usuario no tenga otro participante ya inscrito en la misma variante
3. Selecciona la variante (`festivalActivityDetails`) que corresponde a la categoría del usuario

### Período de registro (cliente)

- Usa Luxon para comparar `now` con `registrationStartDate` y `registrationEndDate`
- Se recalcula cada 5 segundos
- Admins bypasean esta restricción

---

## 7. Rutas del Sistema

### Participante

| Ruta                                                                        | Descripción                               |
| --------------------------------------------------------------------------- | ----------------------------------------- |
| `/profiles/[profileId]/festivals/[festivalId]/activity`                     | Dashboard de actividades del participante |
| `/profiles/[profileId]/festivals/[festivalId]/activity/[activityId]`        | Detalle de actividad + inscripción        |
| `/profiles/[profileId]/festivals/[festivalId]/activity/[activityId]/voting` | Votación                                  |
| `/profiles/[profileId]/festivals/[festivalId]/activity/enroll`              | Flujo genérico de inscripción             |
| `/profiles/[profileId]/festivals/[festivalId]/activity/enroll/success`      | Confirmación de inscripción exitosa       |

### Pública

| Ruta                                    | Descripción                   |
| --------------------------------------- | ----------------------------- |
| `/festivals/[id]/activity/[activityId]` | Vista pública de la actividad |

### Administrador

| Ruta                                                                | Descripción                                      |
| ------------------------------------------------------------------- | ------------------------------------------------ |
| `/dashboard/festivals/[id]/festival_activities`                     | Listado de actividades del festival (admin)      |
| `/dashboard/festivals/[id]/festival_activities/new`                 | Crear nueva actividad                            |
| `/dashboard/festivals/[id]/festival_activities/[activityId]/edit`   | Editar actividad existente                       |
| `/dashboard/festivals/[id]/festival_activities/[activityId]/review` | Revisión y aprobación/rechazo de pruebas (admin) |

---

## 8. Acciones del Servidor

| Acción                                   | Archivo                                   | Descripción                                       |
| ---------------------------------------- | ----------------------------------------- | ------------------------------------------------- |
| `fetchFestivalActivity`                  | `lib/festival_activites/actions.ts`       | Obtener actividad por ID                          |
| `fetchFestivalActivitiesByFestivalId`    | `lib/festivals/actions.ts`                | Listar actividades de un festival                 |
| `enrollInActivity`                       | `lib/festival_activites/actions.ts`       | Inscribir participante                            |
| `enrollInBestStandActivity`              | `lib/festival_activites/actions.ts`       | Inscribir en Mejor Stand                          |
| `addFestivalActivityParticipantProof`    | `lib/festival_activites/actions.ts`       | Subir prueba                                      |
| `deleteFestivalActivityParticipantProof` | `lib/festival_activites/actions.ts`       | Eliminar prueba                                   |
| `addFestivalActivityVote`                | `lib/festival_activites/actions.ts`       | Emitir voto                                       |
| `fetchActivityVariantVotes`              | `lib/festival_activites/actions.ts`       | Obtener votos de una variante                     |
| `reviewActivityParticipantProof`         | `lib/festival_activites/admin-actions.ts` | Aprobar o rechazar prueba de participante (admin) |
| `createFestivalActivity`                 | `lib/festival_activites/admin-actions.ts` | Crear actividad con variantes (admin)             |
| `updateFestivalActivity`                 | `lib/festival_activites/admin-actions.ts` | Actualizar actividad y variantes (admin)          |

---

## 9. Mejoras Identificadas

### 9.1 Descripción y lista de condiciones (parcialmente en código)

**Problema:** Para algunos tipos de actividad el participante necesita ver reglas claras; no siempre viven en columnas reutilizables.

**Estado actual (alineado al esquema):** No existe columna `conditions` ni payload `{ requirements: string[] }` en `festivalActivities` / `festivalActivityDetails`, y no hay helper tipo `resolveConditions()` en el código de festival activities.

- **Tipos con copy principalmente desde DB:** p. ej. `description` y `visitorsDescription` (y assets) en flujos como cuponera / mejor stand según el componente de página.
- **`stamp_passport` (Carrera de Sellos):** la narrativa y la lista numerada de condiciones en `passport-activity.tsx` son mayormente estáticas; si la actividad tiene `proofType` y `proofUploadLimitDate`, se puede mostrar el ítem de fecha límite de subida de prueba derivado de esos campos.
- **Admin:** el formulario de crear/editar actividad sigue cubriendo metadatos de la tabla (fechas, prueba, votación, variantes con cupo/categoría, textos e imágenes donde aplica), pero no una lista JSON de requisitos por actividad o variante.

**Mejora propuesta:** Si el producto necesita editar bullets de reglas sin deploy, valorar un diseño explícito (p. ej. texto enriquecido o lista en columnas dedicadas) coherente con cada tipo de actividad.

---

### 9.2 Sistema de Lista de Espera

**Implementado:** Cuando una actividad llega al límite de cupos y tiene lista de espera habilitada, se persisten entradas en `festivalActivityWaitlist` con alcance por actividad (`activityId`) y campos de orden/usuario (`userId`, `position`). La tabla también guarda el estado de invitación (`notifiedAt`, `expiresAt`, `notifiedForDetailId`) para reservar temporalmente un cupo cuando se libera una variante compatible.

**Flujo actual:** Si se libera un cupo, se notifica al primer usuario de la lista de espera de esa actividad (ordenado por `position`) y se le asigna una ventana de reclamo configurable (`waitlistWindowMinutes`, por ejemplo 24h = 1440 minutos) para confirmar su inscripción antes de expirar.

---

### 9.3 Notificaciones por Email al Participante

**Problema:** Solo los admins reciben email al producirse inscripciones. Los participantes no reciben:

- Confirmación de inscripción
- Recordatorio de subir diseño antes de `proofUploadLimitDate`
- Recordatorio de votar antes de `votingEndDate`

**Mejora propuesta:** Agregar emails transaccionales para el participante: confirmación de inscripción inmediata y recordatorios programados (ej: 48hs antes del deadline de prueba).

---

### 9.4 Aprobación de Pruebas por Administrador ✅

**Implementado:** Cada fila en `festivalActivityParticipantProofs` tiene `proofStatus` (`pending_review`, `approved`, `rejected_resubmit`, `rejected_removed`) y `adminFeedback`. Los admins usan la ruta `/review` y `reviewActivityParticipantProof`; los rechazos exigen feedback. El participante ve el estado en enroll/dashboard (p. ej. `enroll-redirect-button.tsx`).

**Posible mejora:** Export CSV de participantes/pruebas (ver 9.8).

---

### 9.5 Gestión de Pruebas desde el Dashboard

**Problema:** El participante puede subir una prueba desde el modal del dashboard, pero no puede ver, reemplazar ni eliminar las pruebas ya subidas desde esa vista. Debe navegar a la página de detalle de la actividad.

**Mejora propuesta:** El card del dashboard debería mostrar la(s) imagen(es) subidas con opción de reemplazar o eliminar, especialmente antes del `proofUploadLimitDate`.

---

### 9.6 Visibilidad del Estado de Registro en Desktop

**Problema:** El mensaje de estado del período de inscripción (ej: "El registro comenzará en...") solo es visible en móvil via tooltip en desktop. En desktop, el tooltip solo se muestra al hacer hover sobre el botón.

**Mejora propuesta:** Mostrar el mensaje de estado siempre visible debajo del botón en ambos breakpoints, no solo vía tooltip.

---

### 9.7 Página de Actividades Pública

**Problema:** La vista pública de actividades existe (`/festivals/[id]/activity/[activityId]`) pero no hay una página de listado público de todas las actividades de un festival. Los visitantes no pueden descubrir las actividades disponibles sin un link directo.

**Mejora propuesta:** Crear una página pública `/festivals/[id]/activities` que liste todas las actividades del festival con su estado (próxima, inscripciones abiertas, cerradas, en curso).

---

### 9.8 Panel Administrativo de Participantes ✅

**Implementado:** La vista de admin de cada actividad muestra el listado completo de participantes.

- Desktop: `DataTable` con columnas de índice, participante (avatar + nombre), categoría, fecha de inscripción, estado de prueba (badge), y botón para ver la imagen de prueba
- Móvil: tarjetas apiladas con la misma información, sin scroll horizontal
- Filtro por estado de prueba (incl. `proofStatus`: en revisión, aprobada, corrección solicitada, removido)
- Modal para ver la imagen de prueba (drawer en móvil, dialog en desktop)
- Componentes: `activity-participants-table.tsx`, `proof-image-modal.tsx` en `app/dashboard/festivals/[id]/festival_activities/`
- Pendiente: exportación CSV (aprobación/rechazo ya soportado; ver 9.4)

---

## 10. Restricciones y Decisiones de Diseño

- **Categoría sin variante**: Si `festivalActivityDetails.category` es `null`, la variante acepta cualquier categoría de usuario.
- **Tipo `sticker_print`**: Por diseño actual, no tiene límite de cupos y su validación de capacidad se omite en el cliente.
- **Unicidad de voto**: La restricción de base de datos garantiza un único voto por usuario por variante de actividad; no hay doble voto posible.
- **Admins sin restricción temporal**: Los administradores pueden inscribirse a cualquier actividad independientemente del período de inscripción, para pruebas.
- **Pruebas múltiples**: El sistema acepta hasta 5 imágenes por inscripción (configurable entre 1 y 10), aunque el caso de la Carrera de Sellos solo requiere 1.
