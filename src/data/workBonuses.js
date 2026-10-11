/**
 * Pluses por festivo y fin de semana para los pagos del equipo.
 *
 * Los pluses viven a nivel de equipo, no de miembro: la política es la
 * misma para todos los trabajadores y se configura desde
 * `team-settings`.
 *
 * Datos persistidos (en `teams/{teamId}`):
 *
 *   workBonuses: {
 *     weekend: { enabled: true, amount: 60 },  // €/unidad de jornada
 *     holiday: { enabled: true, amount: 80 },  // €/unidad de jornada
 *   }
 *
 *   holidays: [
 *     { id: '...', date: '2026-01-01', name: 'Año Nuevo', notes: '' }
 *   ]
 *
 * Reglas de cálculo (definidas con producto):
 *   - Por defecto, los dos pluses están DESACTIVADOS y a 0€. Aunque un
 *     equipo antiguo en Firestore no tenga el campo, el normalizador
 *     rellena los defaults para que el cálculo siga siendo coherente.
 *   - El plus se suma por UNIDAD de jornada (1.0 completa, 0.5 media,
 *     variable = horas/8). Una jornada parcial en sábado cobra la
 *     mitad del plus, igual que cobra la mitad de la tarifa diaria.
 *   - El plus SOLO se aplica a la parte de la jornada. Las horas extra
 *     del mismo día siguen pagando `extraHourRate` pero no añaden
 *     plus, manteniendo el modelo simple y predecible.
 *   - Si un día es festivo (de la lista) Y fin de semana (sábado o
 *     domingo), los dos pluses se pueden sumar de forma
 *     independiente: weekend + holiday, según tenga la empresa
 *     activados.
 *   - Los importes de los pluses se redondean a céntimos en cada
 *     entrada para que la suma de las anotaciones cuadre con el
 *     total cobrado.
 */

import { getLocalWeekday } from './workLimits.js';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const WEEKEND_WEEKDAYS = Object.freeze([0, 6]); // Domingo, Sábado

export const DEFAULT_WORK_BONUSES = Object.freeze({
    weekend: { enabled: false, amount: 0 },
    holiday: { enabled: false, amount: 0 }
});

export const WORK_BONUS_TYPES = Object.freeze(['weekend', 'holiday']);

function roundCurrency(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric * 100) / 100;
}

function sanitizeAmount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    return roundCurrency(numeric);
}

/**
 * Normaliza el blob `workBonuses` de un equipo. Devuelve siempre un
 * objeto con la forma completa. Acepta entradas con campos faltantes,
 * valores negativos o tipos incorrectos sin lanzar excepciones.
 */
export function normalizeWorkBonuses(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const result = {};
    for (const type of WORK_BONUS_TYPES) {
        const entry = source[type] && typeof source[type] === 'object' ? source[type] : {};
        result[type] = {
            enabled: Boolean(entry.enabled),
            amount: sanitizeAmount(entry.amount)
        };
    }
    return result;
}

/**
 * Devuelve los pluses normalizados de un equipo. Si el equipo no
 * tiene `workBonuses` (equipos creados antes del despliegue), devuelve
 * los defaults (todos desactivados y a 0€).
 */
export function getWorkBonuses(team) {
    return normalizeWorkBonuses(team?.workBonuses);
}

export function getBonusConfig(team, type) {
    if (!WORK_BONUS_TYPES.includes(type)) {
        return { enabled: false, amount: 0 };
    }
    return getWorkBonuses(team)[type];
}

/**
 * Normaliza un festivo individual. Acepta fechas en formato ISO o
 * timestamps de Firestore y devuelve siempre `{ id, date, name, notes }`.
 */
