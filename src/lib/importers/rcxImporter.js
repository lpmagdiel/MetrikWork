/**
 * Importador del estándar RCX (ReformaCalc eXchange).
 *
 * RCX es el formato oficial de intercambio de datos entre las aplicaciones
 * del ecosistema (ReformaCalc, MetricWork y futuras). Este módulo es
 * independiente: únicamente sabe leer, validar y convertir proyectos RCX.
 * La detección de formato y la orquestación de importadores vive en
 * `importManager.js`.
 *
 * Formato (v1.0):
 * ```json
 * {
 *   "version": "1.0",
 *   "type": "rcx-project",
 *   "source": { "app": "ReformaCalc", "version": "1.3.0" },
 *   "metadata": { "exportedAt": "", "currency": "EUR", "language": "es" },
 *   "project": {},
 *   "calculation": {},
 *   "summary": {},
 *   "materials": []
 * }
 * ```
 *
 * Por compatibilidad con versiones antiguas de ReformaCalc también se
 * acepta `type: "reformacalc-project"`. Internamente ambos se tratan igual.
 *
 * Diseñado para RCX 1.x y 2.x: el importador no asume que el proyecto solo
 * contiene materiales, y los campos nuevos que aparezcan en el futuro se
 * ignoran sin romper la importación.
 */

/**
 * Tipos de documento aceptados como proyecto RCX.
 * Mantener en un único sitio para compatibilidad entre formatos antiguos
 * y nuevos.
 * @type {string[]}
 */
export const RCX_TYPES = ["rcx-project", "reformacalc-project"];

/** Versiones de RCX soportadas (patrón semver simple, 1.x y 2.x). */
const VERSION_PATTERN = /^\d+(\.\d+)*$/;

/** Separador visual usado en el resumen generado. */
const DIVIDER = "----------------------------------------";

/** Símbolos de moneda conocidos; fallback al código ISO. */
const CURRENCY_SYMBOLS = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  MXN: "$",
  ARS: "$",
  CLP: "$",
  PEN: "S/",
  COP: "$",
};

/**
 * Error lanzado cuando el contenido no es un proyecto RCX válido.
 * Incluye la lista de errores de validación.
 */
export class RCXImportError extends Error {
  /**
   * @param {string|string[]} errors Mensaje o lista de mensajes de error.
   */
  constructor(errors = []) {
    const list = Array.isArray(errors) ? errors : [String(errors)];
    super(list.join(" "));
    this.name = "RCXImportError";
    this.errors = list;
  }
}

/**
 * Convierte la entrada (JSON string u objeto) en un objeto plano.
 * @param {*} data
 * @returns {object|null} El objeto parseado o null si no es válido.
 */
function parseInput(data) {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
}

/**
 * Devuelve el primer valor definido y no vacío de la lista.
 * @param {...*} values
 * @returns {*}
 */
function firstDefined(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && String(value).trim() !== "",
  );
}

/**
 * Devuelve el primer valor numérico finito de la lista, o null.
 * @param {...*} values
 * @returns {number|null}
 */
function firstFiniteNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

/**
 * Formatea un número con separador decimal "." recortando ceros finales.
 * @param {*} value
 * @param {number} maxDecimals
 * @returns {string}
 */
export function formatNumber(value, maxDecimals = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

/**
 * Formatea una cantidad monetaria con símbolo de moneda.
 * @param {*} value
 * @param {string} [currency]
 * @returns {string}
 */
export function formatCurrency(value, currency = "EUR") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  const code = String(currency || "").toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code] || code || "";
  return `${formatNumber(numeric, 2)} ${symbol}`.trim();
}

// ---------------------------------------------------------------------------
// Extracción de campos
//
// Los extractores buscan varios nombres alternativos para ser tolerantes con
// diferencias entre aplicaciones emisoras y entre versiones de RCX. Cuando un
// campo no existe devuelven null y el resumen lo omite, así un RCX 2.x con
// secciones nuevas no rompe la importación.
// ---------------------------------------------------------------------------

/** @param {object} rcx */
function getProjectName(rcx) {
  return firstDefined(
    rcx.project?.name,
    rcx.project?.title,
    rcx.project?.projectName,
    rcx.metadata?.name,
    rcx.metadata?.projectName,
  );
}

/** @param {object} rcx */
function getProjectId(rcx) {
  return firstDefined(rcx.project?.id, rcx.project?.projectId, rcx.metadata?.projectId);
}

