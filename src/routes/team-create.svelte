<script>
  import {
    BadgeCheck,
    ChevronLeft,
    CircleSlash,
    RefreshCw,
    ShieldCheck,
    Users,
  } from "lucide-svelte";
  import { navigateTo } from "../router.js";
  import {
    createTeam,
    selectedTeamId,
    systemAdminStore,
  } from "../data/stores.js";

  let teamName = $state("");
  let creating = $state(false);
  let error = $state("");

  async function handleCreateTeam(event) {
    event?.preventDefault();
    error = "";

    if (!$systemAdminStore.isAdmin) {
      error = "Solo un administrador puede crear equipos.";
      return;
    }

    const name = teamName.trim();
    if (!name) {
      error = "Escribe un nombre para el equipo.";
      return;
    }

    creating = true;
    try {
      const id = await createTeam(name);
      selectedTeamId.set(id);
      navigateTo(`/teams/${id}`);
    } catch (creationError) {
      error = creationError?.message || "No se pudo crear el equipo.";
    } finally {
      creating = false;
    }
  }
</script>

<div class="create-team-page">
  <header class="page-header">
    <button type="button" class="back-button" onclick={() => navigateTo("/system-admin")}>
      <ChevronLeft size={20} />
      <span>Panel admin</span>
    </button>
    <div class="admin-pill">
      <ShieldCheck size={16} />
      <span>Administración</span>
    </div>
  </header>

  {#if $systemAdminStore.loading}
    <section class="state-card">
      <span class="spin"><RefreshCw size={28} /></span>
      <p>Comprobando acceso...</p>
    </section>
  {:else if !$systemAdminStore.isAdmin}
    <section class="state-card denied">
      <span class="denied-icon"><CircleSlash size={34} /></span>
      <h1>Sin acceso</h1>
      <p>La creación de equipos está reservada a los administradores.</p>
      <button type="button" onclick={() => navigateTo("/teams")}>Volver a equipos</button>
    </section>
  {:else}
    <section class="intro-card">
      <span class="eyebrow">Nuevo equipo</span>
      <h1>Crear equipo de trabajo</h1>
      <p>Elige un nombre para tu equipo. El equipo quedará listo al instante y tú serás su administrador.</p>
    </section>

    <form class="team-form" onsubmit={handleCreateTeam}>
      <label for="team-name">Nombre del equipo</label>
      <div class="input-wrapper">
        <Users size={19} />
        <input
          id="team-name"
          type="text"
          placeholder="Ej. Equipo de instalaciones"
          bind:value={teamName}
          disabled={creating}
          autocomplete="organization"
          maxlength="80"
        />
      </div>

      {#if error}
        <p class="form-error" role="alert">{error}</p>
      {/if}

      <button type="submit" class="primary-action" disabled={creating || !teamName.trim()}>
        {#if creating}
          <span class="spin"><RefreshCw size={18} /></span>
          <span>Creando...</span>
        {:else}
          <BadgeCheck size={19} />
          <span>Crear equipo</span>
        {/if}
      </button>
    </form>
  {/if}
</div>

<style>
  .create-team-page {
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: var(--page-top-safe) 18px calc(var(--bottom-nav-clearance) + 28px);
    background: var(--bg-page);
  }

  .page-header,
  .intro-card,
  .team-form,
  .state-card {
    width: min(100%, 680px);
    margin-inline: auto;
    box-sizing: border-box;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
  }

  .back-button,
  .state-card button {
    min-height: 42px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-primary);
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-weight: 800;
    cursor: pointer;
  }

  .admin-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    background: var(--accent-color);
    color: var(--accent-ink);
    font-size: 13px;
    font-weight: 800;
  }

  .intro-card,
  .team-form,
  .state-card {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
  }

  .intro-card {
    padding: 24px;
    margin-bottom: 14px;
  }

  .eyebrow {
    display: block;
    margin-bottom: 8px;
    color: var(--accent-strong);
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    color: var(--text-primary);
    font-size: clamp(25px, 6vw, 34px);
    line-height: 1.08;
  }

  .intro-card p,
  .state-card p {
    margin: 10px 0 0;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .team-form {
    padding: 24px;
  }

  label {
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 800;
  }

  .input-wrapper {
    min-height: 52px;
    margin-top: 9px;
    padding: 0 15px;
    display: flex;
    align-items: center;
    gap: 11px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-secondary);
  }

  .input-wrapper:focus-within {
    border-color: var(--accent-strong);
  }

  input {
    min-width: 0;
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
  }

  .form-error {
    margin: 16px 0 0;
    padding: 11px 13px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, #dc2626 12%, var(--bg-card));
    color: #dc2626;
    font-size: 14px;
    font-weight: 700;
  }

  .primary-action {
    width: 100%;
    min-height: 54px;
    margin-top: 20px;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--accent-strong);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    font-size: 15px;
    font-weight: 900;
    cursor: pointer;
  }

  .primary-action:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .state-card {
    min-height: 280px;
    padding: 36px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    text-align: center;
  }

  .state-card h1 {
    margin-top: 12px;
  }

  .state-card button {
    margin-top: 20px;
  }

  .denied-icon {
    color: #dc2626;
    display: inline-flex;
  }

  .spin {
    display: inline-flex;
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 520px) {
    .team-form,
    .intro-card {
      padding: 20px;
    }
  }
</style>
