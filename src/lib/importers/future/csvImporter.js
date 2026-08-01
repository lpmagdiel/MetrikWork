/**
 * Importador CSV (futuro).
 *
 * Stub que implementa el contrato de `importManager.js` para reservar el
 * formato. Como `canImport` siempre devuelve `false`, no interfiere con los
 * importadores activos. Cuando se implemente, se sustituirá el cuerpo de
 * `canImport`/`import` sin tocar el registro del manager.
 *
 * @see importManager.js
 */
export const csvImporter = {
  id: "csv",
  name: "CSV Importer",
  description: "Importa datos desde archivos CSV.",
  supportedExtensions: [".csv"],
  /** @param {*} _data */
  canImport: () => false,
  /** @throws {Error} Siempre, hasta que se implemente. */
  import: () => {
    throw new Error("El importador CSV aún no está implementado.");
  },
};
