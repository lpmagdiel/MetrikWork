/**
 * Novedades de la app.
 *
 * Incrementa `version` en cada release para que el modal "Novedades"
 * se muestre automáticamente a los usuarios la primera vez que abran
 * la app tras el despliegue. El modal queda persistido en
 * `localStorage.lastUpdateFeaturesVersion`.
 */
export const updateData = {
    version: "1.0.0", // Actualiza este valor en cada release
    message: "MetricWork 1.0 - Empresa unica con equipos de obra",
    features: [
        "Nuevo modelo de empresa: la aplicacion pasa a ser de una sola empresa constructora. Los clientes y presupuestos ya no dependen de un equipo, son globales y los comparten todos los equipos de trabajo.",
        "Modulo de Clientes (/clients) con busqueda fuzzy, validacion de email, normalizacion de telefonos y soporte para clientes activos e inactivos. Solo el administrador puede crear o modificar clientes.",
        "Modulo de Presupuestos (/budgets) ligado a clientes globales. Incluye titulo, importe, moneda, fecha de validez y motivo de rechazo. Puedes aceptar o rechazar cada presupuesto.",
        "Aceptar un presupuesto crea automaticamente un cobro en el equipo que elijas, con rollback si la operacion falla. Los presupuestos aceptados quedan ocultos en la lista principal.",
        "Nuevo selector de equipo al aceptar presupuestos: si solo tienes un equipo elegible se aplica directamente, si tienes varios aparece un picker.",
        "Equipos: nuevo campo 'activo' para distinguir obras en curso de cerradas, y campo 'oculto' para esconder proyectos finalizados sin perder datos.",
        "Lista de equipos con icono de ojo en la parte superior: muestra u oculta los equipos no visibles mediante un badge con el conteo.",
        "Buscador de clientes en el formulario de cobros (ClientPicker) con debounce, teclado completo (Enter, Arrow, Escape) y soporte para crearlos desde alli.",
        "Refactor de la arquitectura de datos: cobros siguen siendo por equipo, pero clientes y presupuestos son colecciones top-level con reglas de Firestore mas simples y seguras.",
        "Permisos: lectura de clientes y presupuestos abierta a cualquier usuario autenticado, CRUD reservado al system admin para mantener el maestro de clientes limpio y coherente.",
        "Rediseño de los flags de configuracion del equipo con cards horizontales e interruptores estilo iOS, en armonia con el resto del diseno general de la aplicacion.",
        "Suite de tests ampliada de 60 a 116 tests cubriendo normalizacion, suscripciones, validaciones, rollback transaccional y reglas de Firestore.",
    ]
};