/**
 * Novedades de la app.
 *
 * Incrementa `version` en cada release para que el modal "Novedades"
 * se muestre automáticamente a los usuarios la primera vez que abran
 * la app tras el despliegue. El modal queda persistido en
 * `localStorage.lastUpdateFeaturesVersion`.
 */
export const updateData = {
    version: "1.4.0", // Actualiza este valor en cada release
    message: "MetricWork 1.4 - Pluses de festivo y fin de semana en los pagos del equipo",
    features: [
        // Pluses de fin de semana y festivo
        "Nuevo panel de 'Pluses por jornada especial' en los Ajustes del equipo: activa un plus de fin de semana y/o de festivo y define el importe por unidad de jornada.",
        "Ambos pluses arrancan DESACTIVADOS y a 0€, asi que el comportamiento de los equipos existentes no cambia hasta que el admin los active de forma explicita.",
        "El plus se cobra por UNIDAD de jornada: completa = X €, media = X/2 €, variable = horas/8 × X €. Las horas extra del mismo dia siguen pagando la tarifa extra, sin plus encima.",
        "Lista de 'Festivos del equipo' editable desde Ajustes: añade cada festivo con fecha y nombre (Año Nuevo, Navidad, autonómicos, etc.) y se quitan con un boton. Un festivo que cae en sabado o domingo suma ambos pluses.",
        "El calculo de pagos en 'team-payments' ahora desglosa pluses pendientes y los muestra como columna en la tabla, fila desplegable en movil y linea separada en el recibo PDF.",
        "35 tests unitarios nuevos (`workBonuses.test.js`) cubren defaults, redondeo, media jornada, variable, overtime, fines de semana vs festivos y combinaciones de sabado+festivo.",

        // OCR en gastos (inteliOCR publico)
        "El OCR de gastos ahora se sirve contra el endpoint publico de `inteliOCR` (sin API key): al adjuntar un recibo, el servidor reenvia la imagen al servicio y rellena importe, fecha, proveedor, NIF/CIF, numero de factura y categoria.",
        "Se sustituyo la antigua clave OCR_API_KEY por variables de entorno sin secretos: `OCR_ENDPOINT` (URL base), `OCR_ENGINE` (`basic`, `vision` o `auto`) y `OCR_LANG` (`spa` o `eng`). Puedes cambiar de motor sin redeploy.",
        "Modo `auto` con fallback automatico a `/basic` cuando el motor de vision falla 5xx del upstream, asi no te quedas sin OCR si la IA se cae.",
        "El parsing heuristico (`receiptParser.js`, 31 tests unitarios) sigue ejecutandose en el servidor para los motores de texto crudo, manteniendo la misma extraccion de importes, fechas y NIFs.",
    ]
};
