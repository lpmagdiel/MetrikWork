<script>
  import {
    AlertCircle,
    Building2,
    Eye,
    EyeOff,
    Mail,
    MapPin,
    Pencil,
    Phone,
    Plus,
    Save,
    Search,
    Trash2,
    User,
    X
  } from "lucide-svelte";
  import {
    addCompanyClient,
    companyClientsStore,
    deleteCompanyClient,
    isConfiguredSystemAdmin,
    normalizeClient,
    searchClients,
    setCompanyClientActive,
    subscribeToCompanyClients,
    systemAdminStore,
    updateCompanyClient,
    userStore,
    validateClient
  } from "../data/stores.js";
  import { confirmAlert, showErrorAlert, showSuccessAlert } from "../data/alerts.js";
  import { navigateTo } from "../router.js";
  import CircleAddButton from "../components/CircleAddButton.svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import TitleHeader from "../components/TitleHeader.svelte";
  import Toast from "../components/Toast.svelte";

  // Los clientes son globales (compartidos por toda la empresa).
  // Solo el system admin puede crear/editar/borrar.
  let isAdmin = $derived(
    Boolean($systemAdminStore?.isAdmin) ||
      ($userStore?.email && isConfiguredSystemAdmin($userStore.email))
  );

  let searchTerm = $state("");
  let showInactive = $state(false);
  let showForm = $state(false);
  let editingClientId = $state(null);
  let isSaving = $state(false);
  let deletingClientId = $state("");
  let formError = $state("");
  let messageToast = $state("");
  let typeToast = $state("success");
  let showToast = $state(false);

  let clientForm = $state(createEmptyForm());

  function createEmptyForm() {
    return {
      name: "",
      taxId: "",
      email: "",
      phone: "",
      address: "",
      contactName: "",
      notes: "",
      active: true
    };
  }

  $effect(() => {
    return subscribeToCompanyClients();
  });

  let filteredClients = $derived(
    searchClients($companyClientsStore, searchTerm, { includeInactive: showInactive })
  );

  let activeCount = $derived(
    $companyClientsStore.filter((client) => client.active !== false).length
  );
  let inactiveCount = $derived(
    $companyClientsStore.filter((client) => client.active === false).length
  );

  function showNotification(message, type = "success") {
    messageToast = message;
    typeToast = type;
    showToast = true;
    setTimeout(() => (showToast = false), 3000);
  }

  function openCreateForm() {
    if (!isAdmin) return;
    editingClientId = null;
    clientForm = createEmptyForm();
    formError = "";
    showForm = true;
  }

  function openEditForm(client) {
    if (!isAdmin) return;
    editingClientId = client.id;
    const normalized = normalizeClient(client);
    clientForm = {
      name: normalized.name,
      taxId: normalized.taxId,
      email: normalized.email,
      phone: normalized.phone,
      address: normalized.address,
      contactName: normalized.contactName,
      notes: normalized.notes,
      active: normalized.active
    };
    formError = "";
    showForm = true;
  }

  function closeForm() {
    showForm = false;
    editingClientId = null;
    formError = "";
    isSaving = false;
  }

  async function saveClient() {
    const errors = validateClient(clientForm);
    if (errors.length) {
      formError = errors[0];
      return;
    }

    isSaving = true;
    formError = "";
    try {
      if (editingClientId) {
        await updateCompanyClient(editingClientId, clientForm);
        showNotification("Cliente actualizado.");
      } else {
        await addCompanyClient(clientForm, $userStore);
        showNotification("Cliente creado.");
      }
      closeForm();
    } catch (error) {
      formError = error?.message || "No se pudo guardar el cliente.";
    } finally {
      isSaving = false;
    }
  }

  async function removeClient(client) {
    if (!isAdmin || deletingClientId) return;
    const confirmed = await confirmAlert({
      title: "Eliminar cliente",
      text: `¿Eliminar "${client.name || "este cliente"}"? Los cobros y presupuestos asociados no se borrarán.`,
      confirmButtonText: "Eliminar",
      danger: true
    });
    if (!confirmed) return;

    deletingClientId = client.id;
    try {
      await deleteCompanyClient(client.id);
      showNotification("Cliente eliminado.");
    } catch (error) {
      showNotification(error?.message || "No se pudo eliminar el cliente.", "error");
    } finally {
      deletingClientId = "";
    }
  }

  async function toggleActive(client) {
    if (!isAdmin) return;
    try {
      await setCompanyClientActive(client.id, client.active === false);
      showNotification(client.active === false ? "Cliente reactivado." : "Cliente desactivado.");
    } catch (error) {
      showNotification(error?.message || "No se pudo cambiar el estado del cliente.", "error");
    }
  }

  function goToTeamHome() {
    navigateTo("/teams");
  }
