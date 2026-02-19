# Participant Dashboard — Design Brief

**Producto:** Glitter
**Fecha:** 2026-02-17
**Estado:** En diseño
**Audiencia de este documento:** Diseñador(a) de UI/UX

---

## 1. Contexto

Los usuarios que inician sesión actualmente ven la misma página de inicio que los visitantes no registrados. Esta página está diseñada para exploración y descubrimiento, no para participantes que ya conocen la plataforma.

El **Panel del Participante** (Participant Dashboard) es la nueva página de inicio para usuarios autenticados. Aparecerá en la ruta `/me` y reflejará el estado actual del usuario con respecto a los festivales activos, sus reservas, su historial, y las acciones que necesita completar.

---

## 2. Filosofía de Diseño

El panel debe sentirse como una extensión del mundo Glitter — **no como un dashboard corporativo genérico**.

### Principios clave

- **Calor artístico por encima de utilidad fría.** Las tarjetas, fondos y secciones deben sentirse "hechas a mano". Se prefieren formas orgánicas, gradientes suaves, texturas sutiles.
- **El personaje acompaña.** Un personaje ilustrado de Glitter (ver Sección 7) aparece en estados vacíos, celebraciones y tareas pendientes. No es decoración — es el guía del usuario.
- **El festival marca el tono.** Cuando hay un festival activo o próximo, su identidad visual (banner, mascota) domina la parte superior de la página.
- **Jerarquía emocional.** Lo primero que ve el usuario debe hacerle sentir que algo emocionante está pasando, antes de mostrarle información.

---

## 3. Paleta de Colores

Basada en las variables CSS del proyecto (`app/globals.css`), con dos mejoras propuestas para `secondary` y `accent`.

### Colores base del sistema

| Nombre | Valor HSL | Hex aproximado | Uso |
|---|---|---|---|
| **Primary (Purple)** | `hsl(262, 77%, 49%)` | `#6B21E8` | Acciones principales, botones, highlights |
| **Secondary (Vivid Rose)** | `hsl(342, 85%, 62%)` ⚠️ propuesto | `#E8356A` | Elementos secundarios, badges |
| **Accent (Warm Amber)** | `hsl(40, 80%, 90%)` ⚠️ propuesto | `#FDEBBF` | Hover states, focus, feedback interactivo |
| **Festicker Pink** | `#FB0A76` | — | Festival tipo "Festicker" |
| **Background** | `hsl(0, 0%, 100%)` | `#FFFFFF` | Fondo general |
| **Foreground/Text** | `hsl(224, 100%, 17%)` | `#00145A` | Texto principal (azul oscuro) |
| **Muted** | `hsl(220, 14%, 96%)` | `#F0F1F5` | Fondos secundarios, separadores |

### Cambios propuestos (marcados con ⚠️)

Estos dos colores existen en el sistema actual pero se propone mejorarlos antes de diseñar el dashboard:

**Secondary — de Pink-Purple pálido a Vivid Rose**
- Actual: `hsl(308, 59%, 72%)` — poco saturado, se pierde fácilmente
- Propuesto: `hsl(342, 85%, 62%)` (~`#E8356A`) — mismo rango rosa/magenta pero con mucha más intensidad
- Dark mode propuesto: `hsl(342, 70%, 38%)`
- Impacto: badges y botones secundarios ganaron presencia visual

**Accent — de purple semitransparente inconsistente a Warm Amber**
- Actual light mode: `hsl(262, 76%, 90% / 30%)` — usa un hack de opacidad al 30%, casi invisible
- Actual dark mode: `hsl(338, 69%, 35%)` — hue completamente diferente al light mode (262° vs 338°)
- Propuesto light: `hsl(40, 80%, 90%)` (~`#FDEBBF`), foreground: `hsl(35, 65%, 28%)`
- Propuesto dark: `hsl(38, 55%, 22%)`
- Impacto: elimina el hack de opacidad, hace consistente la hue entre modos claro/oscuro, y crea un lenguaje visual claro — púrpura frío para acciones primarias, ámbar cálido para estados interactivos hover/focus

> **Nota para desarrollo:** estos cambios van en `app/globals.css` en las variables `--secondary`, `--secondary-foreground` y `--accent`, `--accent-foreground`. El `secondary` se usa en badges y botones secundarios; el `accent` en hover states de botones ghost, outline, dropdowns, y estados focus de selects.

### Escalas disponibles

`primary`, `secondary`, y `accent` tienen escala completa del 50 al 950 (ej. `primary-100`, `primary-200`, etc.). Úsalas para crear capas de profundidad sin salir de la paleta.

---

## 4. Tipografía

| Fuente | Uso |
|---|---|
| **Inter** (sans-serif, variable) | Cuerpo de texto, labels, datos |
| **Isidora** | Títulos expresivos, headings del dashboard |

Isidora es la fuente "festiva" — usarla en encabezados de secciones le da personalidad sin sobrecargar.

---

## 5. Estructura de la Página

La página está organizada en secciones verticales. Se presenta en orden de aparición (de arriba hacia abajo).

```
┌─────────────────────────────────────┐
│  [NavBar — existente]               │
├─────────────────────────────────────┤
│                                     │
│  SECCIÓN 1: HERO CAROUSEL           │
│  (Ancho completo, ~60vh de alto)    │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  SECCIÓN 2: PERFIL / ESTADO         │
│  (Solo visible si hay algo que      │
│   notificar, ej. perfil pendiente)  │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  SECCIÓN 3: STRIP DE ESTADÍSTICAS   │
│  (Fila horizontal compacta)         │
│                                     │
├────────────────┬────────────────────┤
│                │                    │
│  SECCIÓN 4:    │  SECCIÓN 5:        │
│  RESERVA       │  TAREAS            │
│  ACTIVA        │  PENDIENTES        │
│                │                    │
│  (columna      │  (columna          │
│  izquierda)    │  derecha)          │
│                │                    │
├────────────────┴────────────────────┤
│                                     │
│  SECCIÓN 6: ACTIVIDADES DEL         │
│  FESTIVAL (si aplica)               │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  SECCIÓN 7: HISTORIAL DE            │
│  PARTICIPACIONES                    │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  SECCIÓN 8: ACCIONES RÁPIDAS        │
│  (Fila de íconos/links)             │
│                                     │
└─────────────────────────────────────┘
```

**Nota sobre responsive:**
- En mobile, las columnas de Sección 4 y 5 se apilan verticalmente.
- El hero carousel mantiene su impacto visual en mobile (reducir altura a ~45vh).

---

## 6. Descripción Funcional por Sección

### Sección 1 — Hero Carousel (Anuncios / Festivales)

**Propósito:** Crear impacto visual inmediato y comunicar los festivales activos o próximos. Similar a cómo Netflix o Disney+ presentan contenido nuevo.

**Contenido:**
- Un slide por cada festival con estado `publicado` o `activo`
- Si hay un solo festival, no rota — muestra el slide estático

**Anatomía de cada slide:**
```
┌─────────────────────────────────────┐
│ [Imagen de banner del festival]     │
│ ████████████████████████████████   │
│ ████████████████████████████████   │
│                                     │
│  [Mascota del festival]  ╔════════╗│
│  (esquina o lateral)     ║BADGE   ║│
│                          ║Tipo    ║│
│  Nombre del Festival     ╚════════╝│
│  Fechas del festival                │
│                                     │
│  [Botón CTA contextual]             │
└─────────────────────────────────────┘
     ○ ● ○ ○   ← Indicadores de slide
```

**Lógica del CTA (el botón cambia según el estado del usuario):**

| Estado del usuario | Texto del botón |
|---|---|
| Sin reserva + registro abierto | "Reservar mi stand" |
| Con reserva pendiente o en verificación | "Ver mi reserva" |
| Con reserva aceptada | "Ver detalles del festival" |
| Día del evento + registro en el día activo | "Registrar asistencia" |
| Solo ver | "Ver más" |

**Notas de diseño:**
- El banner del festival (`festivalBannerUrl`) es la imagen de fondo
- La mascota del festival (`mascotUrl`) aparece en el slide, idealmente en pose dinámica
- Overlay oscuro/gradiente sobre la imagen para legibilidad del texto
- Auto-play suave (4–6 segundos por slide), con pausa al hover

---

### Sección 2 — Estado del Perfil

**Propósito:** Informar a usuarios nuevos o con problemas en su perfil. Invisible para usuarios verificados.

**Estados posibles:**

| Estado | Mensaje | Acción |
|---|---|---|
| `pending` | "Tu perfil está siendo revisado" | Sin acción (solo informativo) |
| `rejected` | "Tu perfil fue rechazado" + motivo | "Editar mi perfil" |
| Perfil incompleto | "Completa tu perfil para participar" | "Completar perfil" |

**Notas de diseño:**
- Componente tipo "banner" o "callout" — ancho completo, fondo suave con ícono o personaje
- El personaje acompaña según el estado (ver tabla en Sección 7)
- Cuando no hay nada que mostrar, esta sección **no existe** en el layout

---

### Sección 3 — Strip de Estadísticas

**Propósito:** Reconocimiento del histórico del participante. Motiva el regreso.

**Métricas mostradas:**
- **Festivales participados** — número de festivales en los que ha tenido una reserva aceptada
- **Badges obtenidos** — cantidad de insignias ganadas
- **Años en Glitter** — desde el primer festival hasta hoy (ej. "3 años en Glitter")

**Notas de diseño:**
- Fila horizontal de 3 items con ícono + número + etiqueta
- Fondo diferenciado (puede ser `primary-50` o un gradiente suave)
- Si el usuario es nuevo y todos los valores son 0, mostrar el strip con "0" de todas formas (es un punto de partida)
- Tamaño compacto — no debe robar protagonismo

---

### Sección 4 — Reserva Activa

**Propósito:** El usuario ve de un vistazo el estado de su participación en el festival más próximo o activo.

**Estado A — Tiene reserva:**
```
┌─────────────────────────────────┐
│  [Mascota del festival]         │
│                                 │
│  Glitter VII                    │
│  15 y 16 de marzo               │
│                                 │
│  Stand A-12 · Sector Norte      │
│  ● Reserva aceptada             │
│                                 │
│  [Ver reserva]  [Ver mapa]      │
└─────────────────────────────────┘
```

**Estado B — Sin reserva, registro abierto:**
```
┌─────────────────────────────────┐
│  [Personaje emocionado]         │
│                                 │
│  ¡El festival se acerca!        │
│  Glitter VII · 15 y 16 de marzo │
│                                 │
│  Todavía hay stands disponibles │
│                                 │
│  [Reservar mi stand]            │
└─────────────────────────────────┘
```

**Badges de estado de la reserva:**

| Estado | Color | Etiqueta |
|---|---|---|
| `pending` | Amarillo/Naranja | "Pendiente" |
| `verification_payment` | Azul | "Verificando pago" |
| `accepted` | Verde | "Aceptada" |
| `rejected` | Rojo | "Rechazada" |

**Notas de diseño:**
- Tarjeta con prominencia visual alta — la segunda cosa más importante después del carousel
- Cuando hay reserva, mostrar la mascota del festival activo en la tarjeta
- Cuando no hay reserva, usar el personaje del dashboard (Sección 7 — pose "Excited")

---

### Sección 5 — Tareas Pendientes

**Propósito:** Lista priorizada de acciones que el usuario necesita completar. Se actualiza automáticamente según los datos del sistema.

**Tipos de tarea y su origen:**

| Tarea | Condición que la genera | Enlace |
|---|---|---|
| Subir comprobante de pago | Reserva en estado `verification_payment` | Página de reserva |
| Completar perfil | Perfil `pending` o campos faltantes | `/my_profile` |
| Subir fotos de productos | Actividad de festival con `requiresProof` activo y dentro de plazo | Página de actividad |
| Votar por el mejor stand | Votación abierta y el usuario no ha votado | Página de votación |
| Volver a enviar productos rechazados | `participant_products` con estado `rejected` | Página de actividad |
| Registrarte el día del evento | `eventDayRegistration` activo y es hoy | Página del festival |

**Estado vacío:** "¡Estás al día!" + personaje celebrando (ver Sección 7 — pose "Celebrating")

**Anatomía de cada ítem de tarea:**
```
┌─────────────────────────────────┐
│ ⚠ [Ícono]  Subir comprobante   │
│            de pago              │
│                                 │
│            Vence el viernes 20  │
│            [Ir →]               │
└─────────────────────────────────┘
```

**Notas de diseño:**
- Urgencia visual diferenciada (tareas con fecha límite próxima pueden tener un acento de color más cálido)
- Máximo ~4-5 tareas visibles. Si hay más, "Ver todas"
- Iconografía clara y consistente por tipo de tarea

---

### Sección 6 — Actividades del Festival

**Propósito:** Visibilidad de las actividades activas del festival en el que participa el usuario (votaciones, stamp passport, sticker print).

**Solo visible si:** El usuario tiene una reserva aceptada en un festival activo, y ese festival tiene actividades en curso.

**Contenido:**
- Una tarjeta por actividad activa
- Título de la actividad, descripción breve, fecha límite si aplica
- Botón de acción contextual

**Notas de diseño:**
- Tarjetas más pequeñas que la reserva principal
- Usar iconografía asociada al tipo de actividad (estrella para votar, sello para stamp, etc.)

---

### Sección 7 — Historial de Participaciones

**Propósito:** Mirada atrás. El usuario ve en qué festivales participó.

**Contenido por ítem:**
- Nombre del festival
- Tipo de festival (Glitter, Twinkler, Festicker) — con color/badge correspondiente
- Fechas
- Número de stand

**Notas de diseño:**
- Lista o grilla de tarjetas compactas, máximo 3-4 visibles
- Botón "Ver historial completo" al final (lleva a `/my_history`)
- Estado vacío (sin historial): personaje curioso + "¡Tu primer festival te espera!"
- Los colores de los badges de tipo de festival deben ser consistentes en toda la app:
  - Glitter → `primary` (purple)
  - Twinkler → `secondary` (pink-purple)
  - Festicker → `#FB0A76` (festicker pink)

---

### Sección 8 — Acciones Rápidas

**Propósito:** Acceso rápido a las secciones más usadas. Reduce la fricción.

**Items del panel:**

| Ícono | Etiqueta | Destino | Condición |
|---|---|---|---|
| Persona | Mi perfil público | `/public_profiles/[id]` | Siempre |
| Estrella | Mis participaciones | `/my_participations` | Siempre |
| Reloj | Mi historial | `/my_history` | Siempre |
| Bolsa | Tienda | `/store` | Solo si perfil verificado |
| Caja | Mis órdenes | `/my_orders` | Siempre |

**Notas de diseño:**
- Fila horizontal de íconos con etiqueta debajo
- Estilo pill o cuadrado redondeado con fondo `accent` o `primary-50`
- En mobile, puede hacer scroll horizontal

---

## 7. Ilustraciones del Personaje Acompañante

### Concepto

Para que el personaje funcione durante todo el año (no solo cuando hay un festival activo con su propia mascota), se recomienda crear un **personaje exclusivo del dashboard de Glitter** — independiente de los personajes de cada festival.

Los personajes de los festivales (`mascotUrl`) siguen apareciendo en el hero carousel y en la tarjeta de reserva activa. El personaje del dashboard aparece en estados vacíos, tareas y estados emocionales.

### Poses requeridas

