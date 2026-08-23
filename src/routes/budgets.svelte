<script>
  import {
    AlertCircle,
    Building2,
    CalendarDays,
    Check,
    CheckCheck,
    CheckCircle2,
    CheckSquare,
    ChevronDown,
    ChevronUp,
    CircleX,
    FileSpreadsheet,
    FileText,
    Hammer,
    ListChecks,
    Package,
    Pencil,
    Plus,
    Save,
    Search,
    ScrollText,
    Trash2,
    User,
    WalletCards,
    X
  } from "lucide-svelte";
  import {
    acceptBudget,
    addCompanyBudget,
    BUDGET_STATUSES,
    companyBudgetsStore,
    companyClientsStore,
    deleteBudget,
    isConfiguredSystemAdmin,
    isBudgetAccepted,
    rejectBudget,
    subscribeToCompanyBudgets,
    subscribeToCompanyClients,
    systemAdminStore,
    updateBudget,
    userStore,
    validateBudget
  } from "../data/stores.js";
  import {
    teamsStore,
    hasTeamPermission
  } from "../data/stores.js";
  import {
    addBudgetChecklistItems,
    addBudgetChecklistItem,
    CHECKLIST_STATUSES,
    clearBudgetChecklist,
    deleteBudgetChecklistItem,
    getBudgetChecklistStore,
    setBudgetChecklistItemStatus,
    subscribeToBudgetChecklist,
    updateBudgetChecklistItem,
    validateChecklistItem
  } from "../data/budgetChecklist.js";
  import { confirmAlert, promptAlert } from "../data/alerts.js";
  import { navigateTo } from "../router.js";
  import { openBudgetReport } from "../helpers/budgetReport.js";
  import { openReportWindow } from "../helpers/reportExport.js";
  import CircleAddButton from "../components/CircleAddButton.svelte";
  import ClientPicker from "../components/ClientPicker.svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import TitleHeader from "../components/TitleHeader.svelte";
  import Toast from "../components/Toast.svelte";

  // Los presupuestos son globales. Solo el system admin puede crearlos,
  // editarlos o eliminarlos. Cualquier miembro puede verlos y solicitar
  // que se acepten (en una versión futura) o aceptarlos si tiene
  // permisos de payments.create en algún equipo.
  let isAdmin = $derived(
    Boolean($systemAdminStore?.isAdmin) ||
      ($userStore?.email && isConfiguredSystemAdmin($userStore.email))
  );

  let searchTerm = $state("");
  let statusFilter = $state("pending");
  let showForm = $state(false);
  let editingBudgetId = $state(null);
  let isSaving = $state(false);
  let acceptingBudgetId = $state("");
  let rejectingBudgetId = $state("");
  let deletingBudgetId = $state("");
  let showTeamPickerForBudgetId = $state("");
  let formError = $state("");
  let messageToast = $state("");
  let typeToast = $state("success");
  let showToast = $state(false);

  let budgetForm = $state(createEmptyForm());
  let selectedClient = $state(null);

  // --- Checklist state ---------------------------------------------------
  /** Items del checklist que se crearán junto con el presupuesto. */
  let draftChecklist = $state([]);
  /** Budget del que actualmente se escucha el checklist (modo edición). */
  let checklistBudgetId = $state("");
  /** Items vivos del checklist cuando se edita un presupuesto existente. */
  let liveChecklist = $state([]);
  /** Inputs nuevos para añadir items en vivo (modo edición). */
  let newItemTitle = $state("");
  let newItemNotes = $state("");
  let newItemIncludesLabor = $state(true);
  let newItemIncludesMaterials = $state(false);
  /** Estado de UI del detalle expandible por budget. */
  let expandedBudgetId = $state("");

  function createEmptyForm() {
    const today = new Date().toISOString().slice(0, 10);
    const inOneMonth = new Date();
    inOneMonth.setMonth(inOneMonth.getMonth() + 1);
    const validUntil = inOneMonth.toISOString().slice(0, 10);
    return {
      title: "",
      description: "",
      amount: "",
      currency: "MXN",
      validUntil,
      status: BUDGET_STATUSES.pending,
      rejectionReason: "",
      estimatedTime: "",
      paymentTerms: "",
      taxRate: ""
    };
  }

  function createEmptyDraftItem() {
    return {
      title: "",
      notes: "",
      includesLabor: true,
      includesMaterials: false
    };
  }

  function addDraftItem() {
    draftChecklist = [...draftChecklist, createEmptyDraftItem()];
  }

  function updateDraftItem(index, patch) {
    draftChecklist = draftChecklist.map((item, i) =>
      i === index ? { ...item, ...patch } : item
    );
  }

  function removeDraftItem(index) {
    draftChecklist = draftChecklist.filter((_, i) => i !== index);
  }

  $effect(() => {
    return subscribeToCompanyBudgets();
  });

  $effect(() => {
    return subscribeToCompanyClients();
  });

  /**
   * Equipos en los que el usuario actual puede aceptar presupuestos
   * (es decir, donde tiene permisos de payments.create). Solo estos
   * equipos son candidatos al aceptar un presupuesto.
   */
  let eligibleTeams = $derived.by(() => {
    const uid = $userStore?.uid;
    return ($teamsStore || []).filter((team) =>
      hasTeamPermission(team, uid, "payments", "create")
    );
  });

  let filteredBudgets = $derived.by(() => {
    let list = $companyBudgetsStore;
    if (statusFilter !== "all") {
      list = list.filter((budget) => (budget.status || BUDGET_STATUSES.pending) === statusFilter);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (budget) =>
          budget.title?.toLowerCase().includes(term) ||
          budget.clientName?.toLowerCase().includes(term) ||
          budget.client?.name?.toLowerCase().includes(term)
      );
    }
    return list;
  });

  let pendingCount = $derived(
    $companyBudgetsStore.filter((b) => (b.status || BUDGET_STATUSES.pending) === BUDGET_STATUSES.pending).length
  );
  let acceptedCount = $derived($companyBudgetsStore.filter(isBudgetAccepted).length);
  let rejectedCount = $derived(
    $companyBudgetsStore.filter((b) => b.status === BUDGET_STATUSES.rejected).length
  );

  function showNotification(message, type = "success") {
    messageToast = message;
    typeToast = type;
    showToast = true;
    setTimeout(() => (showToast = false), 3000);
  }

  function openCreateForm() {
    if (!isAdmin) return;
    editingBudgetId = null;
    selectedClient = null;
    budgetForm = createEmptyForm();
    draftChecklist = [];
    formError = "";
    showForm = true;
  }

  function openEditForm(budget) {
    if (!isAdmin) return;
    if (isBudgetAccepted(budget)) {
      showNotification("No puedes editar un presupuesto aceptado.", "error");
      return;
    }
    editingBudgetId = budget.id;
    selectedClient =
      $companyClientsStore.find((client) => client.id === budget.clientId) || null;
    budgetForm = {
      title: budget.title || "",
      description: budget.description || "",
      amount: String(budget.amount || ""),
      currency: budget.currency || "MXN",
      validUntil: budget.validUntil || "",
      status: budget.status || BUDGET_STATUSES.pending,
      rejectionReason: budget.rejectionReason || "",
      estimatedTime: budget.estimatedTime || "",
      paymentTerms: budget.paymentTerms || "",
      taxRate: budget.taxRate !== undefined && budget.taxRate !== null ? String(budget.taxRate) : ""
    };
    draftChecklist = [];
    formError = "";
    showForm = true;
  }

  function closeForm() {
    showForm = false;
    editingBudgetId = null;
    selectedClient = null;
    formError = "";
    isSaving = false;
    draftChecklist = [];
  }

  function buildFormPayload() {
    const clientId = selectedClient?.id || "";
    const clientName = selectedClient?.name || "";
    const taxRateNumber = Number(budgetForm.taxRate);
    return {
      title: budgetForm.title.trim(),
      description: budgetForm.description.trim(),
      amount: Number(budgetForm.amount) || 0,
      currency: budgetForm.currency || "MXN",
      clientId,
      clientName,
      clientSnapshot: selectedClient
        ? {
            name: selectedClient.name,
            taxId: selectedClient.taxId,
            email: selectedClient.email,
            phone: selectedClient.phone,
            address: selectedClient.address
          }
        : null,
      validUntil: budgetForm.validUntil,
      status: budgetForm.status || BUDGET_STATUSES.pending,
      estimatedTime: String(budgetForm.estimatedTime || "").trim(),
      paymentTerms: String(budgetForm.paymentTerms || "").trim(),
      taxRate: Number.isFinite(taxRateNumber) && taxRateNumber >= 0 ? taxRateNumber : 0
    };
  }

  /**
   * Items del checklist listos para persistir. Filtra vacíos y los
   * valida uno a uno para mostrar el primer error en el formulario.
   */
  function buildChecklistPayload() {
    return draftChecklist
      .map((item) => ({
        title: String(item.title || "").trim(),
        notes: String(item.notes || "").trim(),
        includesLabor: Boolean(item.includesLabor),
        includesMaterials: Boolean(item.includesMaterials)
      }))
      .filter((item) => item.title.length > 0);
  }

  async function saveBudget() {
    const payload = buildFormPayload();
    const errors = validateBudget(payload);
    if (errors.length) {
      formError = errors[0];
      return;
    }

    // Validamos todos los items del checklist antes de escribir nada.
    const items = buildChecklistPayload();
    for (let i = 0; i < items.length; i++) {
      const itemErrors = validateChecklistItem(items[i]);
      if (itemErrors.length) {
        formError = `Item del checklist ${i + 1}: ${itemErrors[0]}`;
        return;
      }
    }

    isSaving = true;
    formError = "";
    try {
      if (editingBudgetId) {
        await updateBudget(editingBudgetId, payload);
        // Reemplazamos los items existentes solo si hay cambios en el
        // borrador del checklist; los items en vivo se editan en el
        // detalle expandible, no aquí.
        if (draftChecklist.length > 0) {
          await clearBudgetChecklist(editingBudgetId);
          if (items.length > 0) {
            await addBudgetChecklistItems(editingBudgetId, items, $userStore);
          }
        }
        showNotification("Presupuesto actualizado.");
      } else {
        const newId = await addCompanyBudget(payload, $userStore);
        if (items.length > 0) {
          await addBudgetChecklistItems(newId, items, $userStore);
        }
        showNotification(
          items.length > 0
            ? `Presupuesto creado con ${items.length} item(s) en el checklist.`
            : "Presupuesto creado."
        );
      }
      closeForm();
    } catch (error) {
      formError = error?.message || "No se pudo guardar el presupuesto.";
    } finally {
      isSaving = false;
    }
  }

  async function removeBudget(budget) {
    if (!isAdmin || deletingBudgetId) return;
    const confirmed = await confirmAlert({
      title: "Eliminar presupuesto",
      text: `¿Eliminar "${budget.title || "este presupuesto"}"? Se borrarán también sus items de checklist.`,
      confirmButtonText: "Eliminar",
      danger: true
    });
    if (!confirmed) return;

    deletingBudgetId = budget.id;
    try {
      await clearBudgetChecklist(budget.id);
      await deleteBudget(budget.id);
      if (expandedBudgetId === budget.id) {
        expandedBudgetId = "";
      }
      showNotification("Presupuesto eliminado.");
    } catch (error) {
      showNotification(error?.message || "No se pudo eliminar el presupuesto.", "error");
    } finally {
      deletingBudgetId = "";
    }
  }

  function toggleBudgetDetail(budget) {
    if (expandedBudgetId === budget.id) {
      expandedBudgetId = "";
      return;
    }
    expandedBudgetId = budget.id;
  }

  /**
   * Suscribe al checklist del budget actualmente expandido. Se cancela
   * automáticamente cuando cambia el budget o cuando se desmonta el
   * componente.
   */
  $effect(() => {
    if (!expandedBudgetId) {
      liveChecklist = [];
      checklistBudgetId = "";
      return;
    }
    const target = expandedBudgetId;
    checklistBudgetId = target;
    // Hidratamos desde el store cacheado si ya existe una suscripción.
    const cached = getBudgetChecklistStore(target);
    if (cached) {
      cached.subscribe((value) => (liveChecklist = value))();
    }
    const stop = subscribeToBudgetChecklist(target);
    const store = getBudgetChecklistStore(target);
    let unsub;
    if (store) {
      unsub = store.subscribe((value) => (liveChecklist = value));
    }
    return () => {
      if (typeof unsub === "function") unsub();
      if (typeof stop === "function") stop();
    };
  });

  function checklistProgress(items = liveChecklist) {
    if (!items.length) return { total: 0, done: 0, percent: 0 };
    const done = items.filter((item) => item.status === CHECKLIST_STATUSES.done).length;
    return {
      total: items.length,
      done,
      percent: Math.round((done / items.length) * 100)
    };
  }

  async function addLiveItem(budgetId) {
    if (!isAdmin || !budgetId) return;
    const title = newItemTitle.trim();
    if (!title) {
      showNotification("Escribe la descripción del item.", "error");
      return;
    }
    const errors = validateChecklistItem({
      title,
      notes: newItemNotes,
      includesLabor: newItemIncludesLabor,
      includesMaterials: newItemIncludesMaterials
    });
    if (errors.length) {
      showNotification(errors[0], "error");
      return;
    }
    try {
      await addBudgetChecklistItem(budgetId, {
        title,
        notes: newItemNotes.trim(),
        includesLabor: newItemIncludesLabor,
        includesMaterials: newItemIncludesMaterials
      }, $userStore);
      newItemTitle = "";
      newItemNotes = "";
      newItemIncludesLabor = true;
      newItemIncludesMaterials = false;
    } catch (error) {
      showNotification(error?.message || "No se pudo añadir el item.", "error");
    }
  }

  async function toggleLiveItemStatus(budgetId, item) {
    if (!budgetId || !item?.id) return;
    const next = item.status === CHECKLIST_STATUSES.done
      ? CHECKLIST_STATUSES.pending
      : CHECKLIST_STATUSES.done;
    try {
      await setBudgetChecklistItemStatus(budgetId, item.id, next, $userStore);
    } catch (error) {
      showNotification(error?.message || "No se pudo actualizar el item.", "error");
    }
  }

  async function removeLiveItem(budgetId, item) {
    if (!isAdmin || !budgetId || !item?.id) return;
    const confirmed = await confirmAlert({
      title: "Eliminar item",
      text: `¿Eliminar "${item.title}" del checklist?`,
      confirmButtonText: "Eliminar",
      danger: true
    });
    if (!confirmed) return;
    try {
      await deleteBudgetChecklistItem(budgetId, item.id);
    } catch (error) {
      showNotification(error?.message || "No se pudo eliminar el item.", "error");
    }
  }

  async function editLiveItemTitle(budgetId, item) {
    if (!isAdmin || !budgetId || !item?.id) return;
    const next = await promptAlert({
      title: "Editar descripción",
      inputLabel: "Descripción",
      inputValue: item.title || ""
    });
    if (next === null) return;
    const errors = validateChecklistItem({ title: next });
    if (errors.length) {
      showNotification(errors[0], "error");
      return;
    }
    try {
      await updateBudgetChecklistItem(budgetId, item.id, { title: next });
    } catch (error) {
      showNotification(error?.message || "No se pudo actualizar el item.", "error");
    }
  }

  /**
   * Una sola lectura del checklist del presupuesto (no se suscribe).
   * Se usa para exportar PDF desde la lista sin necesidad de expandir
   * la tarjeta. Si el detail está abierto, reusamos `liveChecklist`.
   */
  async function fetchChecklistSnapshot(budgetId) {
    if (!budgetId) return [];
    if (checklistBudgetId === budgetId && liveChecklist.length > 0) {
      return liveChecklist;
    }
    try {
      const { collection, getDocs, orderBy, query } = await import("firebase/firestore");
      const { db } = await import("../data/firebase.js");
      const snapshot = await getDocs(
        query(collection(db, "budgets", budgetId, "checklist"), orderBy("order", "asc"))
      );
      return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    } catch (error) {
      console.warn("No se pudo leer el checklist del presupuesto:", error);
      return [];
    }
  }

  async function exportBudgetPdf(budget) {
    if (!budget) return;
    const reportWindow = openReportWindow();
    if (!reportWindow) {
      showNotification("Permite ventanas emergentes para exportar el PDF.", "error");
      return;
    }
    const checklist = await fetchChecklistSnapshot(budget.id);
    const ok = openBudgetReport({
      budget,
      checklist,
      budgetNumber: budget.id?.slice(0, 6)?.toUpperCase() || "00000",
      targetWindow: reportWindow
    });
    if (!ok) {
      reportWindow.close();
      showNotification("No se pudo generar el PDF del presupuesto.", "error");
    }
  }

  async function startAccept(budget) {
    if (acceptingBudgetId) return;

    if (eligibleTeams.length === 0) {
      showNotification(
        "No tienes permisos en ningún equipo para aceptar presupuestos.",
        "error"
      );
      return;
    }

    if (eligibleTeams.length === 1) {
      await confirmAccept(budget, eligibleTeams[0].id);
      return;
    }

    showTeamPickerForBudgetId = budget.id;
  }

  async function confirmAccept(budget, teamId) {
    showTeamPickerForBudgetId = "";
    const team = eligibleTeams.find((t) => t.id === teamId);
    const teamName = team?.name || team?.team || "el equipo";
    const confirmed = await confirmAlert({
      title: "Aceptar presupuesto",
      text: `Al aceptar, "${budget.title}" se convertirá en un cobro en ${teamName} y se ocultará de la lista de pendientes.`,
      confirmButtonText: "Aceptar y crear cobro",
      confirmColor: "success"
    });
    if (!confirmed) return;

    acceptingBudgetId = budget.id;
    try {
      const result = await acceptBudget(budget.id, teamId, $userStore);
      showNotification(
        `Presupuesto aceptado. Cobro #${result.chargeId.slice(0, 6)} creado en ${teamName}.`
      );
      statusFilter = "accepted";
    } catch (error) {
      showNotification(error?.message || "No se pudo aceptar el presupuesto.", "error");
    } finally {
      acceptingBudgetId = "";
    }
  }

  async function rejectBudgetAction(budget) {
    if (!isAdmin || rejectingBudgetId) return;
    const reason = await promptAlert({
      title: "Rechazar presupuesto",
      text: `Indica el motivo por el que se rechaza "${budget.title}".`,
      inputLabel: "Motivo de rechazo",
      inputPlaceholder: "Fuera de presupuesto, etc.",
      confirmButtonText: "Rechazar",
      danger: true
    });
    if (reason === null) return;

    rejectingBudgetId = budget.id;
    try {
      await rejectBudget(budget.id, reason);
      showNotification("Presupuesto rechazado.");
    } catch (error) {
      showNotification(error?.message || "No se pudo rechazar el presupuesto.", "error");
    } finally {
      rejectingBudgetId = "";
    }
  }

  function handleClearClient() {
    selectedClient = null;
  }

  function goToHome() {
    navigateTo("/");
  }

  function getAcceptedTeamName(budget) {
    if (!budget.acceptedByTeamId) return null;
    const team = ($teamsStore || []).find((t) => t.id === budget.acceptedByTeamId);
    return team?.name || team?.team || null;
  }

  function formatMoney(amount, currency = "MXN") {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency || "MXN",
      maximumFractionDigits: 2
    }).format(Number(amount) || 0);
  }

  function formatDate(value) {
    if (!value) return "Sin fecha";
    const [year, month, day] = String(value).split("-").map(Number);
    if (!year || !month || !day) return "Sin fecha";
    return new Date(year, month - 1, day).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function getStatusLabel(status) {
    const labels = {
      pending: "Pendiente",
      accepted: "Aceptado",
      rejected: "Rechazado",
      expired: "Caducado"
    };
    return labels[status] || "Pendiente";
  }

  function getStatusClass(status) {
    const classes = {
      pending: "status-pending",
      accepted: "status-accepted",
      rejected: "status-rejected",
      expired: "status-expired"
    };
    return classes[status] || "status-pending";
  }
</script>

<div class="budgets-page">
  <Toast message={messageToast} type={typeToast} show={showToast} />
  <TitleHeader title="Presupuestos" description="Constructora" action={goToHome} />

  {#if isAdmin}
    <CircleAddButton onClick={openCreateForm} floating={true} />
  {/if}

  <main class="budgets-content">
    <section class="summary">
      <article class="summary-card pending">
        <ScrollText size={18} />
        <span>Pendientes</span>
        <strong>{pendingCount}</strong>
      </article>
      <article class="summary-card accepted">
        <CheckCircle2 size={18} />
        <span>Aceptados</span>
        <strong>{acceptedCount}</strong>
      </article>
      <article class="summary-card rejected">
        <CircleX size={18} />
        <span>Rechazados</span>
        <strong>{rejectedCount}</strong>
      </article>
      <article class="summary-card total">
        <FileSpreadsheet size={18} />
        <span>Total</span>
        <strong>{$companyBudgetsStore.length}</strong>
      </article>
    </section>

    {#if !isAdmin}
      <p class="readonly-notice">
        <AlertCircle size={16} />
        Los presupuestos son gestionados por el administrador de la empresa. Puedes aceptarlos si tienes permisos de cobros en algún equipo.
      </p>
    {/if}

    <section class="toolbar">
      <div class="filter-tabs" role="tablist" aria-label="Filtrar presupuestos">
        <button
          role="tab"
          aria-selected={statusFilter === "pending"}
          class:active={statusFilter === "pending"}
          onclick={() => (statusFilter = "pending")}
        >
          Pendientes
        </button>
        <button
          role="tab"
          aria-selected={statusFilter === "accepted"}
          class:active={statusFilter === "accepted"}
          onclick={() => (statusFilter = "accepted")}
        >
          Aceptados
        </button>
        <button
          role="tab"
          aria-selected={statusFilter === "rejected"}
          class:active={statusFilter === "rejected"}
          onclick={() => (statusFilter = "rejected")}
        >
          Rechazados
        </button>
        <button
          role="tab"
          aria-selected={statusFilter === "all"}
          class:active={statusFilter === "all"}
          onclick={() => (statusFilter = "all")}
        >
          Todos
        </button>
      </div>

      <div class="search-input">
        <Search size={18} />
        <input
          type="search"
          placeholder="Buscar por título o cliente"
          bind:value={searchTerm}
        />
      </div>

      {#if isAdmin}
        <button class="new-budget-btn" onclick={openCreateForm}>
          <Plus size={18} />
          <span>Nuevo presupuesto</span>
        </button>
      {/if}
    </section>

    {#if filteredBudgets.length === 0}
      <div class="empty-state">
        <ScrollText size={54} />
        <h2>Sin presupuestos</h2>
        <p>
          {#if statusFilter === "pending" && $companyBudgetsStore.length === 0}
            Cuando el administrador cree el primer presupuesto, aparecerá aquí para enviarlo a clientes y convertirlo en cobro al aceptarlo.
          {:else if statusFilter === "accepted"}
            Los presupuestos aceptados se convierten en cobros en el equipo seleccionado.
          {:else}
            No hay presupuestos que coincidan con el filtro actual.
          {/if}
        </p>
        {#if statusFilter === "pending" && $companyBudgetsStore.length === 0 && isAdmin}
          <button onclick={openCreateForm}>
            <Plus size={18} />
            Crear primer presupuesto
          </button>
        {/if}
      </div>
    {:else}
      <section class="budgets-list">
        {#each filteredBudgets as budget (budget.id)}
          {@const status = budget.status || BUDGET_STATUSES.pending}
          {@const acceptedTeamName = getAcceptedTeamName(budget)}
          {@const isExpanded = expandedBudgetId === budget.id}
          <article class="budget-card {getStatusClass(status)}" class:expanded={isExpanded}>
            <div class="budget-icon">
              <ScrollText size={22} />
            </div>
            <div class="budget-main">
              <div class="budget-title-row">
                <h3>{budget.title || "Presupuesto sin título"}</h3>
                <span class="status-badge {getStatusClass(status)}">
                  {getStatusLabel(status)}
                </span>
              </div>
              <p class="budget-client">
                <User size={13} />
                {budget.clientName || budget.clientSnapshot?.name || "Cliente sin asignar"}
              </p>
              {#if budget.description}
                <p class="budget-description">{budget.description}</p>
              {/if}
              <div class="budget-tags">
                <span><CalendarDays size={13} /> Válido hasta {formatDate(budget.validUntil)}</span>
                {#if budget.estimatedTime}
                  <span>⏱ {budget.estimatedTime}</span>
                {/if}
                {#if isBudgetAccepted(budget) && budget.acceptedChargeId}
                  <span>
                    <WalletCards size={13} />
                    Cobro #{budget.acceptedChargeId.slice(0, 6)}
                  </span>
                {/if}
                {#if isBudgetAccepted(budget) && acceptedTeamName}
                  <span>
                    <Building2 size={13} />
                    {acceptedTeamName}
                  </span>
                {/if}
                {#if budget.status === BUDGET_STATUSES.rejected && budget.rejectionReason}
                  <span class="rejection-reason">Motivo: {budget.rejectionReason}</span>
                {/if}
              </div>
              <button
                type="button"
                class="detail-toggle"
                onclick={() => toggleBudgetDetail(budget)}
                aria-expanded={isExpanded}
              >
                <ListChecks size={14} />
                <span>Checklist y PDF</span>
                {#if isExpanded}
                  <ChevronUp size={14} />
                {:else}
                  <ChevronDown size={14} />
                {/if}
              </button>
            </div>
            <div class="budget-side">
              <strong>{formatMoney(budget.amount, budget.currency)}</strong>
              <div class="budget-actions">
                <button
                  class="action-btn"
                  onclick={() => exportBudgetPdf(budget)}
                  title="Exportar PDF del presupuesto"
                  aria-label="Exportar PDF"
                >
                  <FileText size={16} />
                </button>
                {#if !isBudgetAccepted(budget) && eligibleTeams.length > 0}
                  <button
                    class="action-btn success"
                    onclick={() => startAccept(budget)}
                    disabled={acceptingBudgetId === budget.id}
                    title="Marcar aceptado y crear cobro en un equipo"
                    aria-label="Aceptar presupuesto"
                  >
                    <CheckCircle2 size={17} />
                  </button>
                {/if}
                {#if isAdmin && !isBudgetAccepted(budget)}
                  <button
                    class="action-btn danger"
                    onclick={() => rejectBudgetAction(budget)}
                    disabled={rejectingBudgetId === budget.id}
                    title="Rechazar"
                    aria-label="Rechazar presupuesto"
                  >
                    <CircleX size={17} />
                  </button>
                  <button
                    class="action-btn"
                    onclick={() => openEditForm(budget)}
                    aria-label="Editar presupuesto"
                  >
                    <Pencil size={16} />
                  </button>
                {/if}
                {#if isAdmin}
                  <button
                    class="action-btn danger"
                    onclick={() => removeBudget(budget)}
                    disabled={deletingBudgetId === budget.id}
                    aria-label="Eliminar presupuesto"
                  >
                    <Trash2 size={16} />
                  </button>
                {/if}
              </div>
            </div>

            {#if isExpanded}
              <div class="budget-detail" data-testid="budget-detail">
                <div class="detail-header">
                  <div>
                    <strong><CheckSquare size={14} /> Checklist del presupuesto</strong>
                    <span class="detail-sub">
                      Marca los items completados. Se exportan también al PDF.
                    </span>
                  </div>
                  <button
                    type="button"
                    class="primary-btn small"
                    onclick={() => exportBudgetPdf(budget)}
                  >
                    <FileText size={14} />
                    <span>Exportar PDF</span>
                  </button>
                </div>

                {#if checklistBudgetId === budget.id && liveChecklist.length > 0}
                  {@const progress = checklistProgress(liveChecklist)}
                  <div class="checklist-progress">
                    <div class="progress-bar">
                      <div class="progress-fill" style="width: {progress.percent}%"></div>
                    </div>
                    <span class="progress-label">
                      {progress.done} / {progress.total} completados
                    </span>
                  </div>
                  <ul class="live-checklist">
                    {#each liveChecklist as item (item.id)}
                      <li class="live-checklist-item" class:done={item.status === CHECKLIST_STATUSES.done}>
                        <button
                          type="button"
                          class="check-toggle"
                          onclick={() => toggleLiveItemStatus(budget.id, item)}
                          title={item.status === CHECKLIST_STATUSES.done ? "Marcar pendiente" : "Marcar completado"}
                          aria-label={item.status === CHECKLIST_STATUSES.done ? "Marcar pendiente" : "Marcar completado"}
                        >
                          {#if item.status === CHECKLIST_STATUSES.done}
                            <CheckCheck size={18} />
                          {:else}
                            <Check size={18} />
                          {/if}
                        </button>
                        <div class="item-body">
                          {#if isAdmin}
                            <button
                              type="button"
                              class="item-title-btn"
                              onclick={() => editLiveItemTitle(budget.id, item)}
                            >
                              {item.title}
                            </button>
                          {:else}
                            <span class="item-title">{item.title}</span>
                          {/if}
                          {#if item.notes}
                            <small class="item-notes">{item.notes}</small>
                          {/if}
                          <div class="item-flags">
                            {#if item.includesLabor}
                              <span class="flag-chip labor"><Hammer size={12} /> Mano de obra</span>
                            {/if}
                            {#if item.includesMaterials}
                              <span class="flag-chip materials"><Package size={12} /> Materiales</span>
                            {/if}
                          </div>
                        </div>
                        {#if isAdmin}
                          <button
                            type="button"
                            class="action-btn danger small"
                            onclick={() => removeLiveItem(budget.id, item)}
                            aria-label="Eliminar item"
                          >
                            <Trash2 size={14} />
                          </button>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {:else}
                  <p class="empty-checklist inline">
                    Aún no hay líneas en el checklist. Añade la primera abajo.
                  </p>
                {/if}

                {#if isAdmin}
                  <div class="add-item-row">
                    <input
                      type="text"
                      placeholder="Descripción del trabajo (ej. Mano de obra escalera)"
                      bind:value={newItemTitle}
                      onkeydown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addLiveItem(budget.id);
                        }
                      }}
                    />
                    <label class="flag-toggle">
                      <input type="checkbox" bind:checked={newItemIncludesLabor} />
                      <Hammer size={14} />
                      <span>Mano de obra</span>
                    </label>
                    <label class="flag-toggle">
                      <input type="checkbox" bind:checked={newItemIncludesMaterials} />
                      <Package size={14} />
                      <span>Materiales</span>
                    </label>
                    <button
                      type="button"
                      class="primary-btn small"
                      onclick={() => addLiveItem(budget.id)}
                    >
                      <Plus size={14} />
                      <span>Añadir</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    class="add-item-notes"
                    placeholder="Notas opcionales (ej. No incluye ventana)"
                    bind:value={newItemNotes}
                  />
                {/if}
              </div>
            {/if}
          </article>
        {/each}
      </section>
    {/if}
  </main>

  <SliceContainer bind:show={showForm}>
    <section class="budget-form">
      <div class="form-heading">
        <span>{editingBudgetId ? "Editar presupuesto" : "Nuevo presupuesto"}</span>
        <strong>Empresa</strong>
      </div>

      <div class="form-section">
        <h3>Cliente</h3>
        <ClientPicker
          clients={$companyClientsStore}
          selectedClient={selectedClient}
          onSelect={(client) => (selectedClient = client)}
          onClear={handleClearClient}
          label="Cliente del presupuesto"
          allowCreate={false}
        />
        {#if !isAdmin && $companyClientsStore.length === 0}
          <p class="field-help">
            Aún no hay clientes registrados. Pide al administrador que cree los clientes de la empresa.
          </p>
        {/if}
      </div>

      <div class="form-section">
        <h3>Detalles</h3>
        <label>
          <span>Título *</span>
          <input
            type="text"
            bind:value={budgetForm.title}
            placeholder="Reforma integral de cocina"
            required
          />
        </label>
        <label>
          <span>Descripción</span>
          <textarea
            bind:value={budgetForm.description}
            rows="3"
            placeholder="Detalle del alcance y condiciones"
          ></textarea>
        </label>
        <div class="form-grid">
          <label>
            <span>Importe *</span>
            <input
              type="number"
              min="0"
              step="0.01"
              bind:value={budgetForm.amount}
              placeholder="0.00"
              required
            />
          </label>
          <label>
            <span>Moneda</span>
            <select bind:value={budgetForm.currency}>
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="COP">COP</option>
              <option value="ARS">ARS</option>
              <option value="CLP">CLP</option>
              <option value="PEN">PEN</option>
              <option value="GBP">GBP</option>
            </select>
          </label>
          <label>
            <span>Válido hasta</span>
            <input type="date" bind:value={budgetForm.validUntil} />
          </label>
          <label>
            <span>IVA (%)</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              bind:value={budgetForm.taxRate}
              placeholder="21"
            />
          </label>
          <label>
            <span>Tiempo estimado</span>
            <input
              type="text"
              bind:value={budgetForm.estimatedTime}
              placeholder="3 semanas"
            />
          </label>
          <label>
            <span>Forma de pago</span>
            <input
              type="text"
              bind:value={budgetForm.paymentTerms}
              placeholder="50% adelanto, 30% avance, 20% final"
            />
          </label>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-header">
          <h3>
            <ListChecks size={16} />
            Checklist inicial
          </h3>
          <button type="button" class="ghost-btn" onclick={addDraftItem}>
            <Plus size={16} />
            <span>Añadir línea</span>
          </button>
        </div>
        <p class="field-help">
          Estas líneas aparecen en el PDF y podrás editarlas más tarde desde el detalle del presupuesto.
          Marca si incluyen mano de obra y/o materiales.
        </p>
        {#if draftChecklist.length === 0}
          <p class="empty-checklist">Sin líneas todavía. Añade la primera para crear el checklist al guardar.</p>
        {:else}
          <ul class="draft-checklist">
            {#each draftChecklist as item, index (index)}
              <li>
                <div class="draft-row">
                  <input
                    type="text"
                    placeholder="Descripción del trabajo"
                    value={item.title}
                    oninput={(event) => updateDraftItem(index, { title: event.currentTarget.value })}
                  />
                  <button
                    type="button"
                    class="ghost-btn icon-only danger"
                    onclick={() => removeDraftItem(index)}
                    aria-label="Eliminar línea"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <input
                  type="text"
                  class="draft-notes"
                  placeholder="Notas (opcional, ej. No incluye ventana)"
                  value={item.notes}
                  oninput={(event) => updateDraftItem(index, { notes: event.currentTarget.value })}
                />
                <div class="draft-flags">
                  <label class="flag-toggle">
                    <input
                      type="checkbox"
                      checked={item.includesLabor}
                      onchange={(event) => updateDraftItem(index, { includesLabor: event.currentTarget.checked })}
                    />
                    <Hammer size={14} />
                    <span>Mano de obra</span>
                  </label>
                  <label class="flag-toggle">
                    <input
                      type="checkbox"
                      checked={item.includesMaterials}
                      onchange={(event) => updateDraftItem(index, { includesMaterials: event.currentTarget.checked })}
                    />
                    <Package size={14} />
                    <span>Materiales</span>
                  </label>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
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
          onclick={saveBudget}
          disabled={isSaving || !budgetForm.title.trim() || !selectedClient}
        >
          {#if isSaving}
            <span>Guardando...</span>
          {:else}
            <Save size={18} />
            <span>{editingBudgetId ? "Actualizar" : "Crear presupuesto"}</span>
          {/if}
        </button>
      </div>
    </section>
  </SliceContainer>

  <SliceContainer bind:show={showTeamPickerForBudgetId}>
    <section class="team-picker-slice">
      <div class="team-picker-header">
        <span>Aceptar presupuesto</span>
        <h2>Elige un equipo</h2>
        <p>El cobro se creará en el equipo seleccionado, donde quedará ligado a su presupuesto.</p>
      </div>

      <div class="team-picker-list">
        {#each eligibleTeams as team (team.id)}
          <button
            type="button"
            class="team-picker-item"
            disabled={!!acceptingBudgetId}
            onclick={() => confirmAccept(
              $companyBudgetsStore.find((b) => b.id === showTeamPickerForBudgetId) ||
                { id: showTeamPickerForBudgetId },
              team.id
            )}
          >
            <span class="team-picker-icon charges">
              <Building2 size={18} />
            </span>
            <span>
              <strong>{team.name || team.team || "Equipo"}</strong>
              <small>{team.members?.length || 0} miembros</small>
            </span>
            <CheckCircle2 size={18} />
          </button>
        {/each}
      </div>
    </section>
  </SliceContainer>
</div>

<style>
  .budgets-page {
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

  .budgets-content {
    width: min(100%, 980px);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
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

  .summary-card.pending :global(svg) {
    color: var(--warning-color);
  }

  .summary-card.accepted :global(svg) {
    color: var(--success-color);
  }

  .summary-card.rejected :global(svg) {
    color: var(--danger-color);
  }

  .summary-card span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
  }

  .summary-card strong {
    color: var(--text-primary);
    font-size: 22px;
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

  .filter-tabs {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
  }

  .filter-tabs button {
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font: inherit;
    font-weight: 700;
    padding: 0 12px;
    min-height: 38px;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .filter-tabs button.active {
    background: var(--accent-color);
    color: var(--accent-ink);
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

  .new-budget-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--accent-color);
    color: var(--accent-ink);
    font-weight: 700;
    cursor: pointer;
    min-height: 48px;
    padding: 0 16px;
  }

  .new-budget-btn:active {
    transform: scale(0.98);
  }

  .budgets-list {
    display: grid;
    gap: 12px;
  }

  .budget-card {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    padding: 16px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
  }

  .budget-card.status-accepted {
    border-color: color-mix(in srgb, var(--success-color) 32%, var(--border-color));
  }

  .budget-card.status-rejected {
    border-color: color-mix(in srgb, var(--danger-color) 24%, var(--border-color));
    opacity: 0.85;
  }

  .budget-icon {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .budget-card.status-accepted .budget-icon {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }

  .budget-card.status-rejected .budget-icon {
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
  }

  .budget-main {
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  .budget-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .budget-title-row h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 16px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .status-badge {
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .status-badge.status-pending {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .status-badge.status-accepted {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }

  .status-badge.status-rejected {
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
  }

  .budget-client {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .budget-description {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.4;
  }

  .budget-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .budget-tags span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .rejection-reason {
    color: var(--danger-color);
    font-style: italic;
  }

  .budget-side {
    display: grid;
    justify-items: end;
    gap: 10px;
  }

  .budget-side strong {
    color: var(--text-primary);
    font-size: 18px;
    font-weight: 800;
    white-space: nowrap;
  }

  .budget-actions {
    display: flex;
    gap: 6px;
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
  }

  .action-btn.success {
    background: var(--bg-success-subtle);
    color: var(--success-color);
    border-color: color-mix(in srgb, var(--success-color) 24%, transparent);
  }

  .action-btn.danger {
    color: var(--danger-color);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn:active:not(:disabled) {
    transform: scale(0.94);
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
    max-width: 480px;
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

  .budget-form {
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

  .field-help {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.4;
    margin-top: 5px;
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

  .primary-btn.small,
  .secondary-btn.small,
  .ghost-btn {
    min-height: 38px;
    padding: 0 12px;
    font-size: 13px;
  }

  .ghost-btn {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    color: var(--text-primary);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .ghost-btn.icon-only {
    padding: 0;
    width: 38px;
    justify-content: center;
  }

  .ghost-btn.danger {
    color: var(--danger-color);
  }

  .ghost-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  /* --- Detail toggle + checklist ------------------------------------ */
  .detail-toggle {
    margin-top: 8px;
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    font: inherit;
    font-weight: 700;
    font-size: 12px;
    padding: 6px 10px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    align-self: flex-start;
  }

  .detail-toggle:hover {
    color: var(--text-primary);
    border-color: var(--accent-color);
  }

  .budget-card.expanded {
    grid-template-columns: 56px minmax(0, 1fr) auto;
  }

  .budget-detail {
    grid-column: 1 / -1;
    margin-top: 8px;
    padding: 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .detail-header strong {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 800;
    color: var(--text-primary);
  }

  .detail-sub {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .checklist-progress {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .progress-bar {
    flex: 1;
    height: 6px;
    background: var(--border-color);
    border-radius: 999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--success-color);
    transition: width 0.2s ease;
  }

  .progress-label {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .live-checklist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .live-checklist-item {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
  }

  .live-checklist-item.done .item-title,
  .live-checklist-item.done .item-title-btn {
    text-decoration: line-through;
    color: var(--text-secondary);
  }

  .check-toggle {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    background: var(--bg-input);
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .live-checklist-item.done .check-toggle {
    background: var(--bg-success-subtle);
    color: var(--success-color);
    border-color: color-mix(in srgb, var(--success-color) 32%, transparent);
  }

  .item-body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .item-title-btn,
  .item-title {
    text-align: left;
    border: 0;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-weight: 700;
    font-size: 14px;
    padding: 0;
    cursor: text;
  }

  .item-notes {
    color: var(--text-secondary);
    font-size: 12px;
    font-style: italic;
  }

  .item-flags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .flag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
  }

  .flag-chip.labor {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .flag-chip.materials {
    background: var(--bg-accent-subtle);
    color: var(--accent-strong);
  }

  .action-btn.small {
    width: 30px;
    height: 30px;
  }

  .add-item-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  .add-item-row input[type="text"] {
    flex: 1;
    min-width: 180px;
  }

  .add-item-notes {
    width: 100%;
  }

  /* --- Draft checklist editor inside form ---------------------------- */
  .form-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .form-section-header h3 {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
  }

  .draft-checklist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .draft-checklist li {
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .draft-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .draft-row input {
    flex: 1;
  }

  .draft-notes {
    width: 100%;
  }

  .draft-flags {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
  }

  .flag-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .flag-toggle input {
    width: auto;
    min-height: auto;
    margin: 0;
  }

  .empty-checklist {
    color: var(--text-secondary);
    font-size: 13px;
    margin: 0;
  }

  .empty-checklist.inline {
    padding: 10px 12px;
    background: var(--bg-card);
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-md);
  }

  .team-picker-slice {
    width: 100%;
    padding: 0 20px 28px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .team-picker-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .team-picker-header span {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
  }

  .team-picker-header h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: 26px;
    line-height: 1;
    font-weight: 800;
  }

  .team-picker-header p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.45;
  }

  .team-picker-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .team-picker-item {
    width: 100%;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    transition: all 0.18s ease;
  }

  .team-picker-item:active:not(:disabled) {
    transform: scale(0.99);
  }

  .team-picker-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .team-picker-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--bg-accent-subtle);
    color: var(--accent-strong);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .team-picker-icon.charges {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .team-picker-item strong {
    display: block;
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 800;
  }

  .team-picker-item small {
    display: block;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
    margin-top: 2px;
  }

  @media (max-width: 720px) {
    .budgets-page {
      padding: 18px 14px var(--bottom-nav-clearance);
    }

    .summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .search-input,
    .filter-tabs,
    .new-budget-btn {
      width: 100%;
    }

    .filter-tabs {
      overflow-x: auto;
    }

    .filter-tabs button {
      flex: 1;
      white-space: nowrap;
    }

.budget-card {
      grid-column: 1 / -1;
      justify-items: stretch;
    }

    .add-item-row {
      flex-direction: column;
      align-items: stretch;
    }

    .add-item-row button {
      width: 100%;
    }

    .budget-side {
      grid-column: 1 / -1;
      justify-items: stretch;
    }

    .budget-actions {
      justify-content: flex-end;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }
  }
</style>