</script>

<div class="clients-page">
  <Toast message={messageToast} type={typeToast} show={showToast} />
  <TitleHeader title="Clientes" description="Constructora" action={goToTeamHome} />

  {#if isAdmin}
    <CircleAddButton onClick={openCreateForm} floating={true} />
  {/if}

  <main class="clients-content">
    <section class="summary">
      <article class="summary-card active">
        <User size={18} />
        <span>Activos</span>
        <strong>{activeCount}</strong>
      </article>
      <article class="summary-card inactive">
        <EyeOff size={18} />
        <span>Inactivos</span>
        <strong>{inactiveCount}</strong>
      </article>
      <article class="summary-card total">
        <Building2 size={18} />
        <span>Total</span>
        <strong>{$companyClientsStore.length}</strong>
      </article>
    </section>

    <section class="toolbar">
      <div class="search-input">
        <Search size={18} />
        <input
          type="search"
          placeholder="Buscar por nombre, NIF/CIF o email"
          bind:value={searchTerm}
        />
      </div>
      <button
        type="button"
        class="toggle-inactive"
        class:active={showInactive}
        onclick={() => (showInactive = !showInactive)}
        aria-pressed={showInactive}
        title={showInactive ? "Ocultar inactivos" : "Mostrar inactivos"}
      >
        {#if showInactive}
          <Eye size={18} />
        {:else}
          <EyeOff size={18} />
        {/if}
        <span>{showInactive ? "Mostrando inactivos" : "Mostrar inactivos"}</span>
      </button>
      {#if isAdmin}
        <button class="new-client-btn" onclick={openCreateForm}>
          <Plus size={18} />
          <span>Nuevo cliente</span>
        </button>
      {/if}
    </section>

    {#if !isAdmin}
      <p class="readonly-notice">
        <AlertCircle size={16} />
        Solo el administrador de la empresa puede crear o modificar clientes. Puedes consultarlos para reutilizarlos al crear cobros y presupuestos.
      </p>
    {/if}

    {#if filteredClients.length === 0}
      <div class="empty-state">
        <Building2 size={54} />
        <h2>{searchTerm ? "Sin coincidencias" : "Sin clientes"}</h2>
        <p>
          {#if searchTerm}
            Prueba a ajustar la búsqueda o limpia el filtro.
          {:else if $companyClientsStore.length === 0}
            Cuando el administrador registre los clientes de la empresa, aparecerán aquí para reutilizarlos en cobros y presupuestos.
          {:else}
            No hay clientes {showInactive ? "" : "activos"} que coincidan con tu búsqueda.
          {/if}
        </p>
        {#if isAdmin && !searchTerm && $companyClientsStore.length === 0}
          <button onclick={openCreateForm}>
            <Plus size={18} />
            Crear primer cliente
          </button>
        {/if}
      </div>
    {:else}
      <section class="clients-list">
        {#each filteredClients as client (client.id)}
          <article class="client-card" class:inactive={client.active === false}>
            <div class="client-avatar" aria-hidden="true">
              <Building2 size={22} />
            </div>
            <div class="client-main">
              <div class="client-title-row">
                <h3>{client.name || "Cliente sin nombre"}</h3>
                {#if client.active === false}
                  <span class="status-badge inactive">Inactivo</span>
                {/if}
              </div>
              <div class="client-meta">
                {#if client.taxId}
                  <span><strong>NIF/CIF:</strong> {client.taxId}</span>
                {/if}
                {#if client.contactName}
                  <span><User size={13} /> {client.contactName}</span>
                {/if}
                {#if client.email}
                  <span><Mail size={13} /> {client.email}</span>
                {/if}
                {#if client.phone}
                  <span><Phone size={13} /> {client.phone}</span>
                {/if}
                {#if client.address}
                  <span><MapPin size={13} /> {client.address}</span>
                {/if}
              </div>
              {#if client.notes}
                <p class="client-notes">{client.notes}</p>
              {/if}
            </div>
            {#if isAdmin}
              <div class="client-actions">
                <button
                  class="action-btn"
                  onclick={() => toggleActive(client)}
                  title={client.active === false ? "Reactivar" : "Desactivar"}
                  aria-label={client.active === false ? "Reactivar cliente" : "Desactivar cliente"}
                >
                  {#if client.active === false}
                    <Eye size={16} />
                  {:else}
                    <EyeOff size={16} />
                  {/if}
                </button>
                <button
                  class="action-btn"
                  onclick={() => openEditForm(client)}
                  aria-label="Editar cliente"
                >
                  <Pencil size={16} />
                </button>
                <button
                  class="action-btn danger"
                  onclick={() => removeClient(client)}
                  disabled={deletingClientId === client.id}
                  aria-label="Eliminar cliente"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            {/if}
          </article>
        {/each}
      </section>
    {/if}
  </main>

  <SliceContainer bind:show={showForm}>
    <section class="client-form">
      <div class="form-heading">
        <span>{editingClientId ? "Editar cliente" : "Nuevo cliente"}</span>
        <strong>Empresa</strong>
      </div>

      <div class="form-section">
        <h3>Identificación</h3>
        <div class="form-grid">
          <label>
            <span>Nombre / Razón social *</span>
            <input
              type="text"
              bind:value={clientForm.name}
              placeholder="Construcciones Pérez S.L."
              required
            />
          </label>
          <label>
            <span>NIF / CIF / RFC</span>
            <input type="text" bind:value={clientForm.taxId} placeholder="B12345678" />
          </label>
        </div>
        <label>
          <span>Persona de contacto</span>
          <input
            type="text"
            bind:value={clientForm.contactName}
            placeholder="Nombre del responsable"
          />
        </label>
      </div>

      <div class="form-section">
        <h3>Contacto</h3>
        <div class="form-grid">
          <label>
            <span>Email</span>
            <input
              type="email"
              bind:value={clientForm.email}
              placeholder="contacto@cliente.com"
            />
          </label>
          <label>
            <span>Teléfono</span>
            <input type="tel" bind:value={clientForm.phone} placeholder="+34 600 000 000" />
          </label>
        </div>
        <label>
          <span>Dirección fiscal</span>
          <textarea
            bind:value={clientForm.address}
            rows="3"
            placeholder="Calle, número, ciudad, código postal"
          ></textarea>
        </label>
      </div>

      <div class="form-section">
        <h3>Notas</h3>
        <label>
          <span>Observaciones internas</span>
          <textarea
            bind:value={clientForm.notes}
            rows="3"
            placeholder="Información relevante sobre el cliente"
          ></textarea>
        </label>
      </div>

      <div class="form-section">
        <label class="toggle-row">
          <input type="checkbox" bind:checked={clientForm.active} />
          <span>Cliente activo</span>
        </label>
      </div>

      {#if formError}
        <p class="form-error">{formError}</p>
      {/if}

      <div class="form-actions">
        <button type="button" class="secondary-btn" onclick={closeForm} disabled={isSaving}>
          <X size={18} />
          <span>Cancelar</span>
        </button>
        <button
          type="button"
          class="primary-btn"
          onclick={saveClient}
          disabled={isSaving || !clientForm.name.trim()}
        >
          {#if isSaving}
            <span>Guardando...</span>
          {:else}
            <Save size={18} />
            <span>{editingClientId ? "Actualizar" : "Guardar"}</span>
          {/if}
        </button>
      </div>
    </section>
  </SliceContainer>
</div>

<style>
  .clients-page {
    height: 100%;
    padding: 24px 20px var(--bottom-nav-clearance);
    padding-top: var(--page-top-safe);
    box-sizing: border-box;
    background: var(--bg-page);
    color: var(--text-primary);
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }

  .clients-content {
    width: min(100%, 980px);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .summary-card {
    min-height: 96px;
    padding: 16px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
    display: grid;
    align-content: center;
    gap: 6px;
  }

  .summary-card :global(svg) {
    color: var(--accent-color);
  }

  .summary-card.active :global(svg) {
    color: var(--success-color);
  }

  .summary-card.inactive :global(svg) {
    color: var(--text-secondary);
  }

  .summary-card span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
  }

  .summary-card strong {
    color: var(--text-primary);
    font-size: 24px;
    font-weight: 900;
  }

  .readonly-notice {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 12px 14px;
    border-radius: var(--radius-md);
    background: var(--bg-info-subtle);
    color: var(--info-color);
    font-size: 13px;
    font-weight: 700;
  }

  .toolbar {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .search-input {
    flex: 1;
    min-width: 200px;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 0 14px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
    color: var(--text-secondary);
  }

  .search-input input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: 15px;
    outline: none;
  }

  .search-input input::placeholder {
    color: var(--text-secondary);
  }

  .toggle-inactive,
  .new-client-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    color: var(--text-primary);
    font-weight: 700;
    cursor: pointer;
    min-height: 48px;
    padding: 0 16px;
    transition: all 0.18s ease;
  }

  .toggle-inactive.active {
    background: var(--bg-accent-subtle);
    color: var(--accent-strong);
    border-color: var(--accent-color);
  }

  .new-client-btn {
    background: var(--accent-color);
    color: var(--accent-ink);
    border-color: transparent;
  }

  .toggle-inactive:active,
  .new-client-btn:active {
    transform: scale(0.98);
  }

  .clients-list {
    display: grid;
    gap: 12px;
  }

  .client-card {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    padding: 16px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
    transition: transform 0.18s ease, border-color 0.18s ease;
  }

  .client-card.inactive {
    opacity: 0.78;
    border-style: dashed;
  }

  .client-avatar {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    background: var(--bg-accent-subtle);
    color: var(--accent-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .client-main {
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  .client-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .client-title-row h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 16px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-badge {
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--bg-input);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .status-badge.inactive {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .client-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 14px;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .client-meta span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .client-meta strong {
    color: var(--text-secondary);
    font-weight: 700;
    margin-right: 4px;
  }

  .client-notes {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.4;
  }

  .client-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .action-btn {
    width: 38px;
    height: 38px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.18s ease;
  }

  .action-btn:active:not(:disabled) {
    transform: scale(0.94);
  }

  .action-btn.danger {
    color: var(--danger-color);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .empty-state {
    min-height: 280px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-card);
    display: grid;
    place-items: center;
    align-content: center;
    gap: 12px;
    text-align: center;
    padding: 28px;
  }

  .empty-state :global(svg) {
    color: var(--text-secondary);
  }

  .empty-state h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
    color: var(--text-primary);
  }

  .empty-state p {
    max-width: 460px;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.45;
    margin: 0;
  }

  .empty-state button {
    min-height: 44px;
    padding: 0 16px;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--accent-color);
    color: var(--accent-ink);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    cursor: pointer;
  }

  .client-form {
    width: min(100%, 720px);
    margin: 0 auto;
    padding: 2px 8px 28px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .form-heading {
    display: grid;
    gap: 4px;
  }

  .form-heading span {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .form-heading strong {
    color: var(--text-primary);
    font-size: 22px;
    font-weight: 800;
  }

  .form-section {
    display: grid;
    gap: 12px;
  }

  .form-section h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 800;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  label {
    min-width: 0;
    display: grid;
    gap: 7px;
  }

  label span {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 700;
  }

  input,
  textarea {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-primary);
    font: inherit;
    font-size: 15px;
    outline: none;
    box-sizing: border-box;
  }

  input {
    min-height: 48px;
    padding: 0 12px;
  }

  textarea {
    padding: 12px;
    resize: vertical;
    line-height: 1.45;
  }

  input:focus,
  textarea:focus {
    border-color: var(--accent-color);
  }

  .toggle-row {
    min-height: 52px;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-input);
  }

  .toggle-row input {
    width: 18px;
    min-height: 18px;
    accent-color: var(--accent-color);
  }

  .form-error {
    border-radius: var(--radius-md);
    padding: 12px 14px;
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
    font-size: 14px;
    font-weight: 700;
  }

  .form-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    align-items: center;
    flex-wrap: wrap;
  }

  .secondary-btn,
  .primary-btn {
    min-height: 48px;
    padding: 0 18px;
    border: 0;
    border-radius: var(--radius-md);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .secondary-btn {
    background: var(--bg-input);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .primary-btn {
    background: var(--accent-color);
    color: var(--accent-ink);
  }

  .secondary-btn:disabled,
  .primary-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .secondary-btn:active:not(:disabled),
  .primary-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  @media (max-width: 720px) {
    .clients-page {
      padding: 18px 14px var(--bottom-nav-clearance);
    }

    .toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .search-input,
    .toggle-inactive,
    .new-client-btn {
      width: 100%;
    }

    .client-card {
      grid-template-columns: 48px minmax(0, 1fr);
    }

    .client-actions {
      grid-column: 1 / -1;
      justify-content: flex-end;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }
  }
</style>