| # | Nombre | Dónde aparece | Descripción |
|---|---|---|---|
| 1 | **Bienvenida / Saludando** | Dashboard cuando no hay festival activo | Personaje saludando con la mano, amigable e invitante |
| 2 | **Emocionado / Anunciando** | Hero carousel — nuevo festival anunciado | Personaje saltando o señalando algo fuera de cuadro — energía "¡hay algo nuevo!" |
| 3 | **Esperando / Esperanzado** | Reserva pendiente / perfil en revisión | Personaje sentado pacientemente, dedos cruzados, expectante |
| 4 | **Celebrando / Saltando** | Reserva aceptada / tareas al día ("¡Estás al día!") | Personaje en el aire, brazos arriba, confeti alrededor |
| 5 | **Señalando / Urgente** | Tarea pendiente con fecha límite | Personaje señalando algo fuera de cuadro con urgencia juguetona |
| 6 | **Triste pero alentando** | Perfil rechazado | Personaje con expresión baja pero sonrisa alentadora — "no te rindas" |
| 7 | **Curioso / Vacío** | Sin historial / usuario nuevo | Personaje asomándose por una esquina o mirando un espacio vacío con asombro |
| 8 | **Orgulloso / Trofeo** | Sección de estadísticas con participaciones | Personaje sosteniendo un trofeo o medalla pequeña, satisfecho |
| 9 | **Votando / Emocionado** | Votación del festival abierta | Personaje con una estrella o levantando la mano para votar |
| 10 | **Leyendo / Estudiando** | Instrucciones de pago visibles | Personaje sosteniendo un papel o recibo, concentrado y servicial |

### Especificaciones técnicas

- **Fondo:** Transparente (PNG o SVG)
- **Tamaño mínimo:** 400×400 px
- **Estilo:** Ilustrado a mano — no vectores planos. Textura, calidez y expresividad son clave.
- **Consistencia:** Todas las poses comparten las mismas proporciones, paleta y estilo base
- **Paleta del personaje:** Libre, pero debe complementar los colores del sistema (purple + pink + rose)
- **Exportación:** Cada pose como archivo independiente, nombrado con el identificador de la pose (ej. `companion-celebrating.png`, `companion-waving.png`)

---

## 8. Estados de Usuario y Flujos

### Usuario verificado con reserva aceptada

```
Hero Carousel → [Festival activo con su banner y mascota]
                [CTA: "Ver detalles del festival"]

Reserva Activa → Stand A-12 · Sector Norte · ✓ Aceptada

Tareas → (vacío si todo está en orden) "¡Estás al día!" + personaje celebrando

Historial → Festivales pasados con reservas
```

### Usuario verificado sin reserva, con festival próximo

```
Hero Carousel → [Festival próximo]
                [CTA: "Reservar mi stand"]

Reserva Activa → [Personaje emocionado] "¡El festival se acerca! Reserva tu stand"

Tareas → (posiblemente vacío si no hay otras tareas)

Historial → Festivales pasados
```

### Usuario nuevo / sin verificar

```
Estado del Perfil → "Completa tu perfil para participar en festivales"

Hero Carousel → [Si hay festival publicado, aún se muestra]
                [CTA: "Ver más" — sin opción de reservar]

Reserva → No aplica (no puede reservar sin verificación)
```

### Usuario con pago pendiente de subir

```
Reserva Activa → Stand A-12 · "Verificando pago"

Tareas → ⚠ "Subir comprobante de pago" [Ir →]
```

---

## 9. Preguntas Abiertas para el Equipo

1. **Personaje del dashboard:** ¿Creamos un personaje propio de Glitter (recomendado), o usamos la mascota del festival activo con poses adicionales? El enfoque propio da más consistencia pero requiere más trabajo inicial.

2. **Tipografía Isidora:** ¿Está licenciada para uso en web? Confirmar antes de usarla en los encabezados del dashboard.

3. **Dark mode:** El sistema tiene variables de dark mode. ¿El dashboard las soporta desde el inicio, o solo light mode por ahora?

4. **Animaciones:** ¿Cuánto movimiento queremos? El carousel tendrá transiciones. ¿Los estados de tareas tendrán micro-animaciones (ej. check al completar)?
