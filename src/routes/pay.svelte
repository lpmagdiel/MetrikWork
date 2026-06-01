<script>
  import { navigateTo } from "../router.js";
  import { BadgeCheck, ChevronLeft, KeyRound, Users } from "lucide-svelte";
  import { createTeam, selectedTeamId } from "../data/stores.js";

  let teamName = $state("");
  let accessCode = $state("");
  let creating = $state(false);
  let error = $state("");

  function goBack() {
    navigateTo("/teams");
  }

  function normalizeAccessCode(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 8);
  }

  async function handleCreateTeam(event) {
    event?.preventDefault();
    error = "";
    const name = teamName.trim();
    const code = normalizeAccessCode(accessCode);

    if (!name) {
      error = "Escribe un nombre para el equipo.";
      return;
    }

    if (!/^\d{8}$/.test(code)) {
      error = "El código de acceso debe tener 8 dígitos.";
      return;
    }

    creating = true;
    try {
      const id = await createTeam(name, code);
      if (id) {
        selectedTeamId.set(id);
        navigateTo(`/teams/${id}`);
      }
    } catch (e) {
      error = e?.message || "No se pudo crear el equipo.";
    } finally {
      creating = false;
    }
  }
</script>

<div class="pay-page">
  <div class="nav-header">
    <button type="button" class="back-button" onclick={goBack}>
      <ChevronLeft size={20} />
      <span>Volver</span>
    </button>
    <div class="step-pill">
      <Users size={16} />
      <span>Nuevo equipo</span>
    </div>
  </div>

  <section class="pay-intro">
    <span class="eyebrow">Acceso con código</span>
    <h1>Crear equipo</h1>
    <p>Introduce el nombre del equipo y un código vigente de un solo uso.</p>
  </section>

  <form class="create-team-shell" onsubmit={handleCreateTeam}>
    <div class="input-group">
      <label for="team-name">Nombre del equipo</label>
      <div class="input-wrapper">
        <Users size={18} />
        <input
          id="team-name"
          type="text"
          placeholder="Ej. Equipo diseño"
          bind:value={teamName}
          disabled={creating}
          autocomplete="organization"
        />
      </div>
    </div>

    <div class="input-group">
      <label for="access-code">Código de acceso</label>
      <div class="input-wrapper code-wrapper">
        <KeyRound size={18} />
        <input
          id="access-code"
          type="text"
          inputmode="numeric"
          maxlength="8"
          placeholder="00000000"
          value={accessCode}
          disabled={creating}
          autocomplete="one-time-code"
          oninput={(event) => (accessCode = normalizeAccessCode(event.currentTarget.value))}
        />
      </div>
    </div>

    {#if error}
      <p class="form-error" role="alert">{error}</p>
    {/if}

    <button
      type="submit"
      class="pay-button"
      disabled={creating}
    >
      {#if creating}
        <span>Creando...</span>
      {:else}
        <BadgeCheck size={18} />
        <span>Crear equipo</span>
      {/if}
    </button>
  </form>
</div>

<style>
  .pay-page {
    height: 100%;
    overflow-y: auto;
    padding: 24px 20px calc(var(--bottom-nav-clearance) + 96px);
    padding-top: var(--page-top-safe);
    background: var(--bg-page);
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .pay-button:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-soft);
  }

  .pay-button:active {
    transform: translateY(-1px);
  }

  .create-team-shell {
    max-width: 500px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .input-group label {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .input-wrapper {
    width: 100%;
    padding: 14px 16px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
    background: var(--bg-input);
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 12px;
    box-sizing: border-box;
  }

  .input-wrapper input {
    width: 100%;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 1rem;
  }

  .code-wrapper input {
    font-weight: 800;
    letter-spacing: 0;
  }

  .input-wrapper:focus-within {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 4px rgba(167, 243, 208, 0.18);
  }

  .input-wrapper:has(input:disabled) {
    opacity: 0.7;
  }

  .form-error {
    margin: 0;
    font-size: 0.9rem;
    color: var(--danger-color);
  }

  .pay-button:disabled {
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
