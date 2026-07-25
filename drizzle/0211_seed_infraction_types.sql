INSERT INTO "infraction_types" ("code", "label", "description", "severity")
VALUES
  (
    'no_show',
    'Inasistencia al festival',
    'El participante no asistió a un festival para el que tenía una participación o reserva confirmada. Incluye la inasistencia total, el abandono de la participación antes del evento y las cancelaciones sin la anticipación requerida. El aviso previo y su fecha se registran por separado.',
    'high'
  ),
  (
    'schedule_noncompliance',
    'Incumplimiento de horarios',
    'Incumplimiento de los horarios establecidos para ingreso, montaje, atención al público, cierre o desmontaje. Incluye llegar tarde, no tener el stand listo al abrir, cerrar o desmontar anticipadamente, desmontar fuera del horario autorizado o dejar el stand desatendido cuando se requiere presencia.',
    'medium'
  ),
  (
    'stand_rules_violation',
    'Incumplimiento de normas del stand',
    'Incumplimiento de las reglas de ocupación, acreditación, presentación, limpieza, seguridad o uso del espacio asignado. Incluye tener más de dos personas trabajando en el stand, personas sin la credencial correspondiente, acompañantes no autorizados, compartir credenciales, exceder los límites del stand, no utilizar los elementos de presentación requeridos, dejar basura o utilizar equipos, luces o sonido no autorizados.',
    'medium'
  ),
  (
    'product_or_content_violation',
    'Productos o contenido no autorizado',
    'Exhibición, distribución o venta de productos, servicios o contenido prohibido, no declarado, no autorizado o incompatible con la categoría aprobada. Incluye productos de terceros o generados con inteligencia artificial, contenido discriminatorio o explícito presentado incorrectamente, incumplimiento de proporciones por categoría, productos de participantes inhabilitados y restricciones específicas de gastronomía.',
    'high'
  ),
  (
    'administrative_noncompliance',
    'Incumplimiento administrativo',
    'Incumplimiento de requisitos, solicitudes, documentación, plazos o instrucciones administrativas necesarias para participar. Incluye no presentar fotografías o materiales solicitados, incumplir fechas límite, proporcionar información falsa o incompleta, ignorar instrucciones expresas del personal autorizado o intentar evitar una restricción de participación.',
    'medium'
  ),
  (
    'harassment_discrimination_or_threats',
    'Acoso, discriminación o amenazas',
    'Conducta de acoso, discriminación, intimidación, amenaza o abuso hacia asistentes, participantes, personal, proveedores u organizadores, presencialmente o por medios digitales. Incluye comentarios discriminatorios, comportamiento intimidante, amenazas, abuso hacia el personal y acoso en redes sociales relacionado con el festival.',
    'critical'
  ),
  (
    'unsafe_conduct_or_prohibited_substances',
    'Conducta peligrosa o sustancias prohibidas',
    'Conducta que pone en riesgo la seguridad o integridad de otras personas. Incluye portar armas o sustancias ilegales, asistir bajo efectos del alcohol o drogas, utilizar fuego, garrafas o materiales inflamables no autorizados, manipular alimentos sin las medidas de higiene requeridas o realizar acciones violentas o físicamente peligrosas.',
    'critical'
  ),
  (
    'unauthorized_use_of_content_or_image',
    'Uso no autorizado de contenido o imagen',
    'Uso, reproducción, publicación, distribución o comercialización no autorizada del trabajo, productos, marca o imagen de otra persona. Incluye copiar o vender obras ajenas sin permiso, publicar imágenes de otros participantes sin consentimiento, utilizar propiedad intelectual de terceros sin autorización o presentar productos ajenos como propios.',
    'high'
  ),
  (
    'other_policy_violation',
    'Otro incumplimiento',
    'Incumplimiento de una regla o instrucción aplicable que no encaja razonablemente en otro tipo disponible. Debe utilizarse únicamente para situaciones excepcionales y requiere una descripción clara y específica del incidente.',
    'medium'
  )
ON CONFLICT DO NOTHING;
