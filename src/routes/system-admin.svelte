<script>
  import {
    ArrowRight,
    BarChart3,
    ChevronLeft,
    CircleSlash,
    DollarSign,
    KeyRound,
    Plus,
    ReceiptText,
    RefreshCw,
    Search,
    ShieldCheck,
    UserRound,
    Users,
    WalletCards,
    X,
  } from "lucide-svelte";
  import TitleHeader from "../components/TitleHeader.svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import { navigateTo } from "../router.js";
  import {
    adminTeamsStore,
    adminUsersStateStore,
    adminUsersStore,
    getTeamMemberLimitLabel,
    loadAdminUsers,
    setUserPassword,
    subscribeToAdminTeams,
    systemAdminStore,
  } from "../data/stores.js";
  import { confirmAlert, showSuccessAlert } from "../data/alerts.js";
  import { generateSecurePassword, getPasswordStrength } from "../helpers/passwords.js";

  let teamSearch = $state("");
  let userSearch = $state("");
  let showPasswordPanel = $state(false);
  let selectedUser = $state(null);
  let newPassword = $state("");
  let confirmPassword = $state("");
  let passwordError = $state("");
  let isSavingPassword = $state(false);

  let filteredTeams = $derived.by(() => {
    const search = normalizeSearch(teamSearch);
    if (!search) return $adminTeamsStore;

    return $adminTeamsStore.filter((team) =>
      normalizeSearch([
        team.name,
        team.team,
        team.adminEmail,
      ].join(" ")).includes(search),
    );
  });

  let filteredUsers = $derived.by(() => {
    const search = normalizeSearch(userSearch);
    if (!search) return $adminUsersStore;

    return $adminUsersStore.filter((user) =>
      normalizeSearch([
        user.name,
        user.email,
        user.uid,
      ].join(" ")).includes(search),
    );
  });

  let passwordStrength = $derived(getPasswordStrength(newPassword));

  let summary = $derived.by(() => {
    const teams = $adminTeamsStore;
    return {
      teams: teams.length,
      members: teams.reduce(
        (total, team) => total + (Array.isArray(team.members) ? team.members.length : 0),
        0,
      ),
      users: $adminUsersStore.length,
    };
  });

  $effect(() => {
    if (!$systemAdminStore.isAdmin) return;
    return subscribeToAdminTeams();
  });

  $effect(() => {
    if (!$systemAdminStore.isAdmin) return;
    reloadUsers();
  });

  async function reloadUsers() {
    try {
      await loadAdminUsers();
    } catch (error) {
      console.error("Error loading admin users:", error);
    }
  }

  function openPasswordPanel(user) {
    selectedUser = user;
    newPassword = "";
    confirmPassword = "";
    passwordError = "";
    showPasswordPanel = true;
  }

  function closePasswordPanel() {
    showPasswordPanel = false;
    selectedUser = null;
    newPassword = "";
    confirmPassword = "";
    passwordError = "";
  }

  function fillGeneratedPassword() {
    newPassword = generateSecurePassword();
    confirmPassword = newPassword;
    passwordError = "";
  }

  async function savePassword() {
    if (isSavingPassword || !selectedUser) return;
    passwordError = "";

    if (newPassword !== confirmPassword) {
      passwordError = "Las contraseñas no coinciden.";
      return;
    }

    const target = selectedUser;

    const confirmed = await confirmAlert({
      title: "Cambiar la contraseña",
      text: `Se asignará una contraseña nueva a ${getUserDisplayName(target)}. El usuario tendrá que iniciar sesión de nuevo con ella.`,
      confirmButtonText: "Sí, cambiar",
      danger: true,
    });
    if (!confirmed) return;

    isSavingPassword = true;

    try {
      await setUserPassword(target.uid, newPassword);
      isSavingPassword = false;
      closePasswordPanel();
      showSuccessAlert(
        "Contraseña actualizada",
        `La contraseña de ${getUserDisplayName(target)} se ha cambiado correctamente.`,
      );
      await reloadUsers();
    } catch (error) {
      console.error("Error changing user password:", error);
      passwordError = error.message || "No se pudo cambiar la contraseña.";
    } finally {
      isSavingPassword = false;
    }
  }

  function getUserDisplayName(user) {
    return user?.name || user?.email || "Usuario";
  }

  function getUserProviderLabel(user) {
    if (user?.hasPassword) return "Correo y contraseña";
    if ((user?.providers || []).includes("google.com")) return "Google";
    return "Sin acceso";
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

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
        <span>Usuarios</span>
        <strong>{summary.users}</strong>
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
                  </p>
                  <small>{getTeamMemberLimitLabel(team)}</small>
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

    <section class="users-section">
      <div class="section-heading">
        <div>
          <h2>Usuarios</h2>
          <p>{filteredUsers.length} de {$adminUsersStore.length} usuarios</p>
        </div>
        <div class="team-search">
          <Search size={18} />
          <input
            type="search"
            bind:value={userSearch}
            placeholder="Buscar usuario"
            aria-label="Buscar usuario"
          />
          {#if userSearch}
            <button type="button" onclick={() => (userSearch = "")} aria-label="Limpiar búsqueda">
              <X size={16} />
            </button>
          {/if}
        </div>
      </div>

      <div class="user-list">
        {#if $adminUsersStateStore.loading}
          <article class="empty-card compact">
            <span class="spin"><RefreshCw size={26} /></span>
            <p>Cargando usuarios...</p>
          </article>
        {:else if $adminUsersStateStore.error}
          <article class="empty-card compact">
            <CircleSlash size={28} />
            <p>{$adminUsersStateStore.error}</p>
            <button type="button" onclick={reloadUsers}>
              <RefreshCw size={16} />
              <span>Reintentar</span>
            </button>
          </article>
        {:else if $adminUsersStore.length === 0}
          <article class="empty-card compact">
            <UserRound size={30} />
            <p>Aún no hay usuarios registrados en la aplicación.</p>
          </article>
        {:else if filteredUsers.length === 0}
          <article class="empty-card compact">
            <Search size={30} />
            <p>No hay usuarios que coincidan con la búsqueda.</p>
          </article>
        {:else}
          {#each filteredUsers as user (user.uid)}
            <article class="user-card">
              <div class="user-avatar">
                {#if user.photoURL}
                  <img src={user.photoURL} alt="" />
                {:else}
                  <UserRound size={20} />
                {/if}
              </div>
              <div class="user-title">
                <h3>
                  {getUserDisplayName(user)}
                  {#if user.isSelf}
                    <span class="user-tag self">tú</span>
                  {/if}
                </h3>
                <p>{user.email || "Sin email"}</p>
                <div class="user-tags">
                  <span class="user-tag">{getUserProviderLabel(user)}</span>
                  {#if user.disabled}
                    <span class="user-tag disabled">Cuenta deshabilitada</span>
                  {/if}
                  {#if user.passwordUpdatedAt}
                    <span class="user-tag">Cambiada: {formatDate(user.passwordUpdatedAt)}</span>
                  {/if}
                </div>
              </div>
              <button
                type="button"
                class="password-action"
                onclick={() => openPasswordPanel(user)}
              >
                <KeyRound size={16} />
                <span>Cambiar contraseña</span>
              </button>
            </article>
          {/each}
        {/if}
      </div>
    </section>
  {/if}

  <SliceContainer bind:show={showPasswordPanel}>
    <div class="password-panel" role="dialog" aria-modal="true" aria-labelledby="password-panel-title">
      <div class="panel-header">
        <h2 id="password-panel-title">Cambiar contraseña</h2>
        <button type="button" class="panel-close" onclick={closePasswordPanel} aria-label="Cerrar">
          <X size={20} />
        </button>
      </div>

      {#if selectedUser}
        <p class="panel-subject">
          <strong>{getUserDisplayName(selectedUser)}</strong>
          <span>{selectedUser.email}</span>
        </p>
      {/if}

      <label for="admin-new-password">Nueva contraseña</label>
      <div class="password-field">
        <input
          id="admin-new-password"
          type="password"
          bind:value={newPassword}
          autocomplete="new-password"
          placeholder="Mínimo 8 caracteres"
        />
        <button type="button" onclick={fillGeneratedPassword} aria-label="Generar una contraseña">
          <KeyRound size={16} />
        </button>
      </div>

      {#if newPassword}
        <p class="strength">Robustez: {passwordStrength.label}</p>
      {/if}

      <label for="admin-confirm-password">Repite la contraseña</label>
      <input
        id="admin-confirm-password"
        type="password"
        bind:value={confirmPassword}
        autocomplete="new-password"
        placeholder="Repite la contraseña"
      />

      {#if passwordError}
        <p class="form-error">{passwordError}</p>
      {/if}

      <p class="panel-hint">
        Al guardar, el usuario tendrá que iniciar sesión de nuevo con la contraseña nueva.
        Comunícale la contraseña por un canal seguro.
      </p>

      <button
        type="button"
        class="save-btn"
        onclick={savePassword}
        disabled={isSavingPassword || !newPassword}
      >
        {isSavingPassword ? "Guardando..." : "Guardar contraseña"}
      </button>
    </div>
  </SliceContainer>
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
  .users-section,
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
  .users-section,
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

  .users-section {
    margin-top: 14px;
    margin-bottom: 28px;
    padding: 22px;
  }

  .user-list {
    display: grid;
    gap: 12px;
  }

  .user-card {
    padding: 16px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-page);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 13px;
  }

  .user-avatar {
    width: 48px;
    height: 48px;
    border-radius: 15px;
    background: var(--accent-color);
    color: var(--accent-ink);
    display: grid;
    place-items: center;
    overflow: hidden;
  }

  .user-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .user-title {
    min-width: 0;
  }

  .user-title h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 7px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-title p {
    margin: 3px 0 0;
    color: var(--text-secondary);
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-tags {
    margin-top: 7px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .user-tag {
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.02em;
  }

  .user-tag.self {
    background: var(--accent-color);
    color: var(--accent-ink);
    border-color: transparent;
  }

  .user-tag.disabled {
    color: #dc2626;
  }

  .password-action {
    min-height: 40px;
    padding: 0 13px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
  }

  .password-action:hover {
    border-color: var(--accent-strong);
    color: var(--accent-strong);
  }

  .password-panel {
    width: min(100%, 520px);
    margin-inline: auto;
    padding: 6px 18px 28px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .panel-header h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: 19px;
  }

  .panel-close {
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 50%;
    background: var(--bg-page);
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .panel-subject {
    margin: 0;
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    background: var(--bg-page);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .panel-subject strong {
    color: var(--text-primary);
    font-size: 15px;
  }

  .panel-subject span {
    color: var(--text-secondary);
    font-size: 13px;
  }

  .password-panel label {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 800;
  }

  .password-panel input {
    min-height: 46px;
    padding: 0 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    font: inherit;
    width: 100%;
    box-sizing: border-box;
  }

  .password-panel input:focus {
    outline: 0;
    border-color: var(--accent-strong);
  }

  .password-field {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .password-field button {
    flex: 0 0 auto;
    width: 46px;
    height: 46px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .strength {
    margin: 0;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
  }

  .form-error {
    margin: 0;
    color: #dc2626;
    font-size: 13px;
    font-weight: 700;
  }

  .panel-hint {
    margin: 2px 0 4px;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }

  .save-btn {
    min-height: 50px;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--accent-strong);
    color: white;
    font-weight: 900;
    cursor: pointer;
  }

  .save-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
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

    .user-card {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .password-action {
      grid-column: 1 / -1;
      justify-content: center;
    }
  }

  @media (max-width: 520px) {
    .summary-grid {
      grid-template-columns: 1fr;
    }

    .hero-panel,
    .teams-section,
    .users-section {
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
