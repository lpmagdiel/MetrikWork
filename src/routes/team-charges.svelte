<script>
  import {
    AlertCircle,
    Bell,
    CalendarDays,
    CheckCircle2,
    CreditCard,
    DollarSign,
    FileText,
    MapPinned,
    Plus,
    Printer,
    Save,
    Trash2,
    Users,
    WalletCards,
  } from "lucide-svelte";
  import {
    selectedTeam,
    selectedTeamId,
    userStore,
    teamLocationsStore,
    subscribeToTeamLocations,
    teamChargesStore,
    teamChargeTemplatesStore,
    subscribeToTeamCharges,
    subscribeToTeamChargeTemplates,
    registerTeamCharge,
    markTeamChargePaid,
    deleteTeamCharge,
    updateTeamChargeReminder,
    addTeamChargeTemplate,
    deleteTeamChargeTemplate,
    hasTeamPermission,
    subscribeToCompanyClients,
    companyClientsStore,
  } from "../data/stores.js";
  import { createNotification } from "../data/notifications.js";
  import { navigateTo } from "../router.js";
  import { confirmAlert } from "../data/alerts.js";
  import { openInvoiceReport } from "../helpers/invoiceReport.js";
  import CircleAddButton from "../components/CircleAddButton.svelte";
  import ClientPicker from "../components/ClientPicker.svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import TitleHeader from "../components/TitleHeader.svelte";
  import Toast from "../components/Toast.svelte";

  const methodLabels = {
    cash: "Efectivo",
    transfer: "Transferencia",
    bizum: "Bizum",
  };

  const statusLabels = {
    pending: "Pendiente",
    paid: "Cobrado",
  };

  const rangeLabels = {
    days: "Por días",
    weekly: "Semanal",
    monthly: "Mensual",
    recurring: "Recurrente",
  };

  const recurrenceLabels = {
    weekly: "Semanal",
    monthly: "Mensual",
  };

  let team = $derived($selectedTeam);
  let teamId = $derived(team?.id || $selectedTeamId);
  let canViewPayments = $derived(hasTeamPermission(team, $userStore?.uid, "payments", "view"));
  let canCreatePayments = $derived(hasTeamPermission(team, $userStore?.uid, "payments", "create"));
  let canEditPayments = $derived(hasTeamPermission(team, $userStore?.uid, "payments", "edit"));
  let canDeletePayments = $derived(hasTeamPermission(team, $userStore?.uid, "payments", "delete"));
  let canViewStats = $derived(hasTeamPermission(team, $userStore?.uid, "stats", "view"));
  let canViewCharges = $derived(canViewPayments || canViewStats);
  let canManageCharges = $derived(canCreatePayments || canEditPayments);
  let currency = $derived(team?.projectBudgetCurrency || "MXN");

  let showChargeForm = $state(false);
  let isSaving = $state(false);
  let isCreatingFromTemplate = $state("");
  let deletingTemplateId = $state("");
  let filterStatus = $state("all");
  let formError = $state("");
  let messageToast = $state("");
  let typeToast = $state("success");
  let showToast = $state(false);
  let chargeForm = $state(createDefaultChargeForm());
  let selectedClientFromPicker = $state(null);
  let reminderInFlight = new Set();

  let filteredCharges = $derived.by(() => {
    if (filterStatus === "paid") return $teamChargesStore.filter((charge) => charge.status === "paid");
    if (filterStatus === "pending") return $teamChargesStore.filter((charge) => charge.status !== "paid");
    return $teamChargesStore;
  });

  let chargeSummary = $derived.by(() => {
    return $teamChargesStore.reduce(
      (summary, charge) => {
        const amount = Number(charge.amount) || 0;
        summary.total += amount;
        if (charge.status === "paid") summary.paid += amount;
        else summary.pending += amount;
        if (isChargeDueSoon(charge)) summary.dueSoon += 1;
        return summary;
      },
      { total: 0, paid: 0, pending: 0, dueSoon: 0 },
    );
  });

  $effect(() => {
    if (teamId && canViewCharges) {
      return subscribeToTeamCharges(teamId);
    }
    return subscribeToTeamCharges(null);
  });

  $effect(() => {
    if (teamId && canViewCharges) {
      return subscribeToTeamChargeTemplates(teamId);
    }
    return subscribeToTeamChargeTemplates(null);
  });

  $effect(() => {
    if (teamId && canViewCharges) {
      subscribeToTeamLocations(teamId);
    } else {
      subscribeToTeamLocations(null);
    }
  });

  $effect(() => {
    if (teamId && canViewCharges) {
      return subscribeToCompanyClients();
    }
    return subscribeToCompanyClients();
  });

  $effect(() => {
    if (!teamId || !team || !canManageCharges) return;
    $teamChargesStore.forEach((charge) => {
      if (isChargeDueSoon(charge)) {
        sendRecurringReminder(charge);
      }
    });
  });

  function showNotification(msg, type = "success") {
    messageToast = msg;
    typeToast = type;
    showToast = true;
    setTimeout(() => {
      showToast = false;
    }, 3000);
  }

  function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(dateString, days) {
    const date = parseDate(dateString) || new Date();
    date.setDate(date.getDate() + Number(days || 0));
    return toDateInput(date);
  }

  function addMonths(dateString, months) {
    const date = parseDate(dateString) || new Date();
    date.setMonth(date.getMonth() + Number(months || 0));
    return toDateInput(date);
  }

  function parseDate(dateString) {
    if (!dateString) return null;
    const [year, month, day] = String(dateString).split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function toDateInput(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function createDefaultChargeForm() {
    const today = getTodayDateString();
    return {
      title: "",
      description: "",
      amount: "",
      taxRate: "",
      method: "transfer",
      status: "paid",
      rangeType: "days",
      startDate: today,
      endDate: today,
      dueDate: today,
      recurrence: {
        enabled: false,
        frequency: "monthly",
        interval: 1,
        nextDate: addMonths(today, 1),
        notifyDaysBefore: 2,
      },
      client: {
        name: "",
        taxId: "",
        email: "",
        phone: "",
        address: "",
      },
      company: {
        name: "",
        taxId: "",
        email: "",
        phone: "",
        address: "",
        iban: "",
        bankName: "",
        bizum: "",
      },
      budgetTarget: {
        type: "team",
        locationId: "",
      },
      applyToBudget: true,
      saveAsTemplate: false,
      templateName: "",
    };
  }

  function goToTeamHome() {
    navigateTo(teamId ? `/teams/${teamId}` : "/teams");
  }

  function getCompanyStorageKey() {
    return `metricwork.chargeCompany.${teamId || "default"}`;
  }

  function loadCompanyDefaults() {
    const teamCompany = normalizeCompanyProfile(team?.companyProfile);
    if (Object.values(teamCompany).some(Boolean)) return teamCompany;

    if (typeof localStorage === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(getCompanyStorageKey()) || "{}");
    } catch {
      return {};
    }
  }

  function saveCompanyDefaults(company) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(getCompanyStorageKey(), JSON.stringify(company || {}));
    } catch {
      // Local storage is optional for invoice defaults.
    }
  }

  function normalizeCompanyProfile(profile = {}) {
    const defaults = createDefaultChargeForm().company;
    return Object.fromEntries(
      Object.keys(defaults).map((key) => [key, String(profile?.[key] || "").trim()]),
    );
  }

  function openChargeForm() {
    chargeForm = {
      ...createDefaultChargeForm(),
      currency,
      company: {
        ...createDefaultChargeForm().company,
        ...loadCompanyDefaults(),
      },
    };
    selectedClientFromPicker = null;
    formError = "";
    showChargeForm = true;
  }

  function closeChargeForm() {
    showChargeForm = false;
    formError = "";
    isSaving = false;
    selectedClientFromPicker = null;
  }

  function applyClientToForm(client) {
    if (!client) return;
    selectedClientFromPicker = client;
    chargeForm.client = {
      name: client.name || "",
      taxId: client.taxId || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
    };
  }

  function clearClientFromForm() {
    selectedClientFromPicker = null;
    chargeForm.client = createDefaultChargeForm().client;
  }

  function handleCreateClientRequested() {
    // Solo el admin de la empresa puede crear clientes. Pedimos al usuario
    // que vaya a la sección de Clientes para registrar uno nuevo.
    showNotification(
      "Pide al administrador de la empresa que cree el cliente en la sección Clientes.",
      "info"
    );
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function handleRangeChange() {
    if (chargeForm.rangeType === "weekly") {
      chargeForm.endDate = addDays(chargeForm.startDate, 6);
      chargeForm.dueDate = chargeForm.endDate;
    } else if (chargeForm.rangeType === "monthly") {
      chargeForm.endDate = addMonths(chargeForm.startDate, 1);
      chargeForm.dueDate = chargeForm.endDate;
    } else if (chargeForm.rangeType === "recurring") {
      chargeForm.recurrence.enabled = true;
      chargeForm.recurrence.nextDate = chargeForm.recurrence.frequency === "weekly"
        ? addDays(chargeForm.dueDate || chargeForm.startDate, 7 * chargeForm.recurrence.interval)
        : addMonths(chargeForm.dueDate || chargeForm.startDate, chargeForm.recurrence.interval);
    } else {
      chargeForm.endDate = chargeForm.startDate;
      chargeForm.dueDate = chargeForm.startDate;
      chargeForm.recurrence.enabled = false;
    }
  }

  function getSelectedLocation() {
    return $teamLocationsStore.find((location) => location.id === chargeForm.budgetTarget.locationId) || null;
  }

  function getChargeLocation(charge) {
    return $teamLocationsStore.find((location) => location.id === charge.budgetTarget?.locationId) || null;
  }

  function getChargePayloadFromForm() {
    const selectedLocation = getSelectedLocation();
    const isRecurring = chargeForm.rangeType === "recurring" || chargeForm.recurrence.enabled;
    const taxRateNumber = Number(chargeForm.taxRate);
    return {
      title: chargeForm.title.trim() || `Cobro ${chargeForm.client.name || "cliente"}`,
      description: chargeForm.description.trim(),
      amount: Number(chargeForm.amount) || 0,
      taxRate: Number.isFinite(taxRateNumber) && taxRateNumber >= 0 ? taxRateNumber : 0,
      currency,
      method: chargeForm.method,
      status: chargeForm.status,
      rangeType: chargeForm.rangeType,
      startDate: chargeForm.startDate,
      endDate: chargeForm.endDate,
      dueDate: chargeForm.dueDate || chargeForm.endDate || chargeForm.startDate,
      recurrence: {
        ...chargeForm.recurrence,
        enabled: isRecurring,
      },
      client: clone(chargeForm.client),
      company: clone(chargeForm.company),
      budgetTarget: {
        type: chargeForm.budgetTarget.type,
        locationId: chargeForm.budgetTarget.type === "location" ? chargeForm.budgetTarget.locationId : "",
        locationName: selectedLocation?.name || "",
      },
      applyToBudget: Boolean(chargeForm.applyToBudget),
    };
  }

  function validateChargeForm() {
    if (!canCreatePayments) return "No tienes permiso para crear cobros.";
    if (!chargeForm.client.name.trim()) return "Agrega el nombre del cliente.";
    if ((Number(chargeForm.amount) || 0) <= 0) return "Agrega un importe mayor que cero.";
    if (!chargeForm.startDate) return "Agrega una fecha de inicio.";
    if (!chargeForm.dueDate) return "Agrega una fecha de cobro.";
    if (chargeForm.budgetTarget.type === "location" && !chargeForm.budgetTarget.locationId) {
      return "Selecciona una ubicación para aplicar el presupuesto.";
    }
    return "";
  }

  async function saveCharge() {
    const validation = validateChargeForm();
    if (validation) {
      formError = validation;
      return;
    }

    isSaving = true;
    formError = "";
    try {
      const payload = getChargePayloadFromForm();
      await registerTeamCharge(teamId, payload, $userStore);
      saveCompanyDefaults(payload.company);

      if (chargeForm.saveAsTemplate) {
        await addTeamChargeTemplate(
          teamId,
          {
            name: chargeForm.templateName.trim() || payload.title,
            payload,
          },
          $userStore,
        );
      }

      closeChargeForm();
      showNotification(payload.status === "paid" ? "Cobro registrado y presupuesto actualizado." : "Cobro pendiente registrado.");
    } catch (error) {
      console.error("Error saving charge:", error);
      formError = error?.message || "No se pudo guardar el cobro.";
    } finally {
      isSaving = false;
    }
  }

  function applyTemplate(template) {
    const payload = clone(template?.payload);
    chargeForm = {
      ...createDefaultChargeForm(),
      ...payload,
      amount: payload.amount || "",
      company: {
        ...createDefaultChargeForm().company,
        ...loadCompanyDefaults(),
        ...payload.company,
      },
      client: {
        ...createDefaultChargeForm().client,
        ...payload.client,
      },
      budgetTarget: {
        type: payload.budgetTarget?.type || "team",
        locationId: payload.budgetTarget?.locationId || "",
      },
      saveAsTemplate: false,
      templateName: "",
    };
    showChargeForm = true;
  }

  async function createChargeFromTemplate(template) {
    if (!teamId || !canCreatePayments || isCreatingFromTemplate) return;
    const payload = clone(template?.payload);
    const today = getTodayDateString();
    const nextPayload = {
      ...payload,
      startDate: payload.startDate || today,
      endDate: payload.endDate || today,
      dueDate: payload.dueDate || today,
      currency,
      company: {
        ...loadCompanyDefaults(),
        ...payload.company,
      },
    };

    isCreatingFromTemplate = template.id;
    try {
      await registerTeamCharge(teamId, nextPayload, $userStore);
      showNotification("Cobro creado desde plantilla.");
    } catch (error) {
      console.error("Error creating charge from template:", error);
      showNotification(error?.message || "No se pudo crear el cobro desde plantilla.", "error");
    } finally {
      isCreatingFromTemplate = "";
    }
  }

  async function removeTemplate(template) {
    if (!teamId || !template?.id || deletingTemplateId) return;
    deletingTemplateId = template.id;
    try {
      await deleteTeamChargeTemplate(teamId, template.id);
      showNotification("Plantilla eliminada.");
    } catch (error) {
      console.error("Error deleting template:", error);
      showNotification("No se pudo eliminar la plantilla.", "error");
    } finally {
      deletingTemplateId = "";
    }
  }

  async function markPaid(charge) {
    if (!teamId || !canEditPayments) return;
    try {
      await markTeamChargePaid(teamId, charge);
      showNotification("Cobro marcado como cobrado y presupuesto actualizado.");
    } catch (error) {
      console.error("Error marking charge paid:", error);
      showNotification(error?.message || "No se pudo marcar como cobrado.", "error");
    }
  }

  async function removeCharge(charge) {
    if (!teamId || !charge?.id) return;
    const confirmed = await confirmAlert({
      title: "Eliminar cobro",
      text: `¿Eliminar "${charge.title || "este cobro"}"?`,
      confirmButtonText: "Eliminar",
      danger: true,
    });
    if (!confirmed) return;

    try {
      await deleteTeamCharge(teamId, charge.id);
      showNotification("Cobro eliminado.");
    } catch (error) {
      console.error("Error deleting charge:", error);
      showNotification("No se pudo eliminar el cobro.", "error");
    }
  }

  function canManageTemplate(template) {
    return team?.admin === $userStore?.uid || template?.createdBy === $userStore?.uid;
  }

  function formatMoney(amount) {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);
  }

  function formatDate(value) {
    const date = parseDate(value);
    if (!date) return "Sin fecha";
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function getDateDistance(dateString) {
    const date = parseDate(dateString);
    if (!date) return null;
    const today = parseDate(getTodayDateString());
    return Math.ceil((date.getTime() - today.getTime()) / 86400000);
  }

  function isChargeDueSoon(charge) {
    if (!charge?.recurrence?.enabled || charge.status === "paid") return false;
    const reminderDate = charge.recurrence.nextDate || charge.dueDate;
    const days = getDateDistance(reminderDate);
    const notifyDays = Number(charge.recurrence.notifyDaysBefore) || 2;
    return days !== null && days >= 0 && days <= notifyDays && charge.lastReminderDate !== reminderDate;
  }

  function getReminderRecipients() {
    const members = Array.isArray(team?.members) ? team.members : [];
    return members.filter((memberId) =>
      memberId === team?.admin || hasTeamPermission(team, memberId, "payments", "view"),
    );
  }

  async function sendRecurringReminder(charge) {
    const reminderDate = charge.recurrence?.nextDate || charge.dueDate;
    if (!teamId || !charge?.id || !reminderDate) return;
    const key = `${charge.id}:${reminderDate}`;
    if (reminderInFlight.has(key)) return;
    reminderInFlight.add(key);

    try {
      const recipients = getReminderRecipients();
      await Promise.all(
        recipients.map((uid) =>
          createNotification(
            uid,
            "Cobro recurrente próximo",
            `${charge.title || "Cobro"} vence el ${formatDate(reminderDate)} para ${charge.client?.name || "cliente"}.`,
            {
              url: `/teams/${teamId}/charges`,
              type: "charge_reminder",
              sourceId: charge.id,
              teamId,
              showInForeground: true,
            },
          ),
        ),
      );
      await updateTeamChargeReminder(teamId, charge.id, reminderDate);
    } catch (error) {
      console.warn("No se pudo crear el recordatorio de cobro:", error);
    } finally {
      reminderInFlight.delete(key);
    }
  }

  function getChargeTargetLabel(charge) {
    if (charge.budgetTarget?.type === "location") {
      return charge.budgetTarget.locationName || getChargeLocation(charge)?.name || "Ubicación";
    }
    return team?.name || "Equipo";
  }

  function getPeriodLabel(charge) {
    const start = formatDate(charge.startDate);
    const end = formatDate(charge.endDate || charge.dueDate);
    if (!charge.endDate || charge.startDate === charge.endDate) return start;
    return `${start} - ${end}`;
  }

  function generateInvoice(charge) {
    const ok = openInvoiceReport({ charge, team });
    if (!ok) {
      showNotification("Permite ventanas emergentes para generar la factura.", "error");
    }
  }
</script>

<div class="team-charges-page">
  <Toast message={messageToast} type={typeToast} show={showToast} />
  <TitleHeader title="Cobros" description={team?.name || ""} action={goToTeamHome} />

  {#if team && canViewCharges}
    {#if canCreatePayments}
      <CircleAddButton onClick={openChargeForm} floating={true} />
    {/if}

    <main class="charges-content">
      <section class="summary-grid">
        <article class="summary-item">
          <DollarSign size={18} />
          <span>Total</span>
          <strong>{formatMoney(chargeSummary.total)}</strong>
        </article>
        <article class="summary-item success">
          <CheckCircle2 size={18} />
          <span>Cobrado</span>
          <strong>{formatMoney(chargeSummary.paid)}</strong>
        </article>
        <article class="summary-item warning">
          <AlertCircle size={18} />
          <span>Pendiente</span>
          <strong>{formatMoney(chargeSummary.pending)}</strong>
        </article>
        <article class="summary-item info">
          <Bell size={18} />
          <span>Próximos</span>
          <strong>{chargeSummary.dueSoon}</strong>
        </article>
      </section>

      <section class="toolbar">
        <div class="filter-tabs" aria-label="Filtrar cobros">
          <button class:active={filterStatus === "all"} onclick={() => (filterStatus = "all")}>Todos</button>
          <button class:active={filterStatus === "pending"} onclick={() => (filterStatus = "pending")}>Pendientes</button>
          <button class:active={filterStatus === "paid"} onclick={() => (filterStatus = "paid")}>Cobrados</button>
        </div>
        {#if canCreatePayments}
          <button class="new-charge-btn" onclick={openChargeForm}>
            <Plus size={18} />
            <span>Nuevo cobro</span>
          </button>
        {/if}
      </section>

      {#if $teamChargeTemplatesStore.length > 0}
        <section class="templates-section">
          <div class="section-title">
            <FileText size={18} />
            <h2>Plantillas</h2>
          </div>
          <div class="template-list">
            {#each $teamChargeTemplatesStore as template (template.id)}
              <article class="template-item">
                <button class="template-main" onclick={() => applyTemplate(template)}>
                  <strong>{template.name}</strong>
                  <span>{template.payload?.client?.name || "Cliente guardado"}</span>
                </button>
                {#if canCreatePayments}
                  <button
                    class="template-action"
                    onclick={() => createChargeFromTemplate(template)}
                    disabled={isCreatingFromTemplate === template.id}
                  >
                    <Plus size={16} />
                  </button>
                {/if}
                {#if canManageTemplate(template)}
                  <button
                    class="template-action danger"
                    onclick={() => removeTemplate(template)}
                    disabled={deletingTemplateId === template.id}
                  >
                    <Trash2 size={16} />
                  </button>
                {/if}
              </article>
            {/each}
          </div>
        </section>
      {/if}

      {#if filteredCharges.length === 0}
        <div class="empty-state">
          <WalletCards size={54} />
          <h2>Sin cobros</h2>
          <p>Registra cobros de clientes y aplica el importe al presupuesto del equipo o una ubicación.</p>
          {#if canCreatePayments}
            <button onclick={openChargeForm}>
              <Plus size={18} />
              Nuevo cobro
            </button>
          {/if}
        </div>
      {:else}
        <section class="charges-list">
          {#each filteredCharges as charge (charge.id)}
            <article class="charge-item" class:paid={charge.status === "paid"}>
              <div class="charge-icon">
                {#if charge.status === "paid"}
                  <CheckCircle2 size={20} />
                {:else}
                  <CreditCard size={20} />
                {/if}
              </div>
              <div class="charge-main">
                <div class="charge-title-row">
                  <h3>{charge.title}</h3>
                  <span class="status-badge" class:paid={charge.status === "paid"}>
                    {statusLabels[charge.status] || "Pendiente"}
                  </span>
                </div>
                <p>{charge.client?.name || "Cliente sin nombre"} · {methodLabels[charge.method] || "Método"}</p>
                <div class="charge-tags">
                  <span><CalendarDays size={13} /> {rangeLabels[charge.rangeType] || "Rango"} · {getPeriodLabel(charge)}</span>
                  <span><MapPinned size={13} /> {getChargeTargetLabel(charge)}</span>
                  {#if charge.recurrence?.enabled}
                    <span><Bell size={13} /> {recurrenceLabels[charge.recurrence.frequency] || "Recurrente"} · próximo {formatDate(charge.recurrence.nextDate || charge.dueDate)}</span>
                  {/if}
                </div>
              </div>
              <div class="charge-side">
                <strong>{formatMoney(charge.amount)}</strong>
                <div class="charge-actions">
                  <button onclick={() => generateInvoice(charge)} aria-label="Generar factura">
                    <Printer size={17} />
                  </button>
                  {#if charge.status !== "paid" && canEditPayments}
                    <button onclick={() => markPaid(charge)} aria-label="Marcar como cobrado">
                      <CheckCircle2 size={17} />
                    </button>
                  {/if}
                  {#if canDeletePayments}
                    <button class="danger" onclick={() => removeCharge(charge)} aria-label="Eliminar cobro">
                      <Trash2 size={17} />
                    </button>
                  {/if}
                </div>
              </div>
            </article>
          {/each}
        </section>
      {/if}
    </main>

    <SliceContainer bind:show={showChargeForm}>
      <section class="charge-form">
        <div class="form-heading">
          <span>Nuevo cobro</span>
          <strong>{team.name || team.team || "Equipo"}</strong>
        </div>

        <div class="form-section">
          <h3>Cliente</h3>
          {#if canCreatePayments}
            <ClientPicker
              clients={$companyClientsStore}
              selectedClient={selectedClientFromPicker}
              onSelect={applyClientToForm}
              onClear={clearClientFromForm}
              onCreateNew={handleCreateClientRequested}
              label="Cliente registrado en la empresa"
              allowCreate={true}
            />
          {/if}
          <div class="form-grid">
            <label>
              <span>Nombre</span>
              <input type="text" bind:value={chargeForm.client.name} placeholder="Cliente o empresa" />
            </label>
            <label>
              <span>NIF/CIF</span>
              <input type="text" bind:value={chargeForm.client.taxId} placeholder="Documento fiscal" />
            </label>
            <label>
              <span>Email</span>
              <input type="email" bind:value={chargeForm.client.email} placeholder="facturas@cliente.com" />
            </label>
            <label>
              <span>Teléfono</span>
              <input type="tel" bind:value={chargeForm.client.phone} placeholder="+34..." />
            </label>
          </div>
          <label>
            <span>Dirección</span>
            <textarea bind:value={chargeForm.client.address} rows="3" placeholder="Dirección fiscal"></textarea>
          </label>
        </div>

        <div class="form-section">
          <h3>Cobro</h3>
          <label>
            <span>Concepto</span>
            <input type="text" bind:value={chargeForm.title} placeholder="Servicio mensual, instalación..." />
          </label>
          <label>
            <span>Descripción</span>
            <textarea bind:value={chargeForm.description} rows="3" placeholder="Detalle que aparecerá en la factura"></textarea>
          </label>
          <div class="form-grid">
            <label>
              <span>Importe</span>
              <input type="number" min="0" step="0.01" bind:value={chargeForm.amount} placeholder="0.00" />
            </label>
            <label>
              <span>IVA (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                bind:value={chargeForm.taxRate}
                placeholder="21"
              />
            </label>
            <label>
              <span>Método</span>
              <select bind:value={chargeForm.method}>
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="bizum">Bizum</option>
              </select>
            </label>
            <label>
              <span>Estado</span>
              <select bind:value={chargeForm.status}>
                <option value="paid">Cobrado</option>
                <option value="pending">Pendiente</option>
              </select>
            </label>
            <label>
              <span>Rango</span>
              <select bind:value={chargeForm.rangeType} onchange={handleRangeChange}>
                <option value="days">Días</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
                <option value="recurring">Recurrente</option>
              </select>
            </label>
            <label>
              <span>Inicio</span>
              <input type="date" bind:value={chargeForm.startDate} onchange={handleRangeChange} />
            </label>
            <label>
              <span>Fin</span>
              <input type="date" bind:value={chargeForm.endDate} />
            </label>
            <label>
              <span>Fecha de cobro</span>
              <input type="date" bind:value={chargeForm.dueDate} onchange={handleRangeChange} />
            </label>
          </div>

          {#if chargeForm.rangeType === "recurring"}
            <div class="recurrence-box">
              <label>
                <span>Frecuencia</span>
                <select bind:value={chargeForm.recurrence.frequency} onchange={handleRangeChange}>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </label>
              <label>
                <span>Cada</span>
                <input type="number" min="1" step="1" bind:value={chargeForm.recurrence.interval} onchange={handleRangeChange} />
              </label>
              <label>
                <span>Próximo cobro</span>
                <input type="date" bind:value={chargeForm.recurrence.nextDate} />
              </label>
              <label>
                <span>Avisar días antes</span>
                <input type="number" min="1" step="1" bind:value={chargeForm.recurrence.notifyDaysBefore} />
              </label>
            </div>
          {/if}
        </div>

        <div class="form-section">
          <h3>Presupuesto</h3>
          <label class="toggle-row">
            <input type="checkbox" bind:checked={chargeForm.applyToBudget} />
            <span>Aplicar cobros cobrados al presupuesto</span>
          </label>
          <div class="form-grid">
            <label>
              <span>Destino</span>
              <select bind:value={chargeForm.budgetTarget.type}>
                <option value="team">Equipo</option>
                <option value="location">Ubicación</option>
              </select>
            </label>
            {#if chargeForm.budgetTarget.type === "location"}
              <label>
                <span>Ubicación</span>
                <select bind:value={chargeForm.budgetTarget.locationId}>
                  <option value="">Selecciona ubicación</option>
                  {#each $teamLocationsStore as location}
                    <option value={location.id}>{location.name}</option>
                  {/each}
                </select>
              </label>
            {/if}
          </div>
        </div>

        <div class="form-section">
          <h3>Empresa</h3>
          <div class="form-grid">
            <label>
              <span>Nombre</span>
              <input type="text" bind:value={chargeForm.company.name} placeholder={team.name || team.team || "Mi empresa"} />
            </label>
            <label>
              <span>NIF/CIF</span>
              <input type="text" bind:value={chargeForm.company.taxId} placeholder="Documento fiscal" />
            </label>
            <label>
              <span>Email</span>
              <input type="email" bind:value={chargeForm.company.email} placeholder="facturas@empresa.com" />
            </label>
            <label>
              <span>Teléfono</span>
              <input type="tel" bind:value={chargeForm.company.phone} placeholder="+34..." />
            </label>
            <label>
              <span>IBAN / cuenta</span>
              <input type="text" bind:value={chargeForm.company.iban} placeholder="ES00 0000 0000 0000 0000" />
            </label>
            <label>
              <span>Banco</span>
              <input type="text" bind:value={chargeForm.company.bankName} placeholder="Nombre del banco" />
            </label>
            <label>
              <span>Bizum</span>
              <input type="text" bind:value={chargeForm.company.bizum} placeholder="Teléfono Bizum" />
            </label>
          </div>
          <label>
            <span>Dirección</span>
            <textarea bind:value={chargeForm.company.address} rows="3" placeholder="Dirección fiscal de la empresa"></textarea>
          </label>
        </div>

        <div class="form-section">
          <label class="toggle-row">
            <input type="checkbox" bind:checked={chargeForm.saveAsTemplate} />
            <span>Guardar como plantilla</span>
          </label>
          {#if chargeForm.saveAsTemplate}
            <label>
              <span>Nombre de plantilla</span>
              <input type="text" bind:value={chargeForm.templateName} placeholder={chargeForm.title || "Plantilla de cobro"} />
            </label>
          {/if}
        </div>

        {#if formError}
          <p class="form-error">{formError}</p>
        {/if}

        <button class="save-charge-btn" onclick={saveCharge} disabled={isSaving}>
          {#if isSaving}
            <span>Guardando...</span>
          {:else}
            <Save size={20} />
            <span>Guardar cobro</span>
          {/if}
        </button>
      </section>
    </SliceContainer>
  {:else if team}
    <div class="empty-state">
      <Users size={54} />
      <h2>Sin permiso</h2>
      <p>No tienes permiso para ver los cobros de este equipo.</p>
    </div>
  {:else}
    <div class="empty-state">
      <p>No se seleccionó ningún equipo.</p>
      <button onclick={goToTeamHome}>Volver</button>
    </div>
  {/if}
</div>

<style>
  .team-charges-page {
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

  .charges-content {
    width: min(100%, 980px);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .summary-item {
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

  .summary-item :global(svg) {
    color: var(--accent-color);
  }

  .summary-item.success :global(svg) {
    color: var(--success-color);
  }

  .summary-item.warning :global(svg) {
    color: var(--warning-color);
  }

  .summary-item.info :global(svg) {
    color: var(--info-color);
  }

  .summary-item span,
  .charge-main p,
  .charge-tags span,
  .template-main span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
  }

  .summary-item strong {
    color: var(--text-primary);
    font-size: 20px;
    font-weight: 800;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .filter-tabs {
    min-height: 44px;
    padding: 4px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    display: inline-flex;
    gap: 4px;
  }

  .filter-tabs button,
  .new-charge-btn,
  .empty-state button,
  .charge-actions button,
  .template-action,
  .save-charge-btn {
    border: 0;
    border-radius: var(--radius-md);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .filter-tabs button {
    padding: 0 12px;
    min-height: 34px;
    background: transparent;
    color: var(--text-secondary);
  }

  .filter-tabs button.active {
    background: var(--accent-color);
    color: var(--accent-ink);
  }

  .new-charge-btn,
  .empty-state button {
    min-height: 44px;
    padding: 0 16px;
    background: var(--accent-color);
    color: var(--accent-ink);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .section-title h2 {
    font-size: 16px;
    font-weight: 800;
  }

  .template-list {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
  }

  .template-list::-webkit-scrollbar {
    display: none;
  }

  .template-item {
    flex: 0 0 auto;
    min-width: 240px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    overflow: hidden;
  }

  .template-main {
    border: 0;
    background: transparent;
    color: var(--text-primary);
    text-align: left;
    display: grid;
    gap: 3px;
    padding: 12px;
    cursor: pointer;
  }

  .template-main strong {
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .template-action {
    width: 44px;
    min-height: 100%;
    border-radius: 0;
    border-left: 1px solid var(--border-color);
    background: transparent;
    color: var(--text-primary);
  }

  .template-action.danger,
  .charge-actions button.danger {
    color: var(--danger-color);
  }

  .charges-list {
    display: grid;
    gap: 12px;
  }

  .charge-item {
    min-height: 112px;
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    padding: 16px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
  }

  .charge-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-md);
    display: grid;
    place-items: center;
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .charge-item.paid .charge-icon {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }

  .charge-main {
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  .charge-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .charge-title-row h3 {
    min-width: 0;
    color: var(--text-primary);
    font-size: 16px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-badge {
    flex: 0 0 auto;
    border-radius: 999px;
    padding: 4px 8px;
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
    font-size: 11px;
    font-weight: 800;
  }

  .status-badge.paid {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }

  .charge-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .charge-tags span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .charge-side {
    display: grid;
    justify-items: end;
    gap: 10px;
  }

  .charge-side > strong {
    color: var(--text-primary);
    font-size: 18px;
    font-weight: 800;
    white-space: nowrap;
  }

  .charge-actions {
    display: flex;
    gap: 6px;
  }

  .charge-actions button {
    width: 38px;
    height: 38px;
    background: var(--bg-input);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
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
    font-size: 20px;
    font-weight: 800;
  }

  .empty-state p {
    max-width: 420px;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.45;
  }

  .charge-form {
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
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 800;
  }

  .form-grid,
  .recurrence-box {
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
  select,
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

  input,
  select {
    min-height: 48px;
    padding: 0 12px;
  }

  textarea {
    padding: 12px;
    resize: vertical;
    line-height: 1.45;
  }

  input:focus,
  select:focus,
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

  .save-charge-btn {
    min-height: 52px;
    color: var(--accent-ink);
    background: var(--accent-color);
  }

  button:disabled,
  input:disabled,
  select:disabled,
  textarea:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  button:active:not(:disabled) {
    transform: scale(0.98);
  }

  @media (max-width: 720px) {
    .team-charges-page {
      padding: 18px 14px var(--bottom-nav-clearance);
      padding-top: var(--page-top-safe);
    }

    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .filter-tabs,
    .new-charge-btn {
      width: 100%;
    }

    .filter-tabs button {
      flex: 1;
    }

    .charge-item {
      grid-template-columns: 42px minmax(0, 1fr);
      align-items: start;
    }

    .charge-side {
      grid-column: 1 / -1;
      justify-items: stretch;
    }

    .charge-actions {
      justify-content: flex-end;
    }

    .form-grid,
    .recurrence-box {
      grid-template-columns: 1fr;
    }
  }
</style>
