<script>
  import {
    ArrowRight,
    BarChart3,
    ChevronLeft,
    CircleSlash,
    DollarSign,
    Plus,
    ReceiptText,
    RefreshCw,
    Search,
    ShieldCheck,
    Users,
    WalletCards,
    X,
  } from "lucide-svelte";
  import TitleHeader from "../components/TitleHeader.svelte";
  import { navigateTo } from "../router.js";
  import {
    adminTeamsStore,
    getTeamMemberLimitLabel,
    getTeamMonthlyPrice,
    getTeamSizeValue,
    subscribeToAdminTeams,
    systemAdminStore,
  } from "../data/stores.js";

  let teamSearch = $state("");

  let filteredTeams = $derived.by(() => {
    const search = normalizeSearch(teamSearch);
    if (!search) return $adminTeamsStore;

    return $adminTeamsStore.filter((team) =>
      normalizeSearch([
        team.name,
        team.team,
        team.adminEmail,
        getTeamSizeValue(team),
      ].join(" ")).includes(search),
    );
  });

  let summary = $derived.by(() => {
    const teams = $adminTeamsStore;
    return {
      teams: teams.length,
      members: teams.reduce(
        (total, team) => total + (Array.isArray(team.members) ? team.members.length : 0),
        0,
      ),
      monthly: teams.reduce((total, team) => total + getTeamMonthlyPrice(team), 0),
    };
  });

  $effect(() => {
    if (!$systemAdminStore.isAdmin) return;
    return subscribeToAdminTeams();
  });

  function normalizeSearch(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  }

  function getTeamName(team) {
    return team.name || team.team || "Equipo sin nombre";
  }

  function getTeamMemberCount(team) {
    return Array.isArray(team.members) ? team.members.length : 0;
  }

  function teamRoute(team, section = "") {
    const base = `/teams/${encodeURIComponent(team.id)}`;
    return section ? `${base}/${section}` : base;
  }

  const teamActions = [
    { section: "stats", label: "Estadísticas", icon: BarChart3 },
    { section: "payments", label: "Pagos", icon: WalletCards },
    { section: "charges", label: "Cobros", icon: DollarSign },
    { section: "expenses", label: "Gastos", icon: ReceiptText },
  ];
</script>

