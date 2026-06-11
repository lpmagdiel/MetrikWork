<script>
  import { BarChart3, Check, Cookie, Settings2, ShieldCheck, X } from "lucide-svelte";
  import {
    closeCookiePreferences,
    cookieConsentStore,
    cookiePreferencesOpen,
    hasCookieConsentDecision,
    saveCookieConsent,
  } from "../data/cookieConsent.js";

  let showSettings = $state(false);
  let analyticsSelected = $state(false);
  let hasDecision = $derived(hasCookieConsentDecision($cookieConsentStore));
  let isVisible = $derived(!hasDecision || $cookiePreferencesOpen);

  $effect(() => {
    if (!isVisible) {
      showSettings = false;
      return;
    }

    analyticsSelected = $cookieConsentStore.analytics === true;
    if ($cookiePreferencesOpen) showSettings = true;
  });

  function acceptAll() {
    saveCookieConsent({ analytics: true });
    closeCookiePreferences();
    showSettings = false;
  }

  function rejectAll() {
    saveCookieConsent({ analytics: false });
    closeCookiePreferences();
    showSettings = false;
  }

  function saveSelection() {
    saveCookieConsent({ analytics: analyticsSelected });
    closeCookiePreferences();
    showSettings = false;
  }

  function closePanel() {
    if (!hasDecision) return;
    closeCookiePreferences();
    showSettings = false;
  }
</script>

{#if isVisible}
  <div class="cookie-layer" role="dialog" aria-modal="false" aria-labelledby="cookie-title">
    <section class="cookie-panel" class:settings-mode={showSettings}>
      {#if hasDecision}
        <button type="button" class="cookie-close" aria-label="Cerrar preferencias de cookies" onclick={closePanel}>
          <X size={18} />
        </button>
      {/if}

      <div class="cookie-heading">
        <span class="cookie-icon"><Cookie size={22} /></span>
        <div>
          <h2 id="cookie-title">Privacidad y cookies</h2>
          <p>
            Usamos tecnologias necesarias para que MetricWork funcione y, si lo aceptas,
            analitica para mejorar la experiencia.
          </p>
        </div>
      </div>

      {#if showSettings}
        <div class="cookie-options">
          <label class="cookie-option disabled">
            <span class="option-icon"><ShieldCheck size={18} /></span>
            <span>
              <strong>Necesarias</strong>
              <small>Autenticacion, seguridad, preferencias y funciones solicitadas.</small>
            </span>
            <input type="checkbox" checked disabled />
          </label>

          <label class="cookie-option">
            <span class="option-icon analytics"><BarChart3 size={18} /></span>
            <span>
              <strong>Analitica</strong>
              <small>Medicion tecnica con Vercel Speed Insights.</small>
            </span>
            <input type="checkbox" bind:checked={analyticsSelected} />
          </label>
        </div>

        <div class="cookie-actions">
          <button type="button" class="secondary" onclick={rejectAll}>Rechazar</button>
          <button type="button" class="secondary" onclick={acceptAll}>Aceptar todas</button>
          <button type="button" class="primary" onclick={saveSelection}>
            <Check size={17} />
            <span>Guardar</span>
          </button>
        </div>
      {:else}
        <div class="cookie-links">
          <a href="/cookies">Politica de cookies</a>
          <a href="/privacy">Privacidad</a>
        </div>

        <div class="cookie-actions">
          <button type="button" class="secondary" onclick={rejectAll}>Rechazar</button>
          <button type="button" class="secondary" onclick={() => (showSettings = true)}>
            <Settings2 size={17} />
            <span>Configurar</span>
          </button>
          <button type="button" class="primary" onclick={acceptAll}>Aceptar</button>
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .cookie-layer {
    position: fixed;
    inset: 0;
    z-index: 1500;
    padding: 16px;
    display: grid;
    place-items: center;
    pointer-events: none;
  }

  .cookie-panel {
    position: relative;
    width: min(100%, 760px);
    margin: 0 auto;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-card) 96%, transparent);
    color: var(--text-primary);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.22);
    backdrop-filter: blur(18px);
    padding: 18px;
    display: grid;
    gap: 16px;
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    pointer-events: auto;
  }

  .cookie-panel.settings-mode {
    width: min(100%, 680px);
  }

  .cookie-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 34px;
    height: 34px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    display: grid;
    place-items: center;
    cursor: pointer;
  }

  .cookie-heading {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr);
    gap: 12px;
    align-items: flex-start;
    padding-right: 34px;
  }

  .cookie-icon,
  .option-icon {
    width: 42px;
    height: 42px;
    border-radius: var(--radius-sm);
    background: var(--bg-accent-subtle);
    color: var(--success-color);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .option-icon {
    width: 38px;
    height: 38px;
  }

  .option-icon.analytics {
    background: var(--bg-info-subtle);
    color: var(--info-color);
  }

  .cookie-heading h2 {
    margin: 0 0 4px;
    color: var(--text-primary);
    font-size: 18px;
    line-height: 1.15;
    font-weight: 900;
    letter-spacing: 0;
  }

  .cookie-heading p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.45;
    font-weight: 650;
  }

  .cookie-links {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .cookie-links a {
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 850;
  }

  .cookie-options {
    display: grid;
    gap: 10px;
  }

  .cookie-option {
    min-height: 70px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    cursor: pointer;
  }

  .cookie-option.disabled {
    cursor: default;
    opacity: 0.86;
  }

  .cookie-option span:nth-child(2) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .cookie-option strong {
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 900;
  }

  .cookie-option small {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.35;
    font-weight: 650;
  }

  .cookie-option input {
    width: 20px;
    height: 20px;
    accent-color: var(--accent-strong);
  }

  .cookie-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }

  .cookie-actions button {
    min-height: 42px;
    border-radius: var(--radius-sm);
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid var(--border-color);
    font-size: 13px;
    font-weight: 900;
    cursor: pointer;
  }

  .cookie-actions .secondary {
    background: var(--bg-input);
    color: var(--text-primary);
  }

  .cookie-actions .primary {
    background: var(--accent-strong);
    border-color: var(--accent-strong);
    color: var(--bg-card);
    box-shadow: var(--shadow-button);
  }

  :global(:root.dark) .cookie-actions .primary {
    color: #000000;
  }

  @media (max-width: 560px) {
    .cookie-layer {
      padding: 10px;
    }

    .cookie-panel {
      border-radius: var(--radius-md);
      max-height: calc(100dvh - 20px);
    }

    .cookie-heading {
      grid-template-columns: 1fr;
      padding-right: 0;
    }

    .cookie-actions {
      display: grid;
      grid-template-columns: 1fr;
    }
  }
</style>
