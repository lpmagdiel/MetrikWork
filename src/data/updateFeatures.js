/**
 * Novedades de la app.
 *
 * Incrementa `version` en cada release para que el modal "Novedades"
 * se muestre automáticamente a los usuarios la primera vez que abran
 * la app tras el despliegue. El modal queda persistido en
 * `localStorage.lastUpdateFeaturesVersion`.
 */
export const updateData = {
    version: "1.1.0", // Actualiza este valor en cada release
    message: "MetricWork 1.1 - Creacion de equipos simplificada y sin planes",
    features: [
        "Creacion de equipos mas simple: ahora solo necesitas escribir un nombre para crear un equipo nuevo. Ya no hay que elegir plan ni capacidad al dar de alta un equipo.",
        "Eliminamos los planes G/S/M/L y los campos de facturacion (teamSize, maxMembers, billingAmountEur, billingDate) del flujo de alta. Los equipos ya no tienen limite rigido de miembros impuesto por la aplicacion.",
        "Permisos confirmados para fabiansolares719@gmail.com como administrador del sistema, junto al resto de correos administradores ya configurados.",
        "Panel de administracion (/system-admin) actualizado: la tarjeta 'Planes mensuales' desaparece y las fichas de equipo ya no muestran el plan, solo el nombre y el numero de miembros.",
        "Ajustes de equipo (/teams/:id/settings) rediseñados: se retiran las tarjetas de 'Plan actual', 'Fecha de pago' y 'Cantidad a pagar' para evitar referencias a planes que ya no se utilizan.",
        "Reglas de Firestore actualizadas: isAllowedTeamCreateShape deja de exigir campos de plan y solo valida el nombre del equipo (1-80 caracteres), el admin y los miembros. Los campos restantes son opcionales pero se siguen validando si llegan en el documento.",
        "isValidTeamSize y hasAvailableTeamMemberSlot son tolerantes con equipos sin campos de plan, evitando rechazos en equipos creados con el nuevo flujo.",
        "Helpers de teamSizes.js neutralizados para mantener la compatibilidad con vistas legacy: getTeamSizeValue/getTeamMonthlyPrice/getTeamSizeOption/getTeamMemberLimit devuelven valores neutros (sin plan, sin precio, sin limite).",
        "Cobertura de tests ampliada: nuevos tests para createTeam (nombre vacio, sin auth, no admin, fabiansolares719, sin campos de plan) y para las reglas de Firestore (no se exigen campos de plan, billingAmountEur y maxMembers son opcionales).",
        "Suite de tests al dia: 193/193 tests pasan y el build de produccion se genera sin errores ni warnings nuevos.",
    ]
};
