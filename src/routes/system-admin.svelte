<script>
  import {
    BadgeCheck,
    CalendarDays,
    ChevronLeft,
    CircleSlash,
    KeyRound,
    Mail,
    RefreshCw,
    ShieldCheck,
    Users
  } from "lucide-svelte";
  import TitleHeader from "../components/TitleHeader.svelte";
  import Toast from "../components/Toast.svelte";
  import { navigateTo } from "../router.js";
  import {
    adminTeamsStore,
    createTeamAccessCode,
    getUserProfile,
    subscribeToAdminTeams,
    subscribeToTeamAccessCodes,
    systemAdminStore,
    teamAccessCodesStore,
    updateTeamBillingDate
  } from "../data/stores.js";

  let expiresAt = $state(defaultExpirationDate());
  let generatedCode = $state("");
  let creatingCode = $state(false);
  let savingTeamId = $state("");
  let billingInputs = $state({});
  let adminProfiles = $state({});
  let toastMessage = $state("");
  let toastType = $state("success");
  let showToast = $state(false);
  const quickCodeOptions = [
    { label: "1 mes", months: 1 },
    { label: "3 meses", months: 3 },
    { label: "6 meses", months: 6 },
    { label: "1 año", months: 12 }
  ];

  let codeStats = $derived.by(() => {
    const stats = { total: 0, available: 0, used: 0, expired: 0 };
    for (const code of $teamAccessCodesStore) {
      stats.total += 1;
      const status = getAccessCodeStatus(code);
      stats[status] += 1;
    }
    return stats;
  });

  $effect(() => {
    if (!$systemAdminStore.isAdmin) return;
    const unsubscribeCodes = subscribeToTeamAccessCodes();
    const unsubscribeTeams = subscribeToAdminTeams();

    return () => {
      unsubscribeCodes?.();
      unsubscribeTeams?.();
    };
  });

  $effect(() => {
    const nextInputs = { ...billingInputs };
    let changed = false;

    for (const team of $adminTeamsStore) {
      if (!Object.prototype.hasOwnProperty.call(nextInputs, team.id)) {
        nextInputs[team.id] = toDateInput(team.billingDate);
        changed = true;
      }
    }

    if (changed) billingInputs = nextInputs;
  });

  $effect(() => {
    if (!$systemAdminStore.isAdmin) return;
    const missingAdminIds = [
      ...new Set(
        $adminTeamsStore
          .map((team) => team.admin)
          .filter((adminId) => adminId && !adminProfiles[adminId])
      )
    ];

    if (missingAdminIds.length > 0) {
      void loadAdminProfiles(missingAdminIds);
    }
  });

  async function loadAdminProfiles(adminIds) {
    const entries = await Promise.all(
      adminIds.map(async (adminId) => [adminId, await getUserProfile(adminId)])
    );

    const nextProfiles = { ...adminProfiles };
    for (const [adminId, profile] of entries) {
      nextProfiles[adminId] = profile || { id: adminId };
    }
    adminProfiles = nextProfiles;
  }

  async function handleCreateCode(customExpiresAt = expiresAt) {
    creatingCode = true;
    generatedCode = "";

    try {
      const code = await createTeamAccessCode({ expiresAt: customExpiresAt });
      expiresAt = customExpiresAt;
      generatedCode = code.code;
      toastType = "success";
      toastMessage = "Código creado correctamente";
      showToast = true;
    } catch (error) {
      toastType = "error";
      toastMessage = error?.message || "No se pudo crear el código";
      showToast = true;
    } finally {
      creatingCode = false;
    }
  }

  function handleCreateQuickCode(months) {
    const quickExpiresAt = getExpirationDateFromMonths(months);
    void handleCreateCode(quickExpiresAt);
  }

  async function handleSaveBillingDate(teamId) {
    savingTeamId = teamId;

    try {
      await updateTeamBillingDate(teamId, billingInputs[teamId] || "");
      toastType = "success";
      toastMessage = "Fecha de cobro actualizada";
      showToast = true;
    } catch (error) {
      toastType = "error";
      toastMessage = error?.message || "No se pudo actualizar la fecha";
      showToast = true;
    } finally {
      savingTeamId = "";
    }
  }

  function getAdminEmail(team) {
    return team.adminEmail || adminProfiles[team.admin]?.email || team.admin || "Sin admin";
  }

  function getAccessCodeStatus(code) {
    if (code?.used) return "used";
    const expiration = toDate(code?.expiresAt);
    if (expiration && expiration.getTime() < Date.now()) return "expired";
    return "available";
  }

  function getAccessCodeStatusLabel(code) {
    const status = getAccessCodeStatus(code);
    if (status === "used") return "Usado";
    if (status === "expired") return "Caducado";
    return "Disponible";
  }

  function defaultExpirationDate() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return toDateInput(date);
  }

  function getExpirationDateFromMonths(months) {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return toDateInput(date);
  }

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000);

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function toDateInput(value) {
    const date = toDate(value);
    if (!date) {
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDate(value) {
    const date = toDate(value);
    if (!date) return "Sin fecha";
    return new Intl.DateTimeFormat("es", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function formatTeamBillingDate(team) {
    if (!team.billingDate) return "Sin fecha de cobro";
    return formatDate(team.billingDate);
  }
</script>

<div class="admin-page">
  <Toast message={toastMessage} type={toastType} bind:show={showToast} />

  <header class="admin-header">
    <button type="button" class="back-button" onclick={() => navigateTo("/settings")}>
      <ChevronLeft size={20} />
      <span>Volver</span>
    </button>
    <TitleHeader title="Panel admin" description="Códigos y cobros" icon={ShieldCheck} iconPosition="right" />
  </header>

  {#if $systemAdminStore.loading}
    <section class="state-panel">
      <RefreshCw size={28} />
      <p>Cargando acceso...</p>
    </section>
  {:else if !$systemAdminStore.isAdmin}
    <section class="state-panel denied">
      <CircleSlash size={32} />
      <h2>Sin acceso</h2>
      <p>Tu usuario no está configurado como administrador del sistema.</p>
    </section>
  {:else}
    <section class="summary-grid" aria-label="Resumen de códigos">
      <article class="summary-card">
        <span>Total</span>
        <strong>{codeStats.total}</strong>
      </article>
      <article class="summary-card available">
        <span>Disponibles</span>
        <strong>{codeStats.available}</strong>
      </article>
      <article class="summary-card used">
        <span>En uso</span>
        <strong>{codeStats.used}</strong>
      </article>
      <article class="summary-card expired">
        <span>Caducados</span>
        <strong>{codeStats.expired}</strong>
      </article>
    </section>

    <section class="admin-section">
      <div class="section-heading">
        <div>
          <h2>Generar código</h2>
          <p>Código de 8 dígitos para crear un equipo.</p>
        </div>
      </div>

      <div class="create-code-form">
        <div class="quick-actions" aria-label="Generar códigos rápidos">
          {#each quickCodeOptions as option}
            <button
              type="button"
              class="quick-action"
              onclick={() => handleCreateQuickCode(option.months)}
              disabled={creatingCode}
            >
              <CalendarDays size={16} />
              <span>{option.label}</span>
            </button>
          {/each}
        </div>

        <label for="expires-at">Fecha de caducidad</label>
        <div class="form-row">
          <div class="input-wrapper">
            <CalendarDays size={18} />
            <input id="expires-at" type="date" bind:value={expiresAt} disabled={creatingCode} />
          </div>
          <button type="button" class="primary-action" onclick={() => handleCreateCode()} disabled={creatingCode}>
            {#if creatingCode}
              <RefreshCw size={18} />
              <span>Generando</span>
            {:else}
              <KeyRound size={18} />
              <span>Generar</span>
            {/if}
          </button>
        </div>

        {#if generatedCode}
          <div class="generated-code">
            <span>Nuevo código</span>
            <strong>{generatedCode}</strong>
          </div>
        {/if}
      </div>
    </section>

    <section class="admin-section">
      <div class="section-heading">
        <div>
          <h2>Códigos</h2>
          <p>{codeStats.available} disponibles, {codeStats.used} usados.</p>
        </div>
      </div>

      <div class="code-list">
        {#if $teamAccessCodesStore.length === 0}
          <article class="empty-card">No hay códigos creados.</article>
        {:else}
          {#each $teamAccessCodesStore as code (code.id)}
            {@const status = getAccessCodeStatus(code)}
            <article class="code-card {status}">
              <div class="code-main">
                <span class="code-value">{code.code}</span>
                <span class="status-pill">{getAccessCodeStatusLabel(code)}</span>
              </div>
              <dl>
                <div>
                  <dt>Caduca</dt>
                  <dd>{formatDate(code.expiresAt)}</dd>
                </div>
                <div>
                  <dt>Código único</dt>
                  <dd>{code.uniqueCode || "-"}</dd>
                </div>
                {#if code.used}
                  <div>
                    <dt>Equipo</dt>
                    <dd>{code.usedTeamName || code.usedTeamId || "-"}</dd>
                  </div>
                  <div>
                    <dt>Usado por</dt>
                    <dd>{code.usedByEmail || code.usedBy || "-"}</dd>
                  </div>
                {/if}
              </dl>
            </article>
          {/each}
        {/if}
      </div>
    </section>

    <section class="admin-section">
      <div class="section-heading">
        <div>
          <h2>Equipos</h2>
          <p>{$adminTeamsStore.length} equipos registrados.</p>
        </div>
      </div>

      <div class="teams-table">
        {#if $adminTeamsStore.length === 0}
          <article class="empty-card">No hay equipos registrados.</article>
        {:else}
          {#each $adminTeamsStore as team (team.id)}
            <article class="team-row">
              <div class="team-meta">
                <div class="team-icon">
                  <Users size={20} />
                </div>
                <div>
                  <h3>{team.name || team.team || "Equipo sin nombre"}</h3>
                  <p>
                    <Mail size={14} />
                    <span>{getAdminEmail(team)}</span>
                  </p>
                  <small>{formatTeamBillingDate(team)}</small>
                </div>
              </div>

              <div class="billing-editor">
                <input
                  type="date"
                  value={billingInputs[team.id] || ""}
                  disabled={savingTeamId === team.id}
                  onchange={(event) => (billingInputs[team.id] = event.currentTarget.value)}
                  aria-label={`Fecha de cobro de ${team.name || team.team || "equipo"}`}
                />
                <button
                  type="button"
                  class="icon-action"
                  onclick={() => handleSaveBillingDate(team.id)}
                  disabled={savingTeamId === team.id}
                  aria-label="Guardar fecha de cobro"
                >
                  {#if savingTeamId === team.id}
                    <RefreshCw size={18} />
                  {:else}
                    <BadgeCheck size={18} />
                  {/if}
                </button>
              </div>
            </article>
          {/each}
        {/if}
      </div>
    </section>
  {/if}
</div>

<style>
  .admin-page {
    min-height: 100%;
    padding: 22px 18px var(--bottom-nav-clearance);
    padding-top: var(--page-top-safe);
    background: var(--bg-page);
    overflow-y: auto;
  }

  .admin-header {
    max-width: 920px;
    margin: 0 auto 22px;
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

  .summary-grid,
  .admin-section,
  .state-panel {
    max-width: 920px;
    margin-left: auto;
    margin-right: auto;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 24px;
  }

  .summary-card {
    min-height: 92px;
    padding: 16px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .summary-card span {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 700;
  }

  .summary-card strong {
    font-size: 28px;
    color: var(--text-primary);
  }

  .summary-card.available {
    border-color: color-mix(in srgb, var(--success-color) 25%, var(--border-color));
  }

  .summary-card.used {
    border-color: color-mix(in srgb, var(--info-color) 25%, var(--border-color));
  }

  .summary-card.expired {
    border-color: color-mix(in srgb, var(--warning-color) 25%, var(--border-color));
  }

  .admin-section {
    margin-bottom: 30px;
  }

  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 16px;
    margin-bottom: 12px;
  }

  .section-heading h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
  }

  .section-heading p {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .create-code-form {
    padding: 18px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
  }

  .create-code-form label {
    display: block;
    margin-bottom: 8px;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 800;
  }

  .quick-actions {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 16px;
  }

  .quick-action {
    min-height: 42px;
    padding: 0 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 800;
  }

  .quick-action:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .form-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
  }

  .input-wrapper {
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-secondary);
  }

  .input-wrapper input,
  .billing-editor input {
    width: 100%;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-primary);
    font-weight: 700;
  }

  .primary-action,
  .icon-action {
    border: none;
    background: var(--accent-strong);
    color: var(--bg-card);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-weight: 800;
  }

  .primary-action {
    min-height: 48px;
    padding: 0 18px;
    border-radius: var(--radius-sm);
  }

  .primary-action:disabled,
  .icon-action:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .generated-code {
    margin-top: 14px;
    padding: 14px;
    border-radius: var(--radius-sm);
    background: var(--bg-accent-subtle);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .generated-code span {
    color: var(--accent-ink);
    font-size: 13px;
    font-weight: 800;
  }

  .generated-code strong {
    color: var(--accent-ink);
    font-size: 24px;
    letter-spacing: 0;
  }

  .code-list,
  .teams-table {
    display: grid;
    gap: 10px;
  }

  .code-card,
  .team-row,
  .empty-card,
  .state-panel {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
  }

  .code-card {
    padding: 16px;
  }

  .code-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .code-value {
    color: var(--text-primary);
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 0;
  }

  .status-pill {
    min-height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    background: var(--bg-input);
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    font-size: 12px;
    font-weight: 800;
  }

  .code-card.available .status-pill {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }

  .code-card.used .status-pill {
    background: var(--bg-info-subtle);
    color: var(--info-color);
  }

  .code-card.expired .status-pill {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 0;
  }

  dt {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  dd {
    margin: 3px 0 0;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .team-row {
    padding: 14px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
  }

  .team-meta {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .team-icon {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    border-radius: var(--radius-sm);
    background: var(--bg-accent-subtle);
    color: var(--accent-ink);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .team-meta h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 800;
  }

  .team-meta p,
  .team-meta small {
    margin: 3px 0 0;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .team-meta p span {
    overflow-wrap: anywhere;
  }

  .billing-editor {
    display: grid;
    grid-template-columns: 150px 44px;
    gap: 8px;
    align-items: center;
  }

  .billing-editor input {
    min-height: 44px;
    padding: 0 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
  }

  .icon-action {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-sm);
  }

  .empty-card,
  .state-panel {
    padding: 24px;
    color: var(--text-secondary);
    text-align: center;
    font-weight: 700;
  }

  .state-panel {
    min-height: 220px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .state-panel h2 {
    margin: 0;
    font-size: 20px;
  }

  .state-panel p {
    margin: 0;
  }

  @media (max-width: 760px) {
    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .quick-actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .form-row,
    .team-row {
      grid-template-columns: 1fr;
    }

    .billing-editor {
      grid-template-columns: minmax(0, 1fr) 44px;
    }
  }

  @media (max-width: 460px) {
    .summary-grid {
      grid-template-columns: 1fr;
    }

    dl {
      grid-template-columns: 1fr;
    }
  }
</style>
