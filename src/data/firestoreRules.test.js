import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\/.*$/gm, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function expectBalanced(source, open, close) {
  let depth = 0;
  for (const character of source) {
    if (character === open) depth += 1;
    if (character === close) depth -= 1;
    expect(depth).toBeGreaterThanOrEqual(0);
  }
  expect(depth).toBe(0);
}

describe('firestore expense rules contract', () => {
  it('mantiene delimitadores balanceados en el archivo completo', () => {
    const normalized = stripCommentsAndStrings(rules);
    expectBalanced(normalized, '{', '}');
    expectBalanced(normalized, '[', ']');
    expectBalanced(normalized, '(', ')');
  });

  it('limita la colección de gastos a permisos financieros y estadísticas de lectura', () => {
    expect(rules).toMatch(/match \/expenses\/\{expenseId\}/);
    expect(rules).toMatch(/allow read: if hasTeamPermission\(teamId, "payments", "view"\) \|\|\s+hasTeamPermission\(teamId, "stats", "view"\)/);
    expect(rules).toMatch(/allow create: if hasTeamPermission\(teamId, "payments", "create"\)/);
    expect(rules).toMatch(/allow delete: if hasTeamPermission\(teamId, "payments", "delete"\)/);
  });

  it('valida el esquema manual y conserva la autoría durante actualizaciones', () => {
    expect(rules).toMatch(/function isValidManualExpenseData\(data\)/);
    expect(rules).toMatch(/data\.source == "manual"/);
    expect(rules).toMatch(/data\.amount > 0/);
    expect(rules).toMatch(/request\.resource\.data\.createdBy == resource\.data\.createdBy/);
    expect(rules).toMatch(/request\.resource\.data\.createdAt == resource\.data\.createdAt/);
    expect(rules).toMatch(/isValidManualExpenseData\(request\.resource\.data\)/);
  });

  it('impide que pagos inválidos contaminen los gastos automáticos', () => {
    expect(rules).toMatch(/function isValidTeamPaymentData\(data\)/);
    expect(rules).toMatch(/data\.userId in teamData\(data\.teamId\)\.members/);
    expect(rules).toMatch(/data\.amount > 0/);
    expect(rules).toMatch(/request\.resource\.data\.registeredBy == request\.auth\.uid/);
    expect(rules).toMatch(/isValidTeamPaymentData\(request\.resource\.data\)/);
    expect(rules).toMatch(/request\.resource\.data\.teamId == resource\.data\.teamId/);
    expect(rules).toMatch(/request\.resource\.data\.userId == resource\.data\.userId/);
  });
});

describe('firestore team creation rules contract', () => {
  it('reserva la creación directa a los administradores configurados', () => {
    expect(rules).toContain('"lpzcode@yahoo.com"');
    expect(rules).toContain('"lopmag.lopez@gmail.com"');
    expect(rules).toContain('"fabiansolares719@gmail.com"');
    expect(rules).toMatch(/allow create: if isSystemAdmin\(\) &&\s+request\.resource\.data\.admin == request\.auth\.uid/);
  });

  it('no conserva el flujo antiguo de códigos de acceso', () => {
    expect(rules).not.toContain('team_access_codes');
    expect(rules).not.toContain('teamAccessCode');
    expect(rules).not.toContain('isRedeemingAccessCodeForTeam');
  });
});
