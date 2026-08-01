<script>
  import { Search, Plus, Users, ChevronRight, X, Eye, EyeOff } from "lucide-svelte";
  import { teamsStore, selectedTeamId, systemAdminStore } from "../data/stores.js";
  import { navigateTo } from "../router.js";
  import TitleHeader from "../components/TitleHeader.svelte";
  import { optimizeCloudinary } from "../helpers/image.js";

  let searchQuery = $state("");
  let showInactive = $state(false);

  let filteredTeams = $derived.by(() => {
    const term = searchQuery.trim().toLowerCase();
    return $teamsStore
      .filter((team) => {
        // Por defecto oculta inactivos y ocultos manualmente.
        if (!showInactive) {
          if (team.active === false) return false;
          if (team.hidden === true) return false;
        }
        if (!term) return true;
        return (team.name || team.team || "").toLowerCase().includes(term);
      })
      .sort((a, b) => {
        if ((a.active === false) !== (b.active === false)) {
          return a.active === false ? 1 : -1;
        }
        return (a.name || a.team || "").localeCompare(b.name || b.team || "", "es");
      });
  });

  let inactiveCount = $derived(
    $teamsStore.filter((team) => team.active === false || team.hidden === true).length
  );

  function goToTeam(team) {
    selectedTeamId.set(team.id);
    navigateTo(`/teams/${team.id}`);
  }

  function handleCreateTeam() {
    navigateTo("/teams/create");
  }
</script>

<div class="teams-page">
  <header>
  <TitleHeader title="Equipos" description="MetricWork" icon={Users} iconPosition="right"/>
    <div class="search-row">
      <div class="search-container">
        <span class="search-icon" aria-hidden="true">
          <Search size={20} />
        </span>
        <input
          type="text"
          placeholder="Buscar equipos..."
          bind:value={searchQuery}
        />
        {#if searchQuery}
          <button class="clear-search" onclick={() => (searchQuery = "")}>
            <X size={16} />
          </button>
        {/if}
      </div>
      <button
        type="button"
        class="visibility-toggle"
        class:active={showInactive}
        onclick={() => (showInactive = !showInactive)}
        aria-pressed={showInactive}
        title={showInactive ? "Ocultar inactivos" : "Mostrar inactivos"}
        aria-label={showInactive ? "Ocultar equipos inactivos" : "Mostrar equipos inactivos"}
      >
        {#if showInactive}
          <Eye size={20} />
        {:else}
          <EyeOff size={20} />
        {/if}
        {#if inactiveCount > 0 && !showInactive}
          <span class="badge">{inactiveCount}</span>
        {/if}
      </button>
    </div>
  </header>

  <div class="teams-list">
    {#if filteredTeams.length > 0}
      {#each filteredTeams as team (team.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="team-card"
          class:inactive={team.active === false}
          class:hidden={team.hidden === true}
          onclick={() => goToTeam(team)}
        >
        {#if team.photoURL}
          <div class="team-icon">
            <img src={optimizeCloudinary(team.photoURL, 112, { height: 112, crop: "fill" })} alt={team.name || team.team} width="56" height="56" loading="eager" decoding="async" />
          </div>
        {:else}
        <div class="team-icon">
            <Users size={24} />
          </div>
        {/if}
          <div class="team-info">
            <h3>{team.name || team.team}</h3>
            <p>
              {team.members?.length || 0}
              {team.members?.length === 1 ? "miembro" : "miembros"}
              {#if team.active === false}
                · <span class="status-tag inactive">Inactivo</span>
              {:else if team.hidden === true}
                · <span class="status-tag hidden">Oculto</span>
              {/if}
            </p>
          </div>
          <span class="chevron" aria-hidden="true">
            <ChevronRight size={20} />
          </span>
        </div>
      {/each}
    {:else}
      <div class="empty-state">
        <Users size={48} />
        <p>
          {#if !showInactive && inactiveCount > 0}
            {inactiveCount}
            {inactiveCount === 1 ? "equipo no visible" : "equipos no visibles"} (inactivos u ocultos).
            Pulsa el icono del ojo para mostrarlos.
          {:else}
            No se encontraron equipos
          {/if}
        </p>
      </div>
    {/if}
  </div>

  {#if $systemAdminStore.isAdmin}
    <button class="fab" aria-label="Crear equipo" onclick={handleCreateTeam}>
      <Plus size={30} />
    </button>
  {/if}
</div>

<style>
  .teams-page {
    padding: 24px 20px var(--bottom-nav-clearance);
    padding-top: var(--page-top-safe);
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background: var(--bg-page);
  }

  header {
    margin-bottom: 24px;
  }

  .search-row {
    display: flex;
    gap: 10px;
    align-items: stretch;
  }

  .search-container {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    background: var(--bg-card);
    padding: 12px 16px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
    transition: all 0.3s ease;
  }

  .search-container:focus-within {
    border-color: var(--accent-color);
  }

  .visibility-toggle {
    position: relative;
    width: 52px;
    height: auto;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    color: var(--text-primary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-card);
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .visibility-toggle:hover {
    color: var(--accent-color);
  }

  .visibility-toggle.active {
    background: var(--bg-accent-subtle);
    color: var(--accent-strong);
    border-color: var(--accent-color);
  }

  .visibility-toggle .badge {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--danger-color);
    color: #fff;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
  }

  .search-icon {
    display: inline-flex;
    color: var(--text-primary);
    margin-right: 12px;
  }

  input {
    border: none;
    outline: none;
    width: 100%;
    font-size: 16px;
    background: transparent;
    color: var(--text-primary);
    font-weight: 500;
  }
  
  input::placeholder {
    color: var(--text-muted);
  }

  .clear-search {
    background: var(--bg-input);
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 4px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .teams-list {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 8px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .team-card {
    background: var(--bg-card);
    padding: 20px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    box-shadow: var(--shadow-card);
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .team-card.inactive {
    opacity: 0.72;
    border-style: dashed;
  }

  .team-card.hidden {
    opacity: 0.62;
    border-style: dotted;
  }

  .team-card:active {
    transform: scale(0.98);
  }

  .team-icon {
    width: 56px;
    height: 56px;
    background: var(--bg-accent-subtle);
    color: var(--accent-ink);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 16px;
  }
  .team-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 14px;
  }
  .team-info {
    flex: 1;
  }

  .team-info h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .team-info p {
    margin: 4px 0 0;
    font-size: 14px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .status-tag {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    margin-left: 4px;
  }

  .status-tag.inactive {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .status-tag.hidden {
    background: var(--bg-input);
    color: var(--text-secondary);
  }

  .chevron {
    display: inline-flex;
    color: var(--text-primary);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding-top: 60px;
    color: var(--text-muted);
    gap: 16px;
  }

  .fab {
    position: fixed;
    bottom: var(--floating-action-bottom);
    right: 24px;
    width: 60px;
    height: 60px;
    background: var(--accent-strong);
    color: #ffffff;
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 80;
  }

  .fab:active {
    transform: scale(0.9);
  }

  .fab:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
</style>
