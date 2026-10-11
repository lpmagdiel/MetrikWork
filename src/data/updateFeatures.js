/**
 * Novedades de la app.
 *
 * Incrementa `version` en cada release para que el modal "Novedades"
 * se muestre automáticamente a los usuarios la primera vez que abran
 * la app tras el despliegue. El modal queda persistido en
 * `localStorage.lastUpdateFeaturesVersion`.
 */
export const updateData = {
    version: "1.3.0", // Actualiza este valor en cada release
    message: "MetricWork 1.3 - OCR conectado al servicio publico de inteliOCR",
    features: [
        // OCR en gastos (inteliOCR publico)
        "El OCR de gastos ahora se sirve contra el endpoint publico de `inteliOCR` (sin API key): al adjuntar un recibo, el servidor reenvia la imagen al servicio y rellena importe, fecha, proveedor, NIF/CIF, numero de factura y categoria.",
        "Se sustituyo la antigua clave OCR_API_KEY por variables de entorno sin secretos: `OCR_ENDPOINT` (URL base), `OCR_ENGINE` (`basic`, `vision` o `auto`) y `OCR_LANG` (`spa` o `eng`). Puedes cambiar de motor sin redeploy.",
        "Modo `auto` con fallback automatico a `/basic` cuando el motor de vision falla 5xx del upstream, asi no te quedas sin OCR si la IA se cae.",
        "El parsing heuristico (`receiptParser.js`, 31 tests unitarios) sigue ejecutandose en el servidor para los motores de texto crudo, manteniendo la misma extraccion de importes, fechas y NIFs.",

        // OCR en gastos (experiencia de escaneo, vigente desde 1.2)
        "Nuevo escaneo automatico de tickets al subir la imagen: se rellenan importe, fecha, proveedor, NIF/CIF, numero de factura y categoria.",
        "Indicador animado durante el escaneo: barra con efecto shimmer, texto con puntos suspensivos animados y chip del recibo pulsando.",
        "Los campos autocompletados por OCR se resaltan visualmente y llevan el sufijo '· OCR' en la etiqueta para que puedas revisarlos y corregirlos antes de guardar.",
        "Modulo de OCR cargado bajo demanda para no penalizar el bundle inicial; solo se descarga cuando abres el formulario de gastos.",

        // Reorganizacion del formulario de gastos (vigente desde 1.2)
        "El area 'Adjuntar ticket o factura' aparece como primera seccion del formulario (antes de Gasto y Proveedor) para que el OCR tenga protagonismo desde el arranque.",
        "Se elimino el boton 'Escanear' manual: el reconocimiento se ejecuta automaticamente al subir cada imagen, sin pasos extra.",
        "El formulario se reordeno en tres bloques claros: Recibo, Gasto y Proveedor, con los campos de deducible y notas en su seccion correspondiente.",

        // Empleados temporales (fantasmas) en pagos
        "Los empleados temporales (fantasmas) ya aparecen en el menu de Pagos del equipo con su avatar 👻 y la lista de masters asignados, aunque sin importe monetario (tarifa 0 por defecto).",
        "Filtro reforzado para evitar que las jornadas de un fantasma se sumen al saldo del master que lo supervisa: aunque llegasen con el mismo userId, quedan descartadas antes del calculo.",
        "Los fantasmas se muestran en los filtros 'Todos' y 'Pagados', nunca en 'No Pagados', y sus totales no contaminan el resumen 'Total a pagar' del equipo.",
        "Los reportes PDF/Excel de pagos incluyen a los fantasmas como filas informativas (horas pendientes, horas extra) con la marca 'Sin tarifa' para que el usuario distinga lo que es gasto real de lo que es solo registro de horas.",
    ]
};
