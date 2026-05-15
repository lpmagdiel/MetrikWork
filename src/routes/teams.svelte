<script>
  import { Search, Plus, Users, ChevronRight, X } from "lucide-svelte";
  import { teamsStore, createTeam, selectedTeamId } from "../data/stores.js";
  import { navigateTo } from "../router.js";
  import { promptAlert, showErrorAlert } from "../data/alerts.js";

  let searchQuery = $state("");
  let isCreating = $state(false);

  let filteredTeams = $derived(
    $teamsStore.filter((team) =>
      (team.name || team.team || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()),
    ),
  );

  function goToTeam(team) {
    selectedTeamId.set(team.id);
    navigateTo(`/teams/${team.id}`);
  }

  async function handleCreateTeam() {
    const teamName = await promptAlert({
      title: "Nuevo equipo",
      inputLabel: "Nombre del nuevo equipo",
      inputPlaceholder: "Ej. Equipo de obra",
      confirmButtonText: "Crear equipo",
    });
    if (!teamName?.trim()) return;
    isCreating = true;
    try {
      const id = await createTeam(teamName.trim());
      if (id) {
        selectedTeamId.set(id);
        navigateTo(`/teams/${id}`);
      }
    } catch (error) {
      showErrorAlert("Error", "No se pudo crear el equipo");
    } finally {
      isCreating = false;
    }
  }
</script>

<div class="teams-page">
  <header>
    <h1>Equipos</h1>
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
  </header>

  <div class="teams-list">
    {#if filteredTeams.length > 0}
      {#each filteredTeams as team (team.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="team-card" onclick={() => goToTeam(team)}>
        {#if team.photoURL}
          <div class="team-icon">
            <img src={team.photoURL} alt={team.name || team.team} />
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
        <p>No se encontraron equipos</p>
      </div>
    {/if}
  </div>

  <a href="/teams/create">
  <button class="fab" aria-label="Crear equipo">
    <Plus size={30} />
  </button>
  </a>
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

  h1 {
    margin-top: 0;
    margin-bottom: 16px;
    font-size: 28px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .search-container {
    position: relative;
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
