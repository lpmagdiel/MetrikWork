/**
 * Novedades de la app.
 *
 * Incrementa `version` en cada release para que el modal "Novedades"
 * se muestre automáticamente a los usuarios la primera vez que abran
 * la app tras el despliegue. El modal queda persistido en
 * `localStorage.lastUpdateFeaturesVersion`.
 */
export const updateData = {
    version: "1.6.0", // Actualiza este valor en cada release
    message: "MetricWork 1.6 - Permisos por módulo más claros: gastos con alcance propio y menú unificado",
    features: [
        // Permisos de gastos con alcance
        "Los permisos de gastos ahora distinguen entre 'Ver todos los gastos' y 'Ver gastos propios' en lugar de una única casilla 'Ver'.",
        "Sin ninguna de las dos casillas marcadas, el miembro no puede consultar el listado de gastos, aunque sí puede registrar los suyos.",
        "Con 'Ver gastos propios' el libro de gastos muestra únicamente los registros que ha creado ese miembro.",
        "Ver Estadísticas ya no da acceso al libro de gastos de todo el equipo: los gastos se rigen solo por sus propios permisos.",

        // Menú de permisos unificado
        "El menú de permisos es el mismo en Ajustes del equipo y en la ficha del equipo, e integra la visibilidad de tareas dentro de la fila 'Tareas'.",
        "La visibilidad de tareas (todas o solo las suyas) se guarda junto con el resto de permisos del miembro, con un único botón 'Guardar'.",
        "Cada módulo muestra solo las acciones que realmente se aplican: Estadísticas sin 'Eliminar' ni 'Controlar', Fantasmas con 'Crear' y 'Controlar', y así en el resto.",
        "Nadie puede modificar sus propios permisos: los decide siempre el administrador del equipo.",

        // Correcciones
        "El libro de gastos ya no avisa de errores de carga cuando falta el permiso de Pagos o de Inventario: solo se cargan las fuentes permitidas.",
        "Los permisos ya guardados se respetan: los miembros que tenían 'Ver' en gastos siguen viendo el libro completo y los que solo pueden crearlos siguen sin ver el listado.",
    ]
};