function normalizeHoliday(raw) {
    if (!raw || typeof raw !== 'object') return null;
    let date = '';
    if (typeof raw.date === 'string' && ISO_DATE_PATTERN.test(raw.date)) {
        date = raw.date;
    } else if (raw.date?.seconds) {
        const d = new Date(raw.date.seconds * 1000);
        if (!Number.isNaN(d.getTime())) {
            date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
    } else if (raw.date?.toDate) {
        const d = raw.date.toDate();
        if (!Number.isNaN(d.getTime())) {
            date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
    }
    if (!date) return null;
    const id = String(raw.id || `holiday-${date}-${Math.random().toString(36).slice(2, 8)}`).trim();
    return {
        id,
        date,
        name: String(raw.name || '').trim().slice(0, 80),
        notes: String(raw.notes || '').trim().slice(0, 240)
    };
}

/**
 * Devuelve la lista de festivos normalizada y ordenada por fecha.
 * Tolera entradas duplicadas (mismo `date`) y datos mal formados.
 */
export function normalizeHolidays(rawList) {
    if (!Array.isArray(rawList)) return [];
    const seenDates = new Set();
    const result = [];
    for (const entry of rawList) {
        const normalized = normalizeHoliday(entry);
        if (!normalized) continue;
        if (seenDates.has(normalized.date)) continue;
        seenDates.add(normalized.date);
        result.push(normalized);
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
}

export function getTeamHolidays(team) {
    return normalizeHolidays(team?.holidays);
}

/**
 * Devuelve un `Set` con los festivos del equipo en formato ISO
 * (`YYYY-MM-DD`). Útil para comprobaciones O(1) en cálculos pesados.
 */
export function getHolidayDateSet(team) {
    const set = new Set();
    for (const holiday of getTeamHolidays(team)) {
        set.add(holiday.date);
    }
    return set;
}

export function isHolidayDate(team, date) {
    if (!team || !date || !ISO_DATE_PATTERN.test(String(date))) return false;
    return getHolidayDateSet(team).has(String(date));
}

export function isWeekendDate(date) {
    if (!date || !ISO_DATE_PATTERN.test(String(date))) return false;
    return WEEKEND_WEEKDAYS.includes(getLocalWeekday(String(date)));
}

/**
 * Genera un id estable para un festivo. Si se pasa una fecha en formato
 * ISO, el id se deriva de la propia fecha (`holiday-2026-01-01`).
 * Para ids derivados de la fecha, se garantiza que son únicos aunque
 * varios festivos caigan el mismo día (no debería ocurrir porque el
 * normalizador rechaza duplicados, pero es defensa en profundidad).
 */
export function generateHolidayId(date) {
    if (typeof date === 'string' && ISO_DATE_PATTERN.test(date)) {
        return `holiday-${date}-${Math.random().toString(36).slice(2, 6)}`;
    }
    return `holiday-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// -------------------- Cálculo del plus --------------------

/**
 * Unidades facturables del plus para una jornada. Sigue el mismo
 * modelo que la tarifa diaria: `full-day` -> 1, `half-day` -> 0.5,
 * `variable` -> horas/8. Las horas extra y las jornadas overtime puras
 * devuelven 0 (no aplican plus, solo extraHourRate).
 */
export function getBonusUnits(work) {
    if (!work) return 0;
    if (work.type === 'overtime' || work.timerMode === 'overtime') return 0;
    if (work.type === 'full-day') return 1;
    if (work.type === 'half-day') return 0.5;
    if (work.type === 'variable') {
        const hours = Math.max(0, Number(work.variableHours ?? work.durationHours) || 0);
        return hours / 8;
    }
    return 0;
}

/**
 * Devuelve los pluses aplicables a una jornada concreta, ya
 * redondeados a céntimos.
 *
 *   work       : entrada de jornada (cualquier forma compatible).
 *   bonuses    : objeto normalizado (`normalizeWorkBonuses`).
 *   holidaySet : `Set<string>` con los festivos en formato ISO. Si se
 *                omite, se considera que el día nunca es festivo.
 *
 * Devuelve un objeto `{ weekend, holiday, total }` y un array
 * `applied` con las claves que realmente han sumado algo
 * (útil para desglose en la UI).
 */
export function computeWorkBonusAmounts(work, bonuses, holidaySet = null) {
    const normalized = normalizeWorkBonuses(bonuses);
    const safeHolidaySet = holidaySet instanceof Set
        ? holidaySet
        : null;
    const date = typeof work?.date === 'string' ? work.date : '';
    const isValidDate = ISO_DATE_PATTERN.test(date);
    const weekendDay = isValidDate ? isWeekendDate(date) : false;
    const holidayDay = safeHolidaySet && isValidDate ? safeHolidaySet.has(date) : false;

    const units = getBonusUnits(work);

    const weekend = (normalized.weekend.enabled && weekendDay)
        ? roundCurrency(normalized.weekend.amount * units)
        : 0;
    const holiday = (normalized.holiday.enabled && holidayDay)
        ? roundCurrency(normalized.holiday.amount * units)
        : 0;

    const applied = [];
    if (weekend > 0) applied.push('weekend');
    if (holiday > 0) applied.push('holiday');

    return {
        weekend,
        holiday,
        total: roundCurrency(weekend + holiday),
        units: roundCurrency(units, 4),
        weekendDay,
        holidayDay,
        applied
    };
}

/**
 * Desglose completo del importe de una jornada (tarifa + extra + pluses).
 * Pensado para `applyPaymentsToWorks` y para mostrar el detalle al
 * usuario en la UI de pagos.
 */
export function computeWorkEntryAmount(work, team, { dailyRate = 0, extraHourRate = 0 } = {}) {
    const rate = Number(dailyRate) || 0;
    const extraRate = Number(extraHourRate) || 0;
    const overtimeHours = Math.max(0, Number(work?.overtimeHours) || 0);
    const units = getBonusUnits(work);
    const base = roundCurrency(units * rate);
    const overtime = roundCurrency(overtimeHours * extraRate);
    const holidaySet = getHolidayDateSet(team);
    const bonuses = computeWorkBonusAmounts(work, getWorkBonuses(team), holidaySet);
    return {
        base,
        overtime,
        bonusUnits: bonuses.units,
        weekendBonus: bonuses.weekend,
        holidayBonus: bonuses.holiday,
        bonusesTotal: bonuses.total,
        appliedBonuses: bonuses.applied,
        amount: roundCurrency(base + overtime + bonuses.total),
        weekendDay: bonuses.weekendDay,
        holidayDay: bonuses.holidayDay
    };
}

/**
 * Resume los pluses de un conjunto de jornadas (generalmente las de un
 * mismo miembro) y los agrupa por tipo. Devuelve `{ weekend, holiday,
 * total, weekendWorkDays, holidayWorkDays }` redondeado a céntimos.
 */
export function summarizeBonuses(works = [], team = null, { dailyRate = 0, extraHourRate = 0 } = {}) {
    const bonuses = getWorkBonuses(team);
    const holidaySet = getHolidayDateSet(team);
    let weekend = 0;
    let holiday = 0;
    let weekendUnits = 0;
    let holidayUnits = 0;

    for (const work of works) {
        const breakdown = computeWorkBonusAmounts(work, bonuses, holidaySet);
        weekend += breakdown.weekend;
        holiday += breakdown.holiday;
        if (breakdown.weekend > 0) weekendUnits += breakdown.units;
        if (breakdown.holiday > 0) holidayUnits += breakdown.units;
    }

    return {
        weekend: roundCurrency(weekend),
        holiday: roundCurrency(holiday),
        total: roundCurrency(weekend + holiday),
        weekendUnits: Math.round(weekendUnits * 100) / 100,
        holidayUnits: Math.round(holidayUnits * 100) / 100
    };
}
