/**
 * Novedades de la app.
 *
 * Incrementa `version` en cada release para que el modal "Novedades"
 * se muestre automáticamente a los usuarios la primera vez que abran
 * la app tras el despliegue. El modal queda persistido en
 * `localStorage.lastUpdateFeaturesVersion`.
 */
export const updateData = {
    version: "1.2.0", // Actualiza este valor en cada release
    message: "MetricWork 1.2 - OCR en gastos y empleados temporales en pagos",
    features: [
        // OCR en gastos
        "Nuevo escaneo automatico de tickets (OCR) en el formulario de gastos: al adjuntar una imagen, se lanza Tesseract.js en el navegador y se rellenan importe, fecha, proveedor, NIF/CIF, numero de factura y categoria.",
        "Indicador animado durante el escaneo: barra de progreso con efecto shimmer, texto con puntos suspensivos animados y chip del recibo pulsando para que sepas que el OCR esta trabajando.",
        "Los campos autocompletados por OCR se resaltan visualmente y llevan el sufijo '· OCR' en la etiqueta. El usuario siempre puede revisarlos y corregirlos antes de guardar.",
        "Servicio Worker (Workbox) configurado para cachear el nucleo de Tesseract y los modelos .traineddata: tras el primer escaneo el OCR funciona sin conexion.",
        "Modulo de OCR cargado bajo demanda (import dinamico) para no penalizar el bundle inicial; solo se descarga cuando el usuario abre el formulario de gastos.",
        "Parser heuristico (src/data/receiptParser.js) con 31 tests unitarios: detecta importes con coma o punto decimal, fechas en formatos DD/MM/YYYY y '15 de enero de 2026', NIF/CIF/NIE, numeros de factura y categoria por palabras clave (gasolinera, hotel, restaurante, etc).",

        // Reorganizacion del formulario de gastos
        "El area 'Adjuntar ticket o factura' ahora aparece como primera seccion del formulario (antes de Gasto y Proveedor) para que el OCR tenga protagonismo desde el arranque.",
        "Se elimino el boton 'Escanear' manual: el reconocimiento se ejecuta automaticamente al subir cada imagen, sin pasos extra para el usuario.",
        "El formulario se reordeno en tres bloques claros: Recibo, Gasto y Proveedor, con los campos de deducible y notas en su seccion correspondiente.",

        // Empleados temporales (fantasmas) en pagos
        "Los empleados temporales (fantasmas) ya aparecen en el menu de Pagos del equipo con su avatar 👻 y la lista de masters asignados, aunque sin importe monetario (tarifa 0 por defecto).",
        "Filtro reforzado para evitar que las jornadas de un fantasma se sumen al saldo del master que lo supervisa: aunque llegasen con el mismo userId, quedan descartadas antes del calculo.",
        "Los fantasmas se muestran en los filtros 'Todos' y 'Pagados', nunca en 'No Pagados', y sus totales no contaminan el resumen 'Total a pagar' del equipo.",
        "Los reportes PDF/Excel de pagos incluyen a los fantasmas como filas informativas (horas pendientes, horas extra) con la marca 'Sin tarifa' para que el usuario distinga lo que es gasto real de lo que es solo registro de horas.",
    ]
};
