import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

function readIndexes() {
  const path = resolve(process.cwd(), 'firestore.indexes.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

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

function extractFunctionBody(source, name) {
  const startMarker = `function ${name}(`;
  const startIdx = source.indexOf(startMarker);
  expect(startIdx).toBeGreaterThanOrEqual(0);
  const openBraceIdx = source.indexOf('{', startIdx + startMarker.length);
  expect(openBraceIdx).toBeGreaterThan(startIdx);
  let depth = 1;
  for (let i = openBraceIdx + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBraceIdx + 1, i);
      }
    }
  }
  throw new Error(`No se encontró el cierre de la función ${name}`);
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

  it('ya NO exige campos de plan al crear un equipo', () => {
    const body = extractFunctionBody(rules, 'isAllowedTeamCreateShape');
    // hasAll ya no incluye teamSize ni maxMembers ni billingAmountEur ni billingDate.
    const hasAllMatch = body.match(/keys\(\)\.hasAll\(([\s\S]*?)\)/);
    expect(hasAllMatch).not.toBeNull();
    const hasAllContent = hasAllMatch[1];
    expect(hasAllContent).not.toMatch(/teamSize/);
    expect(hasAllContent).not.toMatch(/maxMembers/);
    expect(hasAllContent).not.toMatch(/billingAmountEur/);
    expect(hasAllContent).not.toMatch(/billingDate/);
    expect(body).toMatch(/request\.resource\.data\.team is string/);
    expect(body).toMatch(/request\.resource\.data\.team\.size\(\) > 0/);
    expect(body).toMatch(/request\.resource\.data\.team\.size\(\) <= 80/);
  });

  it('no obliga a billingAmountEur pero lo valida si existe', () => {
    const body = extractFunctionBody(rules, 'isAllowedTeamCreateShape');
    expect(body).toMatch(/!\("billingAmountEur" in request\.resource\.data\)/);
    expect(body).toMatch(/request\.resource\.data\.billingAmountEur is number/);
  });

  it('no obliga a maxMembers pero lo valida si existe', () => {
    const body = extractFunctionBody(rules, 'isAllowedTeamCreateShape');
    expect(body).toMatch(/!\("maxMembers" in request\.resource\.data\)/);
    expect(body).toMatch(/request\.resource\.data\.maxMembers is number/);
  });

  it('fabiansolares719 sigue siendo administrador del sistema', () => {
    expect(rules).toContain('"fabiansolares719@gmail.com"');
  });
});

