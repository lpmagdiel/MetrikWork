export const LEGAL_TERMS_VERSION = '2026-06-10';
export const LEGAL_PRIVACY_VERSION = '2026-06-10';
export const LEGAL_COOKIES_VERSION = '2026-06-10';
export const LEGAL_NOTICE_VERSION = '2026-06-10';

export const legalLinks = [
    { href: '/terms', label: 'Terminos' },
    { href: '/privacy', label: 'Privacidad' },
    { href: '/cookies', label: 'Cookies' },
    { href: '/legal', label: 'Aviso legal' }
];

const ownerPlaceholder = '[TODO: Nombre o denominacion social del titular]';
const contactPlaceholder = '[TODO: email legal/contacto]';

export const legalDocuments = {
    terms: {
        href: '/terms',
        title: 'Terminos y condiciones',
        eyebrow: 'Contrato de uso',
        version: LEGAL_TERMS_VERSION,
        summary: 'Estas condiciones regulan el acceso y uso de MetricWork como herramienta para gestionar equipos, tareas, jornadas, pagos internos, inventario, ubicaciones y comunicaciones.',
        sections: [
            {
                title: '1. Titular del servicio',
                paragraphs: [
                    `MetricWork es prestado por ${ownerPlaceholder}. Antes de publicar esta pagina deben completarse los datos reales del titular, domicilio, NIF/CIF y correo de contacto.`,
                    `Para cualquier consulta legal o incidencia relacionada con estas condiciones, el canal de contacto sera ${contactPlaceholder}.`
                ]
            },
            {
                title: '2. Uso de la cuenta',
                paragraphs: [
                    'Para usar MetricWork debes facilitar datos veraces, mantener la confidencialidad de tus credenciales y actualizar la informacion de tu perfil cuando cambie.',
                    'MetricWork no esta dirigido a menores de 16 anos. La app puede solicitar la fecha de nacimiento para comprobar esta condicion.'
                ]
            },
            {
                title: '3. Equipos, contenido y datos de trabajo',
                paragraphs: [
                    'Los administradores autorizados pueden crear equipos. Sus miembros, según los permisos asignados, pueden colaborar en tareas, jornadas, inventario, ubicaciones, pagos o cobros internos.',
                    'La persona o entidad que administra un equipo es responsable de contar con base legitima para introducir datos de sus miembros, trabajadores, colaboradores o clientes.'
                ]
            },
            {
                title: '4. Pagos internos y datos bancarios',
                paragraphs: [
                    'MetricWork permite registrar importes, pagos, cobros, IBAN u otros datos utiles para la gestion interna del equipo.',
                    'MetricWork no actua como entidad bancaria, procesador de pagos ni asesor financiero salvo que se indique expresamente mediante una integracion especifica.'
                ]
            },
            {
                title: '5. Uso permitido',
                paragraphs: [
                    'No esta permitido usar MetricWork para actividades ilicitas, vulnerar derechos de terceros, acceder a cuentas ajenas, introducir datos falsos o intentar perjudicar la seguridad o disponibilidad del servicio.',
                    'El titular podra limitar, suspender o eliminar cuentas cuando exista uso abusivo, riesgo de seguridad o incumplimiento de estas condiciones.'
                ]
            },
            {
                title: '6. Disponibilidad y responsabilidad',
                paragraphs: [
                    'MetricWork se ofrece con esfuerzos razonables de disponibilidad y seguridad, pero pueden existir interrupciones por mantenimiento, actualizaciones, proveedores externos o causas fuera de control.',
                    'El usuario debe revisar la informacion importante antes de tomar decisiones laborales, economicas o contractuales basadas en los datos introducidos en la app.'
                ]
            },
            {
                title: '7. Propiedad intelectual y cambios',
                paragraphs: [
                    'La marca, interfaz, codigo, textos y elementos visuales de MetricWork pertenecen a su titular o a sus licenciantes. El contenido introducido por usuarios sigue perteneciendo a quien corresponda.',
                    'Estas condiciones pueden actualizarse. Cuando el cambio sea relevante, se informara en la app o por medios razonables.'
                ]
            },
            {
                title: '8. Ley aplicable',
                paragraphs: [
                    'Mientras no se complete otra jurisdiccion aplicable, estas condiciones se preparan tomando como referencia normativa espanola y europea, especialmente LSSI, RGPD y LOPDGDD.'
                ]
            }
        ]
    },
    privacy: {
        href: '/privacy',
        title: 'Politica de privacidad',
        eyebrow: 'Proteccion de datos',
        version: LEGAL_PRIVACY_VERSION,
        summary: 'Esta politica explica que datos trata MetricWork, para que finalidades, con que base juridica y como pueden ejercerse los derechos de proteccion de datos.',
        sections: [
            {
                title: '1. Responsable del tratamiento',
                paragraphs: [
                    `Responsable: ${ownerPlaceholder}.`,
                    `Contacto para privacidad: ${contactPlaceholder}. Antes de publicar, deben completarse los datos identificativos reales.`
                ]
            },
            {
                title: '2. Datos tratados',
                paragraphs: [
                    'MetricWork puede tratar datos de identificacion y contacto, cuenta de autenticacion, avatar, fecha de nacimiento, telefono, direccion, IBAN, banco, equipos, permisos, tareas, jornadas, inventario, pagos, cobros, notas, chats, solicitudes, notificaciones, ubicacion GPS si se activa y datos tecnicos de uso.',
                    'Algunos datos son visibles para otros miembros o administradores del equipo cuando son necesarios para el funcionamiento colaborativo de la app.'
                ]
            },
            {
                title: '3. Finalidades',
                paragraphs: [
                    'Usamos los datos para crear y mantener la cuenta, autenticar usuarios, gestionar equipos, tareas, calendarios, pagos internos, inventario, ubicaciones, recordatorios, notificaciones y soporte.',
                    'Tambien podemos tratar datos tecnicos para seguridad, prevencion de abuso, continuidad del servicio y mejora de la app. La analitica no esencial solo se activa si el usuario la acepta.'
                ]
            },
            {
                title: '4. Base juridica',
                paragraphs: [
                    'La base principal es la ejecucion de la relacion de uso de MetricWork. Algunas preferencias, notificaciones, ubicacion y analitica se basan en el consentimiento del usuario.',
                    'Tambien puede existir interes legitimo en mantener seguridad, prevenir abuso y mejorar la estabilidad, asi como cumplimiento de obligaciones legales cuando sean aplicables.'
                ]
            },
            {
                title: '5. Proveedores y destinatarios',
                paragraphs: [
                    'MetricWork utiliza proveedores tecnicos como Firebase/Google para autenticacion, base de datos y mensajeria push; Cloudinary para imagenes; y Vercel para alojamiento, funciones serverless y medicion tecnica.',
                    'Cuando un usuario participa en un equipo, ciertos datos pueden compartirse con administradores y miembros segun permisos y finalidad de colaboracion.'
                ]
            },
            {
                title: '6. Transferencias internacionales',
                paragraphs: [
                    'Algunos proveedores pueden tratar datos fuera del Espacio Economico Europeo. En esos casos deben aplicarse garantias adecuadas, como decisiones de adecuacion, clausulas contractuales tipo u otros mecanismos reconocidos por la normativa.'
                ]
            },
            {
                title: '7. Conservacion',
                paragraphs: [
                    'Los datos se conservan mientras la cuenta este activa, mientras sean necesarios para prestar el servicio o durante los plazos exigibles por obligaciones legales, seguridad o defensa de reclamaciones.',
                    'El usuario puede solicitar eliminacion o exportacion cuando corresponda, teniendo en cuenta que algunos registros compartidos por equipos pueden requerir gestion por el administrador del equipo.'
                ]
            },
            {
                title: '8. Derechos',
                paragraphs: [
                    'Puedes solicitar acceso, rectificacion, supresion, oposicion, limitacion y portabilidad, asi como retirar consentimientos cuando el tratamiento dependa de ellos.',
                    'Tambien puedes presentar reclamacion ante la autoridad de control competente, en Espana la Agencia Espanola de Proteccion de Datos.'
                ]
            },
            {
                title: '9. Seguridad y menores',
                paragraphs: [
                    'MetricWork aplica medidas tecnicas y organizativas razonables para proteger la informacion, incluyendo reglas de acceso y separacion de datos privados.',
                    'La app no esta dirigida a menores de 16 anos y puede bloquear el uso cuando no se cumpla esta condicion.'
                ]
            }
        ]
    },
    cookies: {
        href: '/cookies',
        title: 'Politica de cookies',
        eyebrow: 'Preferencias y analitica',
        version: LEGAL_COOKIES_VERSION,
        summary: 'MetricWork usa cookies y tecnologias similares, como localStorage, para que la app funcione y para recordar preferencias. La analitica es opcional.',
        sections: [
            {
                title: '1. Que tecnologias usamos',
                paragraphs: [
                    'Ademas de cookies tradicionales, MetricWork puede usar almacenamiento local del navegador, service workers, tokens push e identificadores tecnicos necesarios para recordar preferencias o mantener funciones de la app.',
                    'Estas tecnologias pueden almacenar informacion en el dispositivo o recuperar datos ya almacenados.'
                ]
            },
            {
                title: '2. Tecnologias esenciales',
                paragraphs: [
                    'Son necesarias para autenticacion, seguridad, navegacion, preferencias de la interfaz, consentimiento legal, recuperacion de rutas, cola offline, recordatorios, equipos recientes, temporizadores activos y funciones solicitadas por el usuario.',
                    'Estas tecnologias no se pueden desactivar desde el panel de cookies porque son necesarias para prestar el servicio solicitado.'
                ]
            },
            {
                title: '3. Analitica opcional',
                paragraphs: [
                    'Si aceptas analitica, MetricWork puede cargar Vercel Speed Insights para medir rendimiento y uso tecnico agregado de la app.',
                    'Si rechazas la analitica, esta medicion no se inicializa. Si revocas el consentimiento despues de haberla aceptado, la app puede recargarse para retirar la medicion activa.'
                ]
            },
            {
                title: '4. Sin marketing por ahora',
                paragraphs: [
                    'MetricWork no usa actualmente cookies de marketing comportamental ni perfiles publicitarios dentro de esta configuracion.'
                ]
            },
            {
                title: '5. Cambiar preferencias',
                paragraphs: [
                    'Puedes cambiar tu decision desde Configuracion o desde esta pagina mediante el acceso a preferencias de cookies.',
                    'Tambien puedes borrar el almacenamiento del sitio desde tu navegador, aunque algunas funciones pueden perder preferencias locales.'
                ]
            }
        ]
    },
    legal: {
        href: '/legal',
        title: 'Aviso legal',
        eyebrow: 'Identificacion del titular',
        version: LEGAL_NOTICE_VERSION,
        summary: 'Este aviso identifica al prestador del servicio y recoge informacion basica exigida para operar MetricWork como servicio digital.',
        sections: [
            {
                title: '1. Datos identificativos',
                paragraphs: [
                    `Titular: ${ownerPlaceholder}.`,
                    'NIF/CIF: [TODO: NIF/CIF].',
                    'Domicilio: [TODO: domicilio completo].',
                    `Email de contacto: ${contactPlaceholder}.`,
                    'Datos registrales: [TODO: registro mercantil u otro registro aplicable, si procede].'
                ]
            },
            {
                title: '2. Servicio',
                paragraphs: [
                    'MetricWork es una aplicacion web para gestionar equipos, tareas, jornadas, pagos internos, inventario, ubicaciones, comunicaciones y documentos operativos.',
                    'La informacion publicada en la app tiene caracter general y no constituye asesoramiento laboral, fiscal, contable, financiero o juridico.'
                ]
            },
            {
                title: '3. Propiedad intelectual',
                paragraphs: [
                    'Los elementos de MetricWork, incluyendo interfaz, marca, textos, codigo y recursos visuales, estan protegidos por derechos de propiedad intelectual o industrial.',
                    'No se permite copiar, distribuir, transformar o explotar elementos de la app sin autorizacion, salvo usos permitidos por la ley.'
                ]
            },
            {
                title: '4. Enlaces y terceros',
                paragraphs: [
                    'MetricWork puede apoyarse en proveedores tecnicos o enlazar a servicios de terceros. El titular no controla siempre sus contenidos, disponibilidad o politicas.',
                    'El uso de proveedores externos se describe con mas detalle en la politica de privacidad y la politica de cookies.'
                ]
            },
            {
                title: '5. Comunicaciones y reclamaciones',
                paragraphs: [
                    `Para comunicaciones legales, incidencias o reclamaciones, debe usarse ${contactPlaceholder} o el canal que se indique oficialmente en la app.`,
                    'Cuando existan pagos o contratacion online, se deberan mostrar precios, impuestos, condiciones generales y confirmacion de contratacion antes de finalizar el proceso.'
                ]
            }
        ]
    }
};