/** @param {object} rcx */
function getDescription(rcx) {
  return firstDefined(rcx.project?.description, rcx.project?.notes) || "";
}

/** @param {object} rcx */
function getSourceApp(rcx) {
  return firstDefined(rcx.source?.app, rcx.source?.name, rcx.source?.application) || "Desconocida";
}

/** @param {object} rcx */
function getSystem(rcx) {
  return firstDefined(
    rcx.project?.system,
    rcx.project?.systemName,
    rcx.project?.constructiveSystem,
    rcx.summary?.system,
  );
}

/**
 * Área del proyecto. Devuelve un string listo para mostrar ("8.32 m²").
 * @param {object} rcx
 * @returns {string|null}
 */
function getArea(rcx) {
  const value = firstDefined(rcx.project?.area, rcx.summary?.area);
  if (value === undefined) return null;
  if (typeof value === "number" || Number.isFinite(Number(value))) {
    const numeric = Number(value);
    return `${formatNumber(numeric, 2)} m²`;
  }
  return String(value);
}

/**
 * Dimensiones del proyecto ("3.2 × 2.6 m"). Acepta string, objeto
 * { width, height } o campos sueltos en el proyecto.
 * @param {object} rcx
 * @returns {string|null}
 */
function getDimensions(rcx) {
  const raw = firstDefined(rcx.project?.dimensions, rcx.summary?.dimensions);
  if (raw && typeof raw === "object") {
    const width = firstFiniteNumber(raw.width, raw.longitude, raw.largo);
    const height = firstFiniteNumber(raw.height, raw.latitude, raw.ancho, raw.alto);
    if (width !== null && height !== null) {
      return `${formatNumber(width, 2)} × ${formatNumber(height, 2)} m`;
    }
    return null;
  }
  if (raw !== undefined) return String(raw);

  const width = firstFiniteNumber(rcx.project?.width, rcx.project?.longitude, rcx.project?.largo);
  const height = firstFiniteNumber(rcx.project?.height, rcx.project?.latitude, rcx.project?.ancho, rcx.project?.alto);
  if (width !== null && height !== null) {
    return `${formatNumber(width, 2)} × ${formatNumber(height, 2)} m`;
  }
  return null;
}

/** @param {object} rcx */
function getMaterialsCost(rcx) {
  const value = firstDefined(
    rcx.summary?.materials,
    rcx.summary?.materialsCost,
    rcx.summary?.materialsTotal,
    rcx.summary?.costs?.materials,
  );
  if (value === undefined) return null;
  return formatCurrency(value, rcx.metadata?.currency);
}

/** @param {object} rcx */
function getLaborCost(rcx) {
  const value = firstDefined(
    rcx.summary?.labor,
    rcx.summary?.laborCost,
    rcx.summary?.manoDeObra,
    rcx.summary?.costs?.labor,
  );
  if (value === undefined) return null;
  return formatCurrency(value, rcx.metadata?.currency);
}

/** @param {object} rcx */
function getTotalCost(rcx) {
  const value = firstDefined(
    rcx.summary?.total,
    rcx.summary?.totalCost,
    rcx.summary?.totals?.total,
  );
  if (value === undefined) return null;
  return formatCurrency(value, rcx.metadata?.currency);
}

/**
 * Tiempo estimado en horas.
 * @param {object} rcx
 * @returns {string|null}
 */
