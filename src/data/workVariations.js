/**
 * Variación de jornada.
 *
 * Ajuste en horas que se aplica al salario de una jornada sin contar como
 * horas extra. Sirve para registrar que el trabajador salió antes de tiempo
 * (variación negativa) o que compensó horas por su cuenta (variación
 * positiva, sin pasar por la bolsa de horas extra).
 *
 * Ejemplo con una tarifa diaria de 80€ (jornada de 8h):
 *   - Jornada completa (80€) con variación -2h -> 80 - 2 * (80/8) = 60€.
 *   - Media jornada (40€) con variación -2h    -> 40 - 2 * (80/8) = 20€.
 *   - Jornada completa (80€) con variación +2h -> 80 + 2 * (80/8) = 100€.
 *
 * Reglas de cálculo:
 *   - El precio de la hora se deriva de la tarifa diaria del miembro
 *     (`dailyRate / 8`), que es el mismo criterio que usa el resto de la
 *     app para convertir horas en unidades de jornada.
 *   - La variación sólo afecta a la parte regular de la jornada. Las horas
 *     extra siguen cobrando `extraHourRate` y los pluses de fin de semana o
 *     festivo se calculan sobre la jornada completa.
 *   - El importe final nunca es negativo: una variación no puede generar un
 *     salario negativo para el día.
 *   - El rango permitido es de -8h a +8h (una jornada completa).
 */

export const SHIFT_VARIATION_FIELD = 'shiftVariationHours';

export const STANDARD_WORKDAY_HOURS = 8;

export const MAX_SHIFT_VARIATION_HOURS = 8;

function roundCurrency(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric * 100) / 100;
}

/**
 * Normaliza las horas de variación de jornada a un número dentro del rango
 * permitido (-8h .. +8h). Acepta valores inválidos sin lanzar excepciones.
 */
export function normalizeShiftVariationHours(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const rounded = Math.round(numeric * 100) / 100;
    return Math.min(MAX_SHIFT_VARIATION_HOURS, Math.max(-MAX_SHIFT_VARIATION_HOURS, rounded));
}

/**
 * Devuelve las horas de variación registradas en una jornada (0 si no hay).
 */
export function getShiftVariationHours(work) {
    if (!work) return 0;
    return normalizeShiftVariationHours(work[SHIFT_VARIATION_FIELD]);
}

/**
 * Precio por hora derivado de la tarifa diaria del miembro.
 */
export function getShiftVariationHourRate(dailyRate = 0) {
    const rate = Number(dailyRate) || 0;
    return rate / STANDARD_WORKDAY_HOURS;
}

/**
 * Importe (con signo) de la variación de jornada. Negativo descuenta, positivo
 * añade. El resultado se redondea a céntimos.
 */
export function computeShiftVariationAmount(hours, dailyRate = 0) {
    const normalizedHours = normalizeShiftVariationHours(hours);
    if (!normalizedHours) return 0;
    return roundCurrency(normalizedHours * getShiftVariationHourRate(dailyRate));
}

/**
 * Importe (con signo) de la variación de una jornada concreta.
 */
export function getWorkShiftVariationAmount(work, dailyRate = 0) {
    return computeShiftVariationAmount(getShiftVariationHours(work), dailyRate);
}

/**
 * Aplica la variación al importe base de la jornada sin llegar nunca a saldo
 * negativo.
 */
export function applyShiftVariationToAmount(baseAmount, variationAmount) {
    const base = Number(baseAmount) || 0;
    const variation = Number(variationAmount) || 0;
    return Math.max(0, roundCurrency(base + variation));
}

/**
 * Igual que `applyShiftVariationToAmount` pero respetando las unidades de la
 * jornada: las jornadas sin parte regular (horas extra puras) no tienen
 * importe base sobre el que aplicar la variación.
 */
export function applyShiftVariationToWorkAmount(baseAmount, variationAmount, units = 1) {
    const numericUnits = Number(units);
    if (!Number.isFinite(numericUnits) || numericUnits <= 0) return 0;
    return applyShiftVariationToAmount(baseAmount, variationAmount);
}

/**
 * Formatea las horas de variación para la interfaz: "+2h", "-2h" o "0h".
 * La unidad es configurable para poder usar "H" en las estadísticas.
 */
export function formatShiftVariationHours(hours, unit = 'h') {
    const numeric = Number(hours) || 0;
    if (!numeric) return `0${unit}`;
    const sign = numeric > 0 ? '+' : '-';
    const absolute = Math.abs(numeric);
    const formatted = Number.isInteger(absolute) ? String(absolute) : absolute.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return `${sign}${formatted}${unit}`;
}

/**
 * Tono de la variación para la interfaz: 'positive' (verde), 'negative' (rojo)
 * o 'neutral' cuando no hay variación.
 */
export function getShiftVariationTone(hours) {
    const numeric = Number(hours) || 0;
    if (numeric > 0) return 'positive';
    if (numeric < 0) return 'negative';
    return 'neutral';
}
