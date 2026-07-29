import { describe, expect, it } from 'vitest';
import {
  buildExpenseLedger,
  filterExpenseLedger,
  getExpenseDateKey,
  normalizeManualExpenseInput,
  roundExpenseAmount,
  summarizeExpenseLedger,
  validateManualExpenseInput
} from './teamExpenseUtils.js';

describe('team expense ledger', () => {
  it('normaliza importes, fechas y campos manuales', () => {
    expect(roundExpenseAmount('12,345')).toBe(12.35);
    expect(roundExpenseAmount('1.234,56')).toBe(1234.56);
    expect(roundExpenseAmount('1,234.56')).toBe(1234.56);
    expect(roundExpenseAmount('-3')).toBe(0);
    expect(getExpenseDateKey('2026-02-29')).toBe('');
    expect(getExpenseDateKey('2026-02-28T20:10:00.000Z')).toBe('2026-02-28');

    expect(normalizeManualExpenseInput({
      title: '  Gasolina  ',
      amount: '40,5',
      date: '2026-07-02',
      category: 'transport',
      status: 'paid',
      method: 'card'
    }, { currency: 'eur' })).toEqual(expect.objectContaining({
      title: 'Gasolina',
      amount: 40.5,
      date: '2026-07-02',
      category: 'transport',
      currency: 'EUR',
      paidAt: '2026-07-02'
    }));
  });

  it('rechaza entradas manuales imposibles o inconsistentes', () => {
    expect(validateManualExpenseInput({ amount: 10, date: '2026-07-01' })).toMatch(/concepto/i);
    expect(validateManualExpenseInput({ title: 'X', amount: 0, date: '2026-07-01' })).toMatch(/mayor/i);
    expect(validateManualExpenseInput({ title: 'X', amount: 10, date: '2026-02-30' })).toMatch(/fecha/i);
    expect(validateManualExpenseInput({ title: 'X', amount: 10, date: '2026-02' })).toMatch(/fecha/i);
    expect(validateManualExpenseInput({
      title: 'X',
      amount: 10,
      date: '2026-07-10',
      dueDate: '2026-07-09',
      status: 'pending'
    })).toMatch(/anterior/i);
  });

  it('combina manuales, pagos e inventario sin contar salidas o ediciones de stock', () => {
    const ledger = buildExpenseLedger({
      currency: 'EUR',
      members: [{ id: 'u1', name: 'Ana' }],
      manual: [{
        id: 'm1', title: 'Peaje', amount: 8, date: '2026-07-01',
        category: 'transport', status: 'paid', method: 'card'
      }],
      payments: [{ id: 'p1', userId: 'u1', amount: 100, date: '2026-07-03', method: 'transfer' }],
      inventoryMovements: [
        { id: 'i1', action: 'created', productName: 'Cable', quantityAfter: 3, priceAfter: 4, createdAt: '2026-07-02T10:00:00Z' },
        { id: 'i2', action: 'stock-in', productName: 'Tornillo', quantityDelta: 10, priceAfter: 0.5, createdAt: '2026-07-01T10:00:00Z' },
        { id: 'i3', action: 'stock-out', quantityDelta: -2, priceAfter: 5, createdAt: '2026-07-03T10:00:00Z' },
        { id: 'i4', action: 'updated', quantityDelta: 0, priceAfter: 99, createdAt: '2026-07-03T10:00:00Z' }
      ]
    });

    expect(ledger).toHaveLength(4);
    expect(ledger[0]).toEqual(expect.objectContaining({
      source: 'payment', title: 'Pago a Ana', amount: 100
    }));
    expect(ledger.find((item) => item.id === 'inventory:i1')?.amount).toBe(12);
    expect(ledger.find((item) => item.id === 'inventory:i2')?.amount).toBe(5);
    expect(ledger.find((item) => item.id === 'inventory:i1')?.category).toBe('inventory:inventario');
    expect(ledger.some((item) => item.id === 'inventory:i3')).toBe(false);
  });

  it('filtra por periodo, fuente, estado y texto sin depender de tildes', () => {
    const expenses = [
      { source: 'manual', status: 'pending', category: 'food', date: '2026-07-02', title: 'Alimentación', amount: 20 },
      { source: 'payment', status: 'paid', category: 'payroll', date: '2026-06-30', title: 'Pago a Ana', amount: 100 }
    ];

    expect(filterExpenseLedger(expenses, {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      source: 'manual',
      status: 'pending',
      search: 'alimentacion'
    })).toHaveLength(1);
    expect(filterExpenseLedger(expenses, {
      startDate: '2026-07-31',
      endDate: '2026-07-01'
    })).toEqual([]);
  });

  it('resume los importes pagados, pendientes, manuales y automáticos una sola vez', () => {
    expect(summarizeExpenseLedger([
      { amount: 100, status: 'paid', source: 'payment' },
      { amount: 25, status: 'paid', source: 'manual' },
      { amount: 10, status: 'pending', source: 'manual' }
    ])).toEqual({
      total: 135,
      paid: 125,
      pending: 10,
      automatic: 100,
      manual: 35,
      count: 3
    });
  });

  it('normaliza y limita los recibos adjuntos al guardar gastos manuales', () => {
    const longName = 'x'.repeat(300);
    const receipts = [
      { url: 'https://res.cloudinary.com/demo/image/upload/ticket-1.jpg', name: 'ticket-1.jpg' },
      { url: 'https://res.cloudinary.com/demo/image/upload/factura.pdf', name: longName },
      { url: '', name: 'invalido' },
      null,
      { url: 'sin-nombre' },
      { name: 'sin-url' }
    ];

    const normalized = normalizeManualExpenseInput({
      title: 'Comida',
      amount: 25,
      date: '2026-07-02',
      receipts
    });

    expect(normalized.receipts).toHaveLength(3);
    expect(normalized.receipts[0]).toEqual({
      url: 'https://res.cloudinary.com/demo/image/upload/ticket-1.jpg',
      name: 'ticket-1.jpg'
    });
    expect(normalized.receipts[1].name.length).toBe(160);
    expect(normalized.receipts[2]).toEqual({ url: 'sin-nombre', name: 'Recibo' });
  });

  it('incluye los recibos al construir el libro de gastos manuales', () => {
    const ledger = buildExpenseLedger({
      currency: 'EUR',
      manual: [{
        id: 'm1',
        title: 'Peaje',
        amount: 8,
        date: '2026-07-01',
        category: 'transport',
        status: 'paid',
        method: 'card',
        receipts: [
          { url: 'https://res.cloudinary.com/demo/image/upload/peaje.jpg', name: 'peaje.jpg' }
        ]
      }],
      payments: [],
      inventoryMovements: []
    });

    expect(ledger[0].receipts).toEqual([
      { url: 'https://res.cloudinary.com/demo/image/upload/peaje.jpg', name: 'peaje.jpg' }
    ]);
  });

  it('encuentra gastos por el nombre de un recibo adjunto', () => {
    const expenses = [
      {
        source: 'manual',
        status: 'paid',
        category: 'food',
        date: '2026-07-02',
        title: 'Comida cliente',
        amount: 20,
        receipts: [{ url: 'https://res.cloudinary.com/demo/image/upload/ticket-123.jpg', name: 'ticket-123.jpg' }]
      }
    ];

    expect(filterExpenseLedger(expenses, { search: 'ticket-123' })).toHaveLength(1);
    expect(filterExpenseLedger(expenses, { search: 'no-existe' })).toEqual([]);
  });
});