function getEstimatedTime(rcx) {
  const value = firstDefined(
    rcx.summary?.estimatedTime,
    rcx.summary?.time,
    rcx.summary?.hours,
    rcx.summary?.timeHours,
    rcx.project?.estimatedTime,
  );
  if (value === undefined) return null;
  if (typeof value === "number" || Number.isFinite(Number(value))) {
    return `${formatNumber(Number(value), 1)} h`;
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// Materiales
// ---------------------------------------------------------------------------

/** @param {object} material */
function extractMaterialName(material) {
  return firstDefined(
    material.name,
    material.title,
    material.description,
    material.descripcion,
    material.item,
    material.material,
  );
}

/** @param {object} material */
function extractMaterialQuantity(material) {
  return firstFiniteNumber(
    material.quantity,
    material.qty,
    material.cantidad,
    material.amount,
  );
}

/** @param {object} material */
function extractMaterialUnit(material) {
  return firstDefined(material.unit, material.unidad, material.ud) || "ud";
}

/**
 * Convierte un material en una línea legible: "7 ud - Placa BA".
 * @param {object} material
 * @returns {string|null} null si el material no tiene nombre.
 */
function formatMaterial(material) {
  if (!material || typeof material !== "object") return null;
  const name = extractMaterialName(material);
  if (!name) return null;
  const quantity = extractMaterialQuantity(material);
  if (quantity === null) return String(name);
  return `${formatNumber(quantity, 3)} ${extractMaterialUnit(material)} - ${name}`;
}

/**
 * Construye el checklist interno a partir del array de materiales.
 * Todos los items nacen desmarcados.
 * @param {Array<object>|undefined} materials
 * @returns {Array<{text:string, checked:boolean}>}
 */
function buildChecklist(materials) {
  if (!Array.isArray(materials)) return [];
  return materials
    .map(formatMaterial)
    .filter(Boolean)
    .map((text) => ({ text, checked: false }));
}

/** @param {object} rcx */
function getMaterialLines(rcx) {
  if (!Array.isArray(rcx.materials)) return [];
  return rcx.materials.map(formatMaterial).filter(Boolean).map((line) => `• ${line}`);
}

// ---------------------------------------------------------------------------
// Etiquetas y resumen
// ---------------------------------------------------------------------------

/**
 * Etiquetas sugeridas: "RCX", aplicación origen y sistema constructivo.
 * @param {object} rcx
 * @returns {string[]}
 */
function buildTags(rcx) {
  return [...new Set(["RCX", getSourceApp(rcx), getSystem(rcx)].filter(Boolean))];
}

/**
 * Genera el texto del resumen del proyecto.
 *
 * Ejemplo de salida:
 * ```
 * Proyecto
 * Pared salón
 * ----------------------------------------
 * Aplicación origen
 * ReformaCalc
 * ----------------------------------------
 * Sistema
 * Pladur
 * Área
 * 8.32 m²
 * ...
 * ```
 * @param {object} rcx
 * @returns {string}
 */
function buildSummary(rcx) {
  const sections = [];

  sections.push(["Proyecto", getProjectName(rcx) || "Proyecto sin título"]);
  sections.push(["Aplicación origen", getSourceApp(rcx)]);

  const technical = [];
  const system = getSystem(rcx);
  if (system) technical.push("Sistema", system);
  const area = getArea(rcx);
  if (area) technical.push("Área", area);
  const dimensions = getDimensions(rcx);
  if (dimensions) technical.push("Dimensiones", dimensions);
  if (technical.length) sections.push(technical);

  const economic = ["Resumen económico"];
  const materialsCost = getMaterialsCost(rcx);
  if (materialsCost) economic.push("Materiales", materialsCost);
  const laborCost = getLaborCost(rcx);
  if (laborCost) economic.push("Mano de obra", laborCost);
  const total = getTotalCost(rcx);
  if (total) economic.push("Total", total);
  const time = getEstimatedTime(rcx);
  if (time) economic.push("Tiempo estimado", time);
  if (economic.length > 1) sections.push(economic);

  const materialLines = getMaterialLines(rcx);
  sections.push(["Materiales", ...(materialLines.length ? materialLines : ["Sin materiales"])]);

  return sections.map((section) => section.join("\n")).join(`\n${DIVIDER}\n`);
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Indica si el contenido es un proyecto RCX válido (acepta `rcx-project`
 * y `reformacalc-project` por compatibilidad).
 *
 * No lanza excepciones: devuelve `true`/`false`.
 *
 * @param {object|string} data Objeto RCX o string JSON.
 * @returns {boolean}
 */
export function isRCXProject(data) {
  const input = parseInput(data);
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  return RCX_TYPES.includes(input.type);
}

/**
 * Valida un proyecto RCX. Devuelve `{ valid, errors }`.
 *
 * Valida: `version`, `type`, `source`, `metadata`, `project`,
 * `calculation`, `summary` y `materials`.
 *
 * @param {object|string} data Objeto RCX o string JSON.
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateRCXProject(data) {
  const input = parseInput(data);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["El contenido no es un objeto JSON válido."] };
  }

  const errors = [];
  const rcx = input;

  // version
  if (rcx.version === undefined || rcx.version === null || String(rcx.version).trim() === "") {
    errors.push('El campo "version" es obligatorio.');
  } else if (typeof rcx.version !== "string" && typeof rcx.version !== "number") {
    errors.push('El campo "version" debe ser una cadena o un número.');
  } else if (!VERSION_PATTERN.test(String(rcx.version))) {
    errors.push(`La versión "${rcx.version}" no es válida.`);
  }

  // type
  if (!RCX_TYPES.includes(rcx.type)) {
    errors.push(
      `El campo "type" debe ser "${RCX_TYPES[0]}" o "${RCX_TYPES[1]}" (recibido: ${JSON.stringify(rcx.type)}).`,
    );
  }

  // source
  if (!rcx.source || typeof rcx.source !== "object" || Array.isArray(rcx.source)) {
    errors.push('El campo "source" debe ser un objeto.');
  } else if (!rcx.source.app || String(rcx.source.app).trim() === "") {
    errors.push('El campo "source.app" es obligatorio.');
  }

  // Secciones (opcionales, se valida el tipo cuando están presentes).
  const sections = {
    metadata: "objeto",
    project: "objeto",
    calculation: "objeto",
    summary: "objeto",
  };
  for (const [section, expectedType] of Object.entries(sections)) {
    if (rcx[section] !== undefined && (typeof rcx[section] !== "object" || Array.isArray(rcx[section]) || rcx[section] === null)) {
      errors.push(`El campo "${section}" debe ser un ${expectedType}.`);
    }
  }
  if (rcx.materials !== undefined && !Array.isArray(rcx.materials)) {
    errors.push('El campo "materials" debe ser un array.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Importa un proyecto RCX: valida y lo convierte a la estructura interna de
 * MetricWork.
 *
 * Acepta un string JSON o un objeto JavaScript.
 *
 * @param {object|string} json Proyecto RCX.
 * @returns {{
 *   title: string,
 *   description: string,
 *   category: string,
 *   source: string,
 *   imported: boolean,
 *   metadata: { projectId: string, importedAt: string, version: string },
 *   checklist: Array<{text: string, checked: boolean}>,
 *   notes: string,
 *   tags: string[]
 * }}
 * @throws {RCXImportError} Si el contenido no es JSON válido o no pasa la validación.
 */
export function importRCXProject(json) {
  const data = parseInput(json);
  if (!data) {
    throw new RCXImportError(["El contenido no es JSON válido."]);
  }

  const validation = validateRCXProject(data);
  if (!validation.valid) {
    throw new RCXImportError(validation.errors);
  }

  return {
    title: getProjectName(data) || "Proyecto sin título",
    description: getDescription(data),
    category: "Proyecto",
    source: getSourceApp(data),
    imported: true,
    metadata: {
      projectId: getProjectId(data) || "",
      importedAt: new Date().toISOString(),
      version: String(data.version ?? ""),
    },
    checklist: buildChecklist(data.materials),
    notes: buildSummary(data),
    tags: buildTags(data),
  };
}

/**
 * Convierte un proyecto importado en la estructura de nota de MetricWork
 * (campos `title`, `type`, `content`, `items`, `color`).
 *
 * El resumen generado se guarda como contenido de la nota y las etiquetas
 * se añaden al final del contenido, ya que las notas de MetricWork no
 * disponen de campo de etiquetas propio.
 *
 * @param {object} project Proyecto devuelto por `importRCXProject`.
 * @returns {{title: string, type: 'text'|'todo', content: string, items: Array<{text: string, completed: boolean}>, color: string}}
 */
export function toNoteData(project) {
  const items = (project.checklist || []).map((item) => ({
    text: item.text,
    completed: Boolean(item.checked),
  }));

  const tags = Array.isArray(project.tags) && project.tags.length ? project.tags.join(", ") : "";
  const content = tags
    ? `${project.notes || ""}\n\nEtiquetas\n${tags}`.trim()
    : (project.notes || "");

  return {
    title: project.title || "",
    type: items.length ? "todo" : "text",
    content,
    items,
    color: "#ffffff",
  };
}

/**
 * Objeto importador para `importManager.js`.
 * Implementa el contrato: `canImport`, `import`, `validate`, `id`, `name`,
 * `description` y `supportedExtensions`.
 */
export const rcxImporter = {
  id: "rcx",
  name: "RCX Importer",
  description: "Importa proyectos del estándar RCX (ReformaCalc eXchange).",
  supportedExtensions: [".rcx.json", ".json"],
  canImport: isRCXProject,
  import: importRCXProject,
  validate: validateRCXProject,
};
