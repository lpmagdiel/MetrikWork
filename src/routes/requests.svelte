<script>
  import {
    CalendarDays,
    Check,
    ClipboardList,
    FileText,
    Inbox,
    Send,
    Users,
    X,
  } from "lucide-svelte";
  import TitleHeader from "../components/TitleHeader.svelte";
  import Toast from "../components/Toast.svelte";
  import {
    ABSENCE_TYPES,
    REQUEST_STATUS,
    createAbsenceRequest,
    getAbsenceRequestsForUser,
    teamsStore,
    updateAbsenceRequestStatus,
    userStore,
  } from "../data/stores.js";

  let activeSection = $state("mine");
  let selectedTeamId = $state("");
  let absenceType = $state(ABSENCE_TYPES[0]?.value || "");
  let startDate = $state(toDateInputValue(new Date()));
  let endDate = $state(toDateInputValue(new Date()));
  let note = $state("");
  let ownRequests = $state([]);
  let incomingRequests = $state([]);
  let isLoading = $state(true);
  let isSaving = $state(false);
  let updatingRequestId = $state(null);
  let showToast = $state(false);
  let toastMessage = $state("");
  let toastType = $state("success");
  let loadRequestId = 0;

  let hasAdminTeams = $derived(
    ($teamsStore || []).some((team) => team.admin === $userStore?.uid),
  );
  let pendingIncomingCount = $derived(
    incomingRequests.filter((request) => request.status === REQUEST_STATUS.pending).length,
  );
  let pendingOwnCount = $derived(
    ownRequests.filter((request) => request.status === REQUEST_STATUS.pending).length,
  );
  let visibleRequests = $derived(
    activeSection === "incoming" ? incomingRequests : ownRequests,
  );
  let canSubmit = $derived(
    Boolean(selectedTeamId && absenceType && startDate && endDate) && !isSaving,
  );

  $effect(() => {
    const teams = $teamsStore || [];
    if (!selectedTeamId && teams.length > 0) {
      selectedTeamId = teams[0].id;
    }
  });

  $effect(() => {
    if (!hasAdminTeams && activeSection === "incoming") {
      activeSection = "mine";
    }
  });

  $effect(() => {
    const uid = $userStore?.uid;
    if (!uid) return;
    loadRequests(uid);
  });

  function toDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function showRequestToast(message, type = "success") {
    toastMessage = message;
    toastType = type;
    showToast = false;
    setTimeout(() => {
      showToast = true;
    }, 0);
  }

  async function loadRequests(uid = $userStore?.uid) {
    if (!uid) return;
    const requestId = ++loadRequestId;
    isLoading = true;

    try {
      const result = await getAbsenceRequestsForUser(uid);
      if (requestId !== loadRequestId) return;
      ownRequests = result.own;
      incomingRequests = result.incoming;
    } catch (error) {
      console.error("Error loading absence requests:", error);
      showRequestToast("No se pudieron cargar las solicitudes.", "error");
    } finally {
      if (requestId === loadRequestId) {
        isLoading = false;
      }
    }
  }

  async function handleCreateRequest(event) {
    event.preventDefault();

    if (!canSubmit) return;
    if (endDate < startDate) {
      showRequestToast("La fecha de fin no puede ser anterior al inicio.", "error");
      return;
    }

    isSaving = true;
    try {
      await createAbsenceRequest({
        teamId: selectedTeamId,
        absenceType,
        startDate,
        endDate,
        note,
      });
      note = "";
      startDate = toDateInputValue(new Date());
      endDate = toDateInputValue(new Date());
      activeSection = "mine";
      showRequestToast("Solicitud enviada al administrador del equipo.");
      await loadRequests();
    } catch (error) {
      console.error("Error creating absence request:", error);
      showRequestToast(error?.message || "No se pudo crear la solicitud.", "error");
    } finally {
      isSaving = false;
    }
  }

  async function handleReviewRequest(request, status) {
    if (request.status !== REQUEST_STATUS.pending || updatingRequestId) return;
    updatingRequestId = request.id;

    try {
      await updateAbsenceRequestStatus(request.id, status);
      showRequestToast(
        status === REQUEST_STATUS.accepted
          ? "Solicitud aceptada."
          : "Solicitud rechazada.",
      );
      await loadRequests();
    } catch (error) {
      console.error("Error updating absence request:", error);
      showRequestToast(error?.message || "No se pudo actualizar la solicitud.", "error");
    } finally {
      updatingRequestId = null;
    }
  }

  function formatDate(dateValue) {
    if (!dateValue) return "";
    const date = new Date(`${dateValue}T00:00:00`);
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function getDateRange(request) {
    if (request.startDate === request.endDate) return formatDate(request.startDate);
    return `${formatDate(request.startDate)} - ${formatDate(request.endDate)}`;
  }

  function getStatusLabel(status) {
    if (status === REQUEST_STATUS.accepted) return "Aceptado";
    if (status === REQUEST_STATUS.rejected) return "Rechazado";
    return "Pendiente";
  }

  function getStatusClass(status) {
    if (status === REQUEST_STATUS.accepted) return "accepted";
    if (status === REQUEST_STATUS.rejected) return "rejected";
    return "pending";
  }
</script>

<div class="requests-page">
  <Toast message={toastMessage} type={toastType} bind:show={showToast} />

  <header class="requests-header">
    <TitleHeader
      title="Solicitudes"
      description="Ausencias y aprobaciones"
      icon={ClipboardList}
      iconPosition="right"
    />
  </header>

  <section class="summary-grid">
    <div class="summary-item">
      <span class="summary-icon mine"><FileText size={19} /></span>
      <div>
        <small>Mis pendientes</small>
        <strong>{pendingOwnCount}</strong>
      </div>
    </div>
    <div class="summary-item">
      <span class="summary-icon admin"><Inbox size={19} /></span>
      <div>
        <small>Por revisar</small>
        <strong>{pendingIncomingCount}</strong>
      </div>
    </div>
  </section>

  <main class="requests-layout">
    <form class="request-panel" onsubmit={handleCreateRequest}>
      <div class="panel-heading">
        <div>
          <span>Nueva solicitud</span>
          <h2>Datos de ausencia</h2>
        </div>
        <Send size={20} />
      </div>

      <label for="request-team">Equipo</label>
      <select id="request-team" bind:value={selectedTeamId} disabled={isSaving || $teamsStore.length === 0}>
        {#if $teamsStore.length === 0}
          <option value="">No tienes equipos disponibles</option>
        {:else}
          {#each $teamsStore as team (team.id)}
            <option value={team.id}>{team.name || team.team || "Equipo sin nombre"}</option>
          {/each}
        {/if}
      </select>

      <label for="absence-type">Tipo de ausencia</label>
      <select id="absence-type" bind:value={absenceType} disabled={isSaving}>
        {#each ABSENCE_TYPES as type (type.value)}
          <option value={type.value}>{type.label}</option>
        {/each}
      </select>

      <div class="date-grid">
        <div>
          <label for="start-date">Fecha de inicio</label>
          <input id="start-date" type="date" bind:value={startDate} disabled={isSaving} />
        </div>
        <div>
          <label for="end-date">Fecha de fin</label>
          <input id="end-date" type="date" bind:value={endDate} disabled={isSaving} />
        </div>
      </div>

      <label for="request-note">Nota o descripción</label>
      <textarea
        id="request-note"
        bind:value={note}
        rows="5"
        placeholder="Agrega contexto para el administrador"
        disabled={isSaving}
      ></textarea>

      <button type="submit" class="submit-btn" disabled={!canSubmit}>
        <Send size={18} />
        <span>{isSaving ? "Enviando" : "Enviar solicitud"}</span>
      </button>
    </form>

    <section class="list-panel">
      <div class="section-tabs" aria-label="Vista de solicitudes">
        <button
          type="button"
          class:active={activeSection === "mine"}
          aria-pressed={activeSection === "mine"}
          onclick={() => (activeSection = "mine")}
        >
          <FileText size={16} />
          <span>Mis solicitudes</span>
        </button>
        {#if hasAdminTeams}
          <button
            type="button"
            class:active={activeSection === "incoming"}
            aria-pressed={activeSection === "incoming"}
            onclick={() => (activeSection = "incoming")}
          >
            <Inbox size={16} />
            <span>Por revisar</span>
          </button>
        {/if}
      </div>

      <div class="requests-list">
        {#if isLoading}
          <div class="empty-state">
            <ClipboardList size={36} />
            <p>Cargando solicitudes...</p>
          </div>
        {:else if visibleRequests.length === 0}
          <div class="empty-state">
            <Inbox size={42} />
            <p>
              {activeSection === "incoming"
                ? "No hay solicitudes por revisar."
                : "Aún no has creado solicitudes."}
            </p>
          </div>
        {:else}
          {#each visibleRequests as request (request.id)}
            <article class="request-card">
              <div class="request-main-row">
                <span class="request-icon">
                  <CalendarDays size={18} />
                </span>
                <div class="request-title">
                  <h3>{request.absenceTypeLabel || "Ausencia"}</h3>
                  <p>
                    {activeSection === "incoming"
                      ? request.requesterName || request.requesterEmail || "Miembro"
                      : request.teamName || "Equipo"}
                  </p>
                </div>
                <span class={`status-pill ${getStatusClass(request.status)}`}>
                  {getStatusLabel(request.status)}
                </span>
              </div>

              <div class="request-meta">
                <span>
                  <CalendarDays size={14} />
                  {getDateRange(request)}
                </span>
                <span>
                  <Users size={14} />
                  {request.teamName || "Equipo"}
                </span>
              </div>

              {#if request.note}
                <p class="request-note">{request.note}</p>
              {/if}

              {#if activeSection === "incoming" && request.status === REQUEST_STATUS.pending}
                <div class="review-actions">
                  <button
                    type="button"
                    class="reject-btn"
                    disabled={updatingRequestId === request.id}
                    onclick={() => handleReviewRequest(request, REQUEST_STATUS.rejected)}
                  >
                    <X size={16} />
                    <span>Rechazar</span>
                  </button>
                  <button
                    type="button"
                    class="accept-btn"
                    disabled={updatingRequestId === request.id}
                    onclick={() => handleReviewRequest(request, REQUEST_STATUS.accepted)}
                  >
                    <Check size={16} />
                    <span>Aceptar</span>
                  </button>
                </div>
              {/if}
            </article>
          {/each}
        {/if}
      </div>
    </section>
  </main>
</div>

<style>
  .requests-page {
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    padding: 24px 20px var(--bottom-nav-clearance);
    padding-top: var(--page-top-safe);
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: var(--bg-page);
    color: var(--text-primary);
  }

  .requests-header,
  .summary-grid,
  .requests-layout {
    width: min(100%, 1040px);
    margin: 0 auto;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .summary-item {
    min-height: 78px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
  }

  .summary-icon,
  .request-icon {
    width: 42px;
    height: 42px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    background: var(--bg-accent-subtle);
    color: var(--accent-ink);
  }

  .summary-icon.admin {
    background: var(--bg-info-subtle);
    color: var(--info-color);
  }

  .summary-item small {
    display: block;
    margin-bottom: 2px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
  }

  .summary-item strong {
    font-size: 24px;
    line-height: 1;
  }

  .requests-layout {
    display: grid;
    grid-template-columns: minmax(280px, 0.9fr) minmax(320px, 1.1fr);
    gap: 14px;
    align-items: start;
  }

  .request-panel,
  .list-panel {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
  }

  .request-panel {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 4px;
  }

  .panel-heading span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .panel-heading h2 {
    margin: 2px 0 0;
    font-size: 18px;
    line-height: 1.15;
  }

  label {
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 700;
  }

  input,
  select,
  textarea {
    width: 100%;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.18s ease, box-shadow 0.18s ease;
  }

  input,
  select {
    min-height: 46px;
    padding: 0 12px;
  }

  textarea {
    min-height: 112px;
    padding: 12px;
    resize: vertical;
    line-height: 1.45;
  }

  input:focus,
  select:focus,
  textarea:focus {
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 22%, transparent);
  }

  input:disabled,
  select:disabled,
  textarea:disabled,
  button:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .date-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .date-grid > div {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .submit-btn,
  .section-tabs button,
  .review-actions button {
    min-height: 44px;
    border: none;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
  }

  .submit-btn {
    margin-top: 2px;
    background: var(--accent-strong);
    color: var(--bg-card);
  }

  :global(:root.dark) .submit-btn {
    color: #000000;
  }

  .list-panel {
    overflow: hidden;
  }

  .section-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 12px;
    border-bottom: 1px solid var(--border-color);
  }

  .section-tabs button {
    background: var(--bg-input);
    color: var(--text-secondary);
  }

  .section-tabs button.active {
    background: var(--accent-color);
    color: var(--accent-ink);
  }

  .requests-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }

  .request-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card-raised);
  }

  .request-main-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .request-title {
    flex: 1;
    min-width: 0;
  }

  .request-title h3,
  .request-title p,
  .request-note {
    margin: 0;
  }

  .request-title h3 {
    font-size: 16px;
    line-height: 1.2;
  }

  .request-title p {
    margin-top: 2px;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 700;
  }

  .status-pill {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 900;
  }

  .status-pill.pending {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .status-pill.accepted {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }

  .status-pill.rejected {
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
  }

  .request-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .request-meta span {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 9px;
    border-radius: 999px;
    background: var(--bg-input);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
  }

  .request-note {
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.4;
  }

  .review-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .reject-btn {
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
  }

  .accept-btn {
    background: var(--accent-strong);
    color: var(--bg-card);
  }

  :global(:root.dark) .accept-btn {
    color: #000000;
  }

  .empty-state {
    min-height: 220px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 10px;
    color: var(--text-secondary);
    text-align: center;
  }

  .empty-state p {
    margin: 0;
    font-weight: 800;
  }

  @media (max-width: 820px) {
    .requests-page {
      padding: 20px 16px var(--bottom-nav-clearance);
      padding-top: var(--page-top-safe);
    }

    .requests-layout {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 520px) {
    .summary-grid,
    .date-grid,
    .section-tabs,
    .review-actions {
      grid-template-columns: 1fr;
    }

    .request-main-row {
      align-items: flex-start;
    }

    .status-pill {
      margin-left: auto;
    }
  }
</style>
