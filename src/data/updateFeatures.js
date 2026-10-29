/**
 * Novedades de la app.
 *
 * Incrementa `version` en cada release para que el modal "Novedades"
 * se muestre automáticamente a los usuarios la primera vez que abran
 * la app tras el despliegue. El modal queda persistido en
 * `localStorage.lastUpdateFeaturesVersion`.
 */
export const updateData = {
    version: "1.5.0", // Actualiza este valor en cada release
    message: "MetricWork 1.5 - Imágenes en las tareas y libro de gastos en Estadísticas avanzadas",
    features: [
        // Imágenes adjuntas en las tareas
        "Las tareas ya admiten hasta 5 imágenes adjuntas: sube fotos del terreno, del material o del resultado esperado sin salir del formulario.",
        "Las miniaturas aparecen en la tarjeta del kanban y se pueden ver a pantalla completa con el visor integrado (navegación con flechas y cierre con Escape).",
        "Compatibilidad con fotos HEIC del iPhone (se convierten a JPEG automáticamente) y limpieza en Cloudinary de las imágenes que se quitan de una tarea o al eliminarla.",

        // Libro de gastos en Estadísticas avanzadas
        "Nuevo panel 'Libro de gastos' en Estadísticas avanzadas: reúne en una tabla única los gastos manuales, los pagos del equipo y las entradas de inventario.",
        "El libro incluye filtros por origen, estado, categoría y búsqueda, resumen de total/pagado/pendiente/manual/automático, reparto por categoría y evolución mensual.",
        "El libro respeta el periodo, la ubicación y el miembro seleccionados en la página, y sus totales se incluyen también en la exportación a PDF y Excel.",
    ]
};
