/**
 * Modo beta: bandera general para activar o desactivar experiencias de prueba.
 * Define en `.env` o en el dashboard de Vercel:
 *   VITE_BETA_TESTERS_MODE=true
 */
export const BETA_TESTERS_MODE =
  import.meta.env.VITE_BETA_TESTERS_MODE === "true";
