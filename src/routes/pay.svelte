<script>
  import { currentPath } from "../router.js";
  import { ChevronLeft, Users } from "lucide-svelte";
  import { BETA_TESTERS_MODE } from "../data/features.js";
  import { createTeam, selectedTeamId } from "../data/stores.js";

  let betaTeamName = $state("");
  let betaCreating = $state(false);
  let betaError = $state("");

  function goBack() {
    $currentPath = "/teams";
  }

  async function handleBetaCreateTeam() {
    betaError = "";
    const name = betaTeamName.trim();
    if (!name) {
      betaError = "Escribe un nombre para el equipo.";
      return;
    }
    betaCreating = true;
    try {
      const id = await createTeam(name);
      if (id) {
        selectedTeamId.set(id);
        $currentPath = `/teams/${id}`;
      }
    } catch (e) {
      betaError = e?.message || "No se pudo crear el equipo.";
    } finally {
      betaCreating = false;
    }
  }
</script>

{#if BETA_TESTERS_MODE}
  <div class="pay-page">
    <div class="nav-header">
      <button type="button" class="back-button" onclick={goBack}>
        <ChevronLeft size={20} />
        <span>Volver</span>
      </button>
      <div class="step-pill beta-pill">
        <Users size={16} />
        <span>Nuevo equipo</span>
      </div>
    </div>

    <section class="pay-intro beta-intro">
      <span class="eyebrow">Versión de pruebas</span>
      <h1>Crear equipo</h1>
      <p>Elige un nombre para tu equipo. En esta beta no se requiere pago.</p>
    </section>

    <section class="beta-create-shell">
      <label class="beta-label" for="beta-team-name">Nombre del equipo</label>
      <input
        id="beta-team-name"
        class="beta-input"
        type="text"
        placeholder="Ej. Equipo diseño"
        bind:value={betaTeamName}
        disabled={betaCreating}
        autocomplete="organization"
      />
      {#if betaError}
        <p class="beta-error" role="alert">{betaError}</p>
      {/if}
      <button
        type="button"
        class="pay-button beta-submit"
        onclick={handleBetaCreateTeam}
        disabled={betaCreating}
      >
        {betaCreating ? "Creando…" : "Crear equipo"}
      </button>
    </section>
  </div>
{:else}
  {#await import("./PayStripeFlow.svelte")}
    <div class="pay-page pay-loading">
      <p class="pay-loading-text">Cargando pago…</p>
    </div>
  {:then { default: PayStripeFlow }}
    <PayStripeFlow />
  {:catch}
    <div class="pay-page pay-loading">
      <p class="pay-loading-text">No se pudo cargar el pago. Vuelve a intentar.</p>
    </div>
  {/await}
{/if}

<style>
  .pay-page {
    height: 100%;
    overflow-y: auto;
    padding: 24px 20px calc(var(--bottom-nav-clearance) + 96px);
    padding-top: var(--page-top-safe);
    background: var(--bg-page);
  }

  .pay-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 40vh;
  }

  .pay-loading-text {
    margin: 0;
    color: var(--text-secondary);
    font-size: 15px;
    font-weight: 600;
  }

  .nav-header {
    max-width: 500px;
    margin: 0 auto 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .back-button {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 14px;
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-card);
    transition: all 0.2s;
  }

  .back-button:hover {
    color: var(--text-primary);
    border-color: var(--accent-color);
  }

  .step-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 100px;
    background: var(--accent-color);
    color: var(--accent-ink);
    font-size: 13px;
    font-weight: 800;
  }

  .pay-intro {
    max-width: 500px;
    margin: 0 auto 18px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 22px;
    box-shadow: var(--shadow-card);
  }

  .eyebrow {
    color: var(--text-secondary);
    display: block;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  .pay-intro h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 800;
    line-height: 1.08;
    color: var(--text-primary);
  }

  .pay-intro p {
    margin: 10px 0 0;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.45;
  }

  .pay-button {
    position: relative;
    background: var(--accent-strong);
    color: var(--bg-card);
    border: none;
    min-height: 54px;
    padding: 0 22px;
    border-radius: var(--radius-md);
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    overflow: hidden;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    box-shadow: var(--shadow-button);
    width: 100%;
    max-width: 400px;
  }

  .pay-button:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-soft);
  }

  .pay-button:active {
    transform: translateY(-1px);
  }

  .beta-pill {
    background: var(--text-muted);
    color: var(--bg-card);
  }

  .beta-create-shell {
    max-width: 500px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .beta-label {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .beta-input {
    width: 100%;
    padding: 14px 16px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 1rem;
    box-sizing: border-box;
  }

  .beta-input:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 4px rgba(167, 243, 208, 0.18);
  }

  .beta-input:disabled {
    opacity: 0.7;
  }

  .beta-error {
    margin: 0;
    font-size: 0.9rem;
    color: var(--danger-color);
  }

  .beta-submit {
    margin-top: 8px;
  }

  .beta-submit:disabled {
    opacity: 0.75;
    cursor: not-allowed;
    transform: none;
  }

  @media (max-width: 420px) {
    .pay-page {
      padding-inline: 18px;
    }

    .pay-intro h1 {
      font-size: 25px;
    }
  }
</style>
