/**
 * Importador PDF (futuro).
 *
 * Stub que implementa el contrato de `importManager.js` para reservar el
 * formato. Como `canImport` siempre devuelve `false`, no interfiere con los
 * importadores activos. Cuando se implemente, se sustituirá el cuerpo de
 * `canImport`/`import` sin tocar el registro del manager.
 *
 * @see importManager.js
 */
export const pdfImporter = {
  id: "pdf",
  name: "PDF Importer",
  description: "Importa datos desde archivos PDF.",
  supportedExtensions: [".pdf"],
  /** @param {*} _data */
  canImport: () => false,
  /** @throws {Error} Siempre, hasta que se implemente. */
  import: () => {
    throw new Error("El importador PDF aún no está implementado.");
  },
};
