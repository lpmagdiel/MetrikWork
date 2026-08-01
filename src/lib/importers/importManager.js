/**
 * Import Manager.
 *
 * Único responsable de detectar automáticamente el tipo de archivo y
 * delegar en el importador adecuado. Cada formato es un módulo independiente
 * que implementa el contrato `{ canImport(data), import(data) }`, de modo
 * que añadir un formato nuevo no requiere tocar este código.
 *
 * Flujo:
 * ```
 * for (const importer of importers) {
 *   if (importer.canImport(data)) return importer.import(data);
 * }
 * ```
 *
 * Para añadir un nuevo formato basta con crear su módulo y registrarlo en
 * el array `importers`.
 */

import { rcxImporter } from "./rcxImporter.js";
import { csvImporter } from "./future/csvImporter.js";
import { excelImporter } from "./future/excelImporter.js";
import { pdfImporter } from "./future/pdfImporter.js";

/**
 * Error lanzado cuando ningún importador reconoce el contenido.
 */
export class ImportError extends Error {
  /**
   * @param {string} message
   * @param {string[]} [errors]
   */
  constructor(message, errors = []) {
    super(message);
    this.name = "ImportError";
    this.errors = errors;
  }
}

/**
 * Registro de importadores disponibles. El orden importa: se usa el primero
 * que reconozca el contenido.
 * @type {Array<{id:string, name:string, canImport:(data:*)=>boolean, import:(data:*)=>*}>}
 */
const importers = [rcxImporter, csvImporter, excelImporter, pdfImporter];

/**
 * Indica si existe algún importador capaz de procesar el contenido.
 * @param {*} data Objeto o string JSON.
 * @returns {boolean}
 */
export function canImport(data) {
  return importers.some((importer) => importer.canImport(data));
}

/**
 * Detecta el formato y delega en el importador correspondiente.
 *
 * @param {*} data Objeto o string JSON.
 * @returns {{importer: string, project: object}} Nombre del importador usado
 *   y proyecto convertido a la estructura interna.
 * @throws {ImportError} Si ningún importador reconoce el contenido.
 */
export function importData(data) {
  for (const importer of importers) {
    if (importer.canImport(data)) {
      return { importer: importer.id, project: importer.import(data) };
    }
  }
  throw new ImportError("Ningún importador disponible reconoce este contenido.");
}

/**
 * Importa contenido a partir de un string (JSON).
 * @param {string} text Contenido a importar.
 * @returns {Promise<{importer: string, project: object}>}
 * @throws {ImportError}
 */
export async function importFromString(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new ImportError("El contenido está vacío.");
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError("El contenido no es JSON válido.");
  }
  return importData(data);
}

/**
 * Importa un archivo leyéndolo como texto.
 * @param {File} file Archivo seleccionado por el usuario.
 * @returns {Promise<{importer: string, project: object}>}
 * @throws {ImportError}
 */
export async function importFromFile(file) {
  if (!file) {
    throw new ImportError("No se seleccionó ningún archivo.");
  }
  const text = await file.text();
  return importFromString(text);
}

/**
 * Extensiones de archivo soportadas por todos los importadores registrados.
 * Útil para el atributo `accept` de un input de tipo file.
 * @returns {string[]}
 */
export function getSupportedExtensions() {
  return [...new Set(importers.flatMap((importer) => importer.supportedExtensions || []))];
}

/**
 * Lista los importadores registrados (nombre y descripción), útil para
 * depuración o para exponer en la interfaz qué formatos se soportan.
 * @returns {Array<{id:string, name:string, description?:string, supportedExtensions:string[]}>}
 */
export function getRegisteredImporters() {
  return importers.map((importer) => ({
    id: importer.id,
    name: importer.name,
    description: importer.description,
    supportedExtensions: importer.supportedExtensions || [],
  }));
}