describe('firestore clients and budgets rules contract', () => {
  it('define clients y budgets como colecciones top-level de la empresa', () => {
    // Deben estar definidos como match top-level, no dentro de /teams/{teamId}.
    expect(rules).toMatch(/match \/clients\/\{clientId\} \{[\s\S]*?allow read: if request\.auth != null;/);
    expect(rules).toMatch(/match \/budgets\/\{budgetId\} \{[\s\S]*?allow read: if request\.auth != null;/);
  });

  it('restringe CRUD de clients al system admin', () => {
    expect(rules).toMatch(/match \/clients\/\{clientId\}[\s\S]*?allow create: if isSystemAdmin\(\)/);
    expect(rules).toMatch(/match \/clients\/\{clientId\}[\s\S]*?allow delete: if isSystemAdmin\(\)/);
  });

  it('restringe CRUD de budgets al system admin', () => {
    expect(rules).toMatch(/match \/budgets\/\{budgetId\}[\s\S]*?allow create: if isSystemAdmin\(\)/);
    expect(rules).toMatch(/match \/budgets\/\{budgetId\}[\s\S]*?allow delete: if isSystemAdmin\(\)/);
  });

  it('valida el esquema de clientes con isValidClientData', () => {
    expect(rules).toMatch(/function isValidClientData\(data\)/);
    expect(rules).toMatch(/data\.name is string/);
    expect(rules).toMatch(/data\.name\.size\(\) > 0/);
    expect(rules).toMatch(/data\.name\.size\(\) <= 120/);
  });

  it('valida el esquema de presupuestos con isValidBudgetData', () => {
    expect(rules).toMatch(/function isValidBudgetData\(data\)/);
    expect(rules).toMatch(/data\.amount is number/);
    expect(rules).toMatch(/data\.amount >= 0/);
    expect(rules).toMatch(/data\.status in \["pending", "accepted", "rejected", "expired"\]/);
  });

  it('expone la subcolección budgets/{budgetId}/checklist con CRUD restringido al admin', () => {
    // Localizamos el match /budgets/{budgetId} y extraemos su bloque
    // contando llaves, empezando tras el cierre del placeholder {budgetId}.
    const startMarker = 'match /budgets/{budgetId}';
    const startIdx = rules.indexOf(startMarker);
    expect(startIdx).toBeGreaterThanOrEqual(0);

    // Después de 'match /budgets/{budgetId}' viene un espacio y '{'
    // que abre el bloque real.
    const blockOpen = rules.indexOf('{', startIdx + startMarker.length);
    expect(blockOpen).toBeGreaterThan(startIdx);

    let depth = 1;
    let endIdx = -1;
    for (let i = blockOpen + 1; i < rules.length; i++) {
      const ch = rules[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    expect(endIdx).toBeGreaterThan(blockOpen);
    const block = rules.slice(startIdx, endIdx + 1);

    expect(block).toMatch(/match \/checklist\/\{itemId\}/);
    expect(block).toMatch(/allow read: if request\.auth != null;/);
    expect(block).toMatch(/allow create: if isSystemAdmin\(\)/);
    expect(block).toMatch(/allow update: if isSystemAdmin\(\)/);
    expect(block).toMatch(/allow delete: if isSystemAdmin\(\)/);
  });

  it('valida el esquema del checklist con isValidChecklistItemData', () => {
    expect(rules).toMatch(/function isValidChecklistItemData\(data\)/);
    expect(rules).toMatch(/data\.title is string/);
    expect(rules).toMatch(/data\.title\.size\(\) >= 2/);
    expect(rules).toMatch(/data\.status in \["pending", "done"\]/);
    expect(rules).toMatch(/data\.includesLabor is bool/);
    expect(rules).toMatch(/data\.includesMaterials is bool/);
  });

  it('ya NO mantiene clients/budgets como subcolecciones de teams', () => {
    // Antes los clientes y presupuestos vivían dentro de teams/{teamId}.
    // Tras el refactor deben ser top-level. Verificamos que el match /clients
    // aparece a nivel raíz (sin estar indentado bajo teams/{teamId}).
    const clientsMatches = [...rules.matchAll(/^(\s*)match \/clients\/\{clientId\}/gm)];
    expect(clientsMatches.length).toBeGreaterThan(0);
    clientsMatches.forEach((match) => {
      expect(match[1].length).toBeLessThanOrEqual(6); // Solo 4-6 espacios (top-level)
    });

    const budgetsMatches = [...rules.matchAll(/^(\s*)match \/budgets\/\{budgetId\}/gm)];
    expect(budgetsMatches.length).toBeGreaterThan(0);
    budgetsMatches.forEach((match) => {
      expect(match[1].length).toBeLessThanOrEqual(6);
    });
  });
});

describe('firestore team active/hidden rules contract', () => {
  it('permite los campos active y hidden en isAllowedTeamUpdateShape', () => {
    expect(rules).toMatch(/"active",\s+"hidden"/);
  });

  it('sigue aceptando active y hidden al crear un equipo', () => {
    const body = extractFunctionBody(rules, 'isAllowedTeamCreateShape');
    expect(body).toContain('"active"');
    expect(body).toContain('"hidden"');
  });
});

describe('firestore ghosts rules contract', () => {
  it('declara el campo ghosts dentro de isAllowedTeamUpdateShape', () => {
    const body = extractFunctionBody(rules, 'isAllowedTeamUpdateShape');
    expect(body).toContain('"ghosts"');
  });

  it('declara el campo ghosts dentro de isAllowedTeamCreateShape', () => {
    const body = extractFunctionBody(rules, 'isAllowedTeamCreateShape');
    expect(body).toContain('"ghosts"');
  });

  it('define isGhostsUpdate limitando los cambios al array de fantasmas', () => {
    const body = extractFunctionBody(rules, 'isGhostsUpdate');
    expect(body).toContain('"ghosts"');
    expect(body).toContain('"updatedAt"');
  });

  it('permite crear jornadas de fantasmas solo con ghosts.control', () => {
    const worksSection = rules.split('match /works/{workId}')[1] || '';
    expect(worksSection).toContain('hasTeamPermission');
    expect(worksSection).toContain('"ghosts", "control"');
    expect(worksSection).toContain('isGhost == true');
  });

  it('permite actualizar y borrar jornadas de fantasmas con ghosts.control', () => {
    const worksSection = rules.split('match /works/{workId}')[1] || '';
    expect(worksSection).toContain('allow update, delete');
    expect(worksSection).toContain('ghosts", "control"');
  });
});

describe('firestore composite indexes contract', () => {
  function findIndex(indexes, collectionGroup, fieldPaths) {
    if (!indexes?.indexes) return null;
    return indexes.indexes.find((entry) => {
      if (entry.collectionGroup !== collectionGroup) return false;
      const actual = (entry.fields || []).map((field) => field.fieldPath);
      return actual.length === fieldPaths.length &&
        fieldPaths.every((path) => actual.includes(path));
    });
  }

  it('declara firestore.indexes.json con los índices compuestos necesarios', () => {
    const indexes = readIndexes();
    expect(indexes).not.toBeNull();
    expect(Array.isArray(indexes.indexes)).toBe(true);
    expect(indexes.indexes.length).toBeGreaterThan(0);
  });

  it('incluye el índice team_payments(teamId, date) usado en team-stats', () => {
    const indexes = readIndexes();
    expect(findIndex(indexes, 'team_payments', ['teamId', 'date'])).toBeDefined();
  });

  it('incluye el índice works(teamId, date) usado en team-stats', () => {
    const indexes = readIndexes();
    expect(findIndex(indexes, 'works', ['teamId', 'date'])).toBeDefined();
  });

  it('incluye el índice works(teamId, userId, date) usado en works.js', () => {
    const indexes = readIndexes();
    expect(findIndex(indexes, 'works', ['teamId', 'userId', 'date'])).toBeDefined();
  });

  it('incluye el índice team_payments(teamId, userId) usado en user-stats', () => {
    const indexes = readIndexes();
    expect(findIndex(indexes, 'team_payments', ['teamId', 'userId'])).toBeDefined();
  });

  it('incluye el índice absenceRequests(teamId, status, endDate, startDate) usado en team-stats', () => {
    const indexes = readIndexes();
    expect(findIndex(indexes, 'absenceRequests', ['teamId', 'status', 'endDate', 'startDate'])).toBeDefined();
  });
});
