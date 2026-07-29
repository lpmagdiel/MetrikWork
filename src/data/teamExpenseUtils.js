export const EXPENSE_SOURCES = ['manual', 'payment', 'inventory'];
export const EXPENSE_STATUSES = ['paid', 'pending'];
export const EXPENSE_METHODS = [
    'cash',
    'transfer',
    'card',
    'bizum',
    'direct_debit',
    'other'
];

export const EXPENSE_CATEGORIES = [
    { value: 'supplies', label: 'Materiales y suministros' },
    { value: 'transport', label: 'Transporte y combustible' },
    { value: 'food', label: 'Dietas y alimentación' },
    { value: 'lodging', label: 'Alojamiento' },
    { value: 'rent', label: 'Alquiler' },
    { value: 'utilities', label: 'Servicios' },
    { value: 'taxes', label: 'Impuestos y tasas' },
    { value: 'tools', label: 'Herramientas' },
    { value: 'maintenance', label: 'Mantenimiento' },
    { value: 'insurance', label: 'Seguros' },
    { value: 'professional', label: 'Servicios profesionales' },
    { value: 'other', label: 'Otros' }
];

const CATEGORY_LABELS = Object.fromEntries(EXPENSE_CATEGORIES.map((item) => [item.value, item.label]));

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function normalizeText(value, maxLength = 500) {
    return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeCurrency(value, fallback = 'EUR') {
    const currency = normalizeText(value || fallback, 3).toUpperCase();
    return /^[A-Z]{3}$/.test(currency) ? currency : fallback;
}

export function roundExpenseAmount(value) {
    let normalized = value;
    if (typeof value === 'string') {
        normalized = value.trim().replace(/\s/g, '');
        if (normalized.includes(',') && normalized.includes('.')) {
            normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
                ? normalized.replace(/\./g, '').replace(',', '.')
                : normalized.replace(/,/g, '');
        } else if (normalized.includes(',')) {
            normalized = normalized.replace(',', '.');
        }
    }
    const amount = Number(normalized);
    if (!Number.isFinite(amount)) return 0;
    return Math.round(Math.max(0, amount) * 100) / 100;
}

export function getExpenseDateKey(value) {
    if (!value) return '';
    if (typeof value === 'string') {
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            return isRealDate(Number(match[1]), Number(match[2]), Number(match[3]))
                ? `${match[1]}-${match[2]}-${match[3]}`
                : '';
        }
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function isRealDate(year, month, day) {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isValidDateInput(value) {
    return typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        getExpenseDateKey(value) === value;
}

export function getExpenseCategoryLabel(category, fallback = 'Otros') {
    return CATEGORY_LABELS[category] || normalizeText(category, 80) || fallback;
}

export function validateManualExpenseInput(input = {}) {
    const title = normalizeText(input.title, 120);
    const amount = roundExpenseAmount(input.amount);
    const date = isValidDateInput(input.date) ? input.date : '';
    const dueDate = input.dueDate && isValidDateInput(input.dueDate) ? input.dueDate : '';
    const status = EXPENSE_STATUSES.includes(input.status) ? input.status : 'paid';

    if (!title) return 'Escribe el concepto del gasto.';
    if (amount <= 0) return 'El importe debe ser mayor que cero.';
    if (amount > 1000000000) return 'El importe supera el límite permitido.';
    if (!date) return 'Selecciona una fecha válida.';
    if (input.dueDate && !dueDate) return 'La fecha de vencimiento no es válida.';
    if (status === 'pending' && dueDate && dueDate < date) {
        return 'El vencimiento no puede ser anterior a la fecha del gasto.';
    }
    return '';
}

export function normalizeExpenseReceipts(receipts) {
    if (!Array.isArray(receipts)) return [];
    return receipts
        .filter((receipt) => receipt && typeof receipt.url === 'string' && receipt.url)
        .slice(0, 10)
        .map((receipt) => ({
            url: String(receipt.url).slice(0, 600),
            name: normalizeText(receipt.name, 160) || 'Recibo'
        }));
}

export function normalizeManualExpenseInput(input = {}, options = {}) {
    const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    const today = getExpenseDateKey(now);
    const category = CATEGORY_LABELS[input.category] ? input.category : 'other';
    const status = EXPENSE_STATUSES.includes(input.status) ? input.status : 'paid';
    const method = EXPENSE_METHODS.includes(input.method) ? input.method : 'other';
    const currency = normalizeCurrency(input.currency || options.currency || 'EUR');
    const date = getExpenseDateKey(input.date) || today;
    const dueDate = input.dueDate ? getExpenseDateKey(input.dueDate) : '';

    return {
        source: 'manual',
        title: normalizeText(input.title, 120),
        description: normalizeText(input.description, 600),
        category,
        categoryLabel: getExpenseCategoryLabel(category),
        amount: roundExpenseAmount(input.amount),
        currency,
        status,
        method,
        date,
        dueDate,
        paidAt: status === 'paid' ? getExpenseDateKey(input.paidAt) || date : '',
        vendorName: normalizeText(input.vendorName, 120),
        vendorTaxId: normalizeText(input.vendorTaxId, 40),
        invoiceNumber: normalizeText(input.invoiceNumber, 80),
        locationId: normalizeText(input.locationId, 120),
        locationName: normalizeText(input.locationName, 120),
        deductible: input.deductible !== false,
        notes: normalizeText(input.notes, 1000),
        receipts: normalizeExpenseReceipts(input.receipts)
    };
}

function mapManualExpense(expense = {}, currency = 'EUR') {
    const normalized = normalizeManualExpenseInput(expense, {
        currency: expense.currency || currency,
        now: expense.date || expense.createdAt || Date.now()
    });
    return {
        ...expense,
        ...normalized,
        id: expense.id || '',
        source: 'manual',
        sourceLabel: 'Manual',
        editable: true,
        date: getExpenseDateKey(expense.date || expense.createdAt),
        createdAt: expense.createdAt || '',
        updatedAt: expense.updatedAt || '',
        receipts: normalizeExpenseReceipts(expense.receipts)
    };
}

function mapPaymentExpense(payment = {}, context = {}) {
    const amount = roundExpenseAmount(payment.amount);
    if (amount <= 0) return null;
    const member = context.memberMap?.get(payment.userId);
    const memberName = member?.name || member?.email || 'Miembro del equipo';
    const typeLabel = payment.type === 'partial' ? 'Pago parcial' : 'Pago total';

    return {
        id: `payment:${payment.id || `${payment.userId || 'member'}:${payment.date || payment.createdAt || ''}`}`,
        sourceId: payment.id || '',
        source: 'payment',
        sourceLabel: 'Pago automático',
        editable: false,
        title: `Pago a ${memberName}`,
        description: `${typeLabel} registrado desde el módulo Pagos`,
        category: 'payroll',
        categoryLabel: 'Nómina y personal',
        amount,
        currency: normalizeCurrency(payment.currency, normalizeCurrency(context.currency)),
        status: 'paid',
        method: EXPENSE_METHODS.includes(payment.method) ? payment.method : 'other',
        date: getExpenseDateKey(payment.date || payment.createdAt),
        dueDate: '',
        paidAt: getExpenseDateKey(payment.date || payment.createdAt),
        vendorName: memberName,
        vendorTaxId: '',
        invoiceNumber: '',
        locationId: normalizeText(payment.locationId, 120),
        locationName: normalizeText(payment.locationName, 120),
        deductible: true,
        notes: '',
        memberId: payment.userId || '',
        createdBy: payment.registeredBy || '',
        createdByName: payment.registeredByName || '',
        createdAt: payment.createdAt || payment.date || ''
    };
}

function mapInventoryExpense(movement = {}, context = {}) {
    if (!['created', 'stock-in'].includes(movement.action)) return null;
    const quantity = Math.max(0, Number(movement.quantityDelta ?? movement.quantityAfter) || 0);
    const unitPrice = roundExpenseAmount(movement.priceAfter);
    const amount = roundExpenseAmount(quantity * unitPrice);
    if (quantity <= 0 || amount <= 0) return null;

    const categoryLabel = normalizeText(movement.categoryAfter, 80) || 'Inventario';
    const categoryKey = normalizeSearchText(categoryLabel).replace(/[^a-z0-9]+/g, '-');
    return {
        id: `inventory:${movement.id || `${movement.productId || 'item'}:${movement.createdAt || ''}`}`,
        sourceId: movement.id || '',
        source: 'inventory',
        sourceLabel: 'Inventario automático',
        editable: false,
        title: movement.action === 'created'
            ? `Alta de ${movement.productName || 'producto'}`
            : `Entrada de ${movement.productName || 'producto'}`,
        description: `${quantity} ud. × ${unitPrice}`,
        category: `inventory:${categoryKey || 'general'}`,
        categoryLabel,
        amount,
        currency: normalizeCurrency(movement.currency, normalizeCurrency(context.currency)),
        status: 'paid',
        method: 'other',
        date: getExpenseDateKey(movement.createdAt),
        dueDate: '',
        paidAt: getExpenseDateKey(movement.createdAt),
        vendorName: '',
        vendorTaxId: '',
        invoiceNumber: '',
        locationId: normalizeText(movement.locationId, 120),
        locationName: normalizeText(movement.locationName || movement.locationAfter, 120),
        deductible: true,
        notes: '',
        quantity,
        unitPrice,
        createdBy: movement.actorId || '',
        createdByName: movement.actorName || '',
        createdAt: movement.createdAt || ''
    };
}

export function buildExpenseLedger({ manual = [], payments = [], inventoryMovements = [], members = [], currency = 'EUR' } = {}) {
    const memberMap = new Map(
        (Array.isArray(members) ? members : [])
            .filter((member) => member?.id)
            .map((member) => [member.id, member])
    );
    const context = { memberMap, currency };
    const ledger = [
        ...(Array.isArray(manual) ? manual : []).map((expense) => mapManualExpense(expense, currency)),
        ...(Array.isArray(payments) ? payments : []).map((payment) => mapPaymentExpense(payment, context)),
        ...(Array.isArray(inventoryMovements) ? inventoryMovements : [])
            .map((movement) => mapInventoryExpense(movement, context))
    ].filter((expense) => expense && expense.date && expense.amount > 0);

    return ledger.sort((a, b) => {
        const dateCompare = (b.date || '').localeCompare(a.date || '');
        if (dateCompare) return dateCompare;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
}

export function filterExpenseLedger(expenses = [], filters = {}) {
    const search = normalizeSearchText(filters.search);
    const hasInvalidRange = filters.startDate && filters.endDate && filters.startDate > filters.endDate;
    if (hasInvalidRange) return [];
    return (Array.isArray(expenses) ? expenses : []).filter((expense) => {
        if (filters.source && filters.source !== 'all' && expense.source !== filters.source) return false;
        if (filters.status && filters.status !== 'all' && expense.status !== filters.status) return false;
        if (filters.category && filters.category !== 'all' && expense.category !== filters.category) return false;
        if (filters.startDate && expense.date < filters.startDate) return false;
        if (filters.endDate && expense.date > filters.endDate) return false;
        if (!search) return true;

        const haystack = normalizeSearchText([
            expense.title,
            expense.description,
            expense.categoryLabel,
            expense.vendorName,
            expense.invoiceNumber,
            expense.locationName,
            expense.createdByName,
            Array.isArray(expense.receipts) ? expense.receipts.map((receipt) => receipt.name).join(' ') : ''
        ].filter(Boolean).join(' '));
        return haystack.includes(search);
    });
}

export function summarizeExpenseLedger(expenses = []) {
    return (Array.isArray(expenses) ? expenses : []).reduce((summary, expense) => {
        const amount = roundExpenseAmount(expense.amount);
        summary.total += amount;
        summary.count += 1;
        if (expense.status === 'pending') summary.pending += amount;
        else summary.paid += amount;
        if (expense.source === 'manual') summary.manual += amount;
        else summary.automatic += amount;
        return summary;
    }, { total: 0, paid: 0, pending: 0, automatic: 0, manual: 0, count: 0 });
}