<div class="admin-page">
  <header class="admin-header">
    <button type="button" class="back-button" onclick={() => navigateTo("/settings")}>
      <ChevronLeft size={20} />
      <span>Volver</span>
    </button>
    <TitleHeader
      title="Panel admin"
      description="Equipos y finanzas"
      icon={ShieldCheck}
      iconPosition="right"
    />
  </header>

  {#if $systemAdminStore.loading}
    <section class="state-panel">
      <span class="spin"><RefreshCw size={28} /></span>
      <p>Cargando acceso...</p>
    </section>
  {:else if !$systemAdminStore.isAdmin}
    <section class="state-panel denied">
      <span class="denied-icon"><CircleSlash size={34} /></span>
      <h2>Sin acceso</h2>
      <p>Tu cuenta no está configurada como administradora.</p>
    </section>
  {:else}
    <section class="hero-panel">
      <div>
        <span class="eyebrow">Administración</span>
        <h2>Todos tus equipos, en un solo lugar</h2>
        <p>Consulta estadísticas avanzadas y gestiona pagos, cobros y gastos por equipo.</p>
      </div>
      <button type="button" class="create-action" onclick={() => navigateTo("/teams/create")}>
        <Plus size={20} />
        <span>Crear equipo</span>
      </button>
    </section>

    <section class="summary-grid" aria-label="Resumen de equipos administrados">
      <article>
        <span>Equipos</span>
        <strong>{summary.teams}</strong>
      </article>
      <article>
        <span>Miembros</span>
        <strong>{summary.members}</strong>
      </article>
      <article>
        <span>Planes mensuales</span>
        <strong>{formatCurrency(summary.monthly)}</strong>
      </article>
    </section>

    <section class="teams-section">
      <div class="section-heading">
        <div>
          <h2>Equipos administrados</h2>
          <p>{filteredTeams.length} de {$adminTeamsStore.length} equipos</p>
        </div>
        <div class="team-search">
          <Search size={18} />
          <input
            type="search"
            bind:value={teamSearch}
            placeholder="Buscar equipo"
            aria-label="Buscar equipo"
          />
          {#if teamSearch}
            <button type="button" onclick={() => (teamSearch = "")} aria-label="Limpiar búsqueda">
              <X size={16} />
            </button>
          {/if}
        </div>
      </div>

      <div class="team-list">
        {#if $adminTeamsStore.length === 0}
          <article class="empty-card">
            <Users size={34} />
            <h3>Aún no administras equipos</h3>
            <p>Crea el primero para empezar a organizar el trabajo.</p>
            <button type="button" onclick={() => navigateTo("/teams/create")}>
              <Plus size={18} />
              <span>Crear equipo</span>
            </button>
          </article>
        {:else if filteredTeams.length === 0}
          <article class="empty-card compact">
            <Search size={30} />
            <p>No hay equipos que coincidan con la búsqueda.</p>
          </article>
        {:else}
          {#each filteredTeams as team (team.id)}
            <article class="team-card">
              <div class="team-heading">
                <div class="team-avatar">
                  <Users size={22} />
                </div>
                <div class="team-title">
                  <h3>{getTeamName(team)}</h3>
                  <p>
                    {getTeamMemberCount(team)}
                    {getTeamMemberCount(team) === 1 ? "miembro" : "miembros"}
                    <span aria-hidden="true">·</span>
                    Plan {getTeamSizeValue(team)}
                  </p>
                  <small>{getTeamMemberLimitLabel(team)} · {formatCurrency(getTeamMonthlyPrice(team))}/mes</small>
                </div>
                <a class="open-team" href={teamRoute(team)} aria-label={`Abrir ${getTeamName(team)}`}>
                  <span>Equipo</span>
                  <ArrowRight size={18} />
                </a>
              </div>

              <nav class="team-actions" aria-label={`Administrar ${getTeamName(team)}`}>
                {#each teamActions as action}
                  {@const ActionIcon = action.icon}
                  <a href={teamRoute(team, action.section)}>
                    <ActionIcon size={19} />
                    <span>{action.label}</span>
                    <span class="action-arrow"><ArrowRight size={15} /></span>
                  </a>
                {/each}
              </nav>
            </article>
          {/each}
        {/if}
      </div>
    </section>
  {/if}
</div>

<style>
  .admin-page {
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    padding: var(--page-top-safe) 18px var(--bottom-nav-clearance);
    background: var(--bg-page);
  }

  .admin-header,
  .hero-panel,
  .summary-grid,
  .teams-section,
  .state-panel {
    width: min(100%, 980px);
    margin-inline: auto;
    box-sizing: border-box;
  }

  .admin-header {
    margin-bottom: 20px;
  }

  .back-button {
    min-height: 42px;
    margin-bottom: 16px;
    padding: 0 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: var(--shadow-card);
  }

  .hero-panel,
  .teams-section,
  .state-panel {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
  }

  .hero-panel {
    padding: 26px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 22px;
    background:
      radial-gradient(circle at 92% 10%, color-mix(in srgb, var(--accent-color) 28%, transparent), transparent 42%),
      var(--bg-card);
  }

  .eyebrow {
    color: var(--accent-strong);
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .hero-panel h2,
  .section-heading h2,
  .state-panel h2,
  .empty-card h3,
  .team-title h3 {
    margin: 0;
    color: var(--text-primary);
  }

  .hero-panel h2 {
    margin-top: 7px;
    font-size: clamp(22px, 4vw, 31px);
  }

  .hero-panel p,
  .section-heading p,
  .state-panel p,
  .empty-card p,
  .team-title p,
  .team-title small {
    color: var(--text-secondary);
  }

  .hero-panel p {
    margin: 9px 0 0;
    max-width: 580px;
    line-height: 1.5;
  }

  .create-action,
  .empty-card button {
    flex: 0 0 auto;
    min-height: 48px;
    padding: 0 18px;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--accent-strong);
    color: white;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-weight: 900;
    cursor: pointer;
  }

  .summary-grid {
    margin-top: 14px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .summary-grid article {
    min-height: 92px;
    padding: 18px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
    box-shadow: var(--shadow-card);
  }

  .summary-grid span {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 700;
  }

  .summary-grid strong {
    color: var(--text-primary);
    font-size: 24px;
  }

  .teams-section {
    margin-top: 14px;
    margin-bottom: 28px;
    padding: 22px;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }

  .section-heading p {
    margin: 5px 0 0;
    font-size: 13px;
  }

  .team-search {
    min-height: 44px;
    width: min(100%, 300px);
    padding: 0 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .team-search:focus-within {
    border-color: var(--accent-strong);
  }

  .team-search input {
    min-width: 0;
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
  }

  .team-search button {
    padding: 5px;
    border: 0;
    border-radius: 50%;
    background: var(--bg-card);
    color: var(--text-secondary);
    display: inline-flex;
    cursor: pointer;
  }

  .team-list {
    display: grid;
    gap: 12px;
  }

  .team-card {
    padding: 18px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-page);
  }

  .team-heading {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 13px;
  }

  .team-avatar {
    width: 48px;
    height: 48px;
    border-radius: 15px;
    background: var(--accent-color);
    color: var(--accent-ink);
    display: grid;
    place-items: center;
  }

  .team-title {
    min-width: 0;
  }

  .team-title h3 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 17px;
  }

  .team-title p {
    margin: 4px 0 2px;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    font-size: 13px;
  }

  .team-title small {
    font-size: 12px;
  }

  .open-team {
    min-height: 40px;
    padding: 0 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    font-weight: 800;
    text-decoration: none;
  }

  .team-actions {
    margin-top: 15px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .team-actions a {
    min-height: 45px;
    padding: 0 11px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    font-weight: 800;
    text-decoration: none;
  }

  .action-arrow {
    margin-left: auto;
    color: var(--text-muted);
    display: inline-flex;
  }

  .team-actions a:hover,
  .open-team:hover {
    border-color: var(--accent-strong);
    color: var(--accent-strong);
  }

  .empty-card,
  .state-panel {
    min-height: 260px;
    padding: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .empty-card {
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
  }

  .empty-card.compact {
    min-height: 150px;
  }

  .empty-card h3 {
    margin-top: 12px;
  }

  .empty-card p,
  .state-panel p {
    margin: 7px 0 0;
  }

  .empty-card button {
    margin-top: 18px;
  }

  .denied-icon {
    color: #dc2626;
    display: inline-flex;
  }

  .state-panel h2 {
    margin-top: 12px;
  }

  .spin {
    display: inline-flex;
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 760px) {
    .hero-panel,
    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .create-action,
    .team-search {
      width: 100%;
      box-sizing: border-box;
    }

    .team-actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 520px) {
    .summary-grid {
      grid-template-columns: 1fr;
    }

    .hero-panel,
    .teams-section {
      padding: 18px;
    }

    .team-heading {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .open-team {
      grid-column: 1 / -1;
      justify-content: center;
    }

    .team-actions {
      grid-template-columns: 1fr;
    }
  }
</style>
