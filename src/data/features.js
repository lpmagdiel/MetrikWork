/**
 * Modo beta: desactiva Google OAuth en la UI y el flujo Stripe al crear equipos.
 * Define en `.env` o en el dashboard de Vercel:
 *   VITE_BETA_TESTERS_MODE=true
 * Cualquier otro valor o ausencia = producción (pagos y Google según configuración).
 */
export const BETA_TESTERS_MODE =
  import.meta.env.VITE_BETA_TESTERS_MODE === "true";
