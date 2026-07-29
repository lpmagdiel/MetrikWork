<script>
  import { onDestroy } from "svelte";
  import {
    AlertCircle,
    CalendarDays,
    CheckCircle2,
    Clock,
    DollarSign,
    FileImage,
    FileText,
    Filter,
    LoaderCircle,
    Package,
    Pencil,
    Plus,
    ReceiptText,
    Save,
    Search,
    Trash2,
    Upload,
    Users,
    WalletCards,
    X,
  } from "lucide-svelte";
  import {
    EXPENSE_CATEGORIES,
    addManualTeamExpense,
    buildExpenseLedger,
    deleteManualTeamExpense,
    expenseInventoryMovementsStore,
    expensePaymentsStore,
    filterExpenseLedger,
    getExpenseCategoryLabel,
    hasTeamPermission,
    manualTeamExpensesStore,
    selectedTeam,
    selectedTeamId,
    subscribeToTeamExpenses,
    subscribeToTeamLocations,
    summarizeExpenseLedger,
    teamExpensesStateStore,
    teamLocationsStore,
    updateManualTeamExpense,
    userStore,
    validateManualExpenseInput,
  } from "../data/stores.js";
  import { confirmAlert, showErrorAlert, showInfoAlert } from "../data/alerts.js";
  import { navigateTo } from "../router.js";
  import { destroyer, resizeImageFile, uploader } from "../data/fileHelper.js";
  import { optimizeCloudinary, stripImageFileExtension } from "../helpers/image.js";
  import { openSliceContainers } from "../data/ui.js";
  import CircleAddButton from "../components/CircleAddButton.svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import TitleHeader from "../components/TitleHeader.svelte";
  import Toast from "../components/Toast.svelte";

  const CLOUDINARY_PRESET_EXPENSES =
    import.meta.env.VITE_CLOUDINARY_PRESET_EXPENSES ||
    import.meta.env.CLOUDINARY_PRESET_EXPENSES ||
    import.meta.env.VITE_CLOUDINARY_PRESET_GALLERY ||
    import.meta.env.CLOUDINARY_PRESET_GALLERY ||
    "MetricWork";

  const MAX_RECEIPTS = 10;

  const sourceLabels = {
    manual: "Manual",
    payment: "Pagos",
    inventory: "Inventario",
  };

  const statusLabels = {
    paid: "Pagado",
    pending: "Pendiente",
  };

  const methodLabels = {
    cash: "Efectivo",
    transfer: "Transferencia",
    card: "Tarjeta",
    bizum: "Bizum",
    direct_debit: "Domiciliación",
    other: "Otro / no indicado",
  };

  let team = $derived($selectedTeam);
  let teamId = $derived(team?.id || $selectedTeamId);
  let currency = $derived(team?.projectBudgetCurrency || "EUR");
  let canViewPayments = $derived(hasTeamPermission(team, $userStore?.uid, "payments", "view"));
  let canCreateExpenses = $derived(hasTeamPermission(team, $userStore?.uid, "payments", "create"));
  let canEditExpenses = $derived(hasTeamPermission(team, $userStore?.uid, "payments", "edit"));
  let canDeleteExpenses = $derived(hasTeamPermission(team, $userStore?.uid, "payments", "delete"));
  let canViewStats = $derived(hasTeamPermission(team, $userStore?.uid, "stats", "view"));
  let canViewInventory = $derived(hasTeamPermission(team, $userStore?.uid, "inventory", "view"));
  let canViewExpenses = $derived(canViewPayments || canViewStats);
  let includeInventory = $derived(canViewInventory || canViewStats);

  let showExpenseForm = $state(false);
  let editingExpense = $state(null);
  let isSaving = $state(false);
  let deletingExpenseId = $state("");
  let formError = $state("");
  let messageToast = $state("");
  let typeToast = $state("success");
  let showToast = $state(false);

  let receipts = $state([]);
  let removedReceipts = $state([]);
  let isUploadingReceipts = $state(false);
  let receiptFileInput;
  let lightboxReceipts = $state(null);
  let lightboxIndex = $state(0);
  let lightboxRegistered = $state(false);

  let period = $state("month");
  let startDate = $state(getMonthRange().start);
  let endDate = $state(getMonthRange().end);
  let sourceFilter = $state("all");
  let statusFilter = $state("all");
  let categoryFilter = $state("all");
  let search = $state("");
  let expenseForm = $state(createDefaultExpenseForm("EUR"));
  let filtersTeamId = $state("");

  let members = $derived(team?.membersData || []);
  let ledger = $derived(buildExpenseLedger({
    manual: $manualTeamExpensesStore,
    payments: $expensePaymentsStore,
    inventoryMovements: $expenseInventoryMovementsStore,
    members,
    currency,
  }));
  let filteredExpenses = $derived(filterExpenseLedger(ledger, {
    startDate,
    endDate,
    source: sourceFilter,
    status: statusFilter,
    category: categoryFilter,
    search,
  }));
  let summary = $derived(summarizeExpenseLedger(filteredExpenses));
  let availableCategories = $derived.by(() => {
    const categories = new Map();
    ledger.forEach((expense) => {
      categories.set(expense.category, expense.categoryLabel || getExpenseCategoryLabel(expense.category));
    });
    return Array.from(categories, ([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  });
  let categoryBreakdown = $derived.by(() => {
    const totals = new Map();
    filteredExpenses.forEach((expense) => {
      const key = expense.categoryLabel || "Otros";
      totals.set(key, (totals.get(key) || 0) + (Number(expense.amount) || 0));
    });
    return Array.from(totals, ([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  });
  let maxCategoryAmount = $derived(Math.max(...categoryBreakdown.map((item) => item.amount), 1));

  $effect(() => {
    if (!teamId || !canViewExpenses) return subscribeToTeamExpenses(null);
    return subscribeToTeamExpenses(teamId, { includeInventory });
  });

  $effect(() => {
    const nextTeamId = teamId || "";
    if (filtersTeamId === nextTeamId) return;
    filtersTeamId = nextTeamId;
    period = "month";
    ({ start: startDate, end: endDate } = getMonthRange());
    sourceFilter = "all";
    statusFilter = "all";
    categoryFilter = "all";
    search = "";
  });

  $effect(() => {
    if (!includeInventory && sourceFilter === "inventory") sourceFilter = "all";
  });

  $effect(() => {
    if (!teamId || !canViewExpenses) {
      subscribeToTeamLocations(null);
      return;
    }
    subscribeToTeamLocations(teamId);
    return () => subscribeToTeamLocations(null);
  });

  $effect(() => {
    const shouldRegister = Boolean(lightboxReceipts);
    if (shouldRegister === lightboxRegistered) return;

    openSliceContainers.update((count) =>
      Math.max(0, count + (shouldRegister ? 1 : -1)),
    );
    lightboxRegistered = shouldRegister;
  });

  onDestroy(() => {
    if (!lightboxRegistered) return;
    openSliceContainers.update((count) => Math.max(0, count - 1));
  });

  function getLocalDateKey(date = new Date()) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  function getMonthRange(date = new Date()) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { start: getLocalDateKey(start), end: getLocalDateKey(end) };
  }

  function getYearRange(date = new Date()) {
    return {
      start: `${date.getFullYear()}-01-01`,
      end: `${date.getFullYear()}-12-31`,
    };
  }

  function applyPeriod() {
    if (period === "month") {
      ({ start: startDate, end: endDate } = getMonthRange());
    } else if (period === "year") {
      ({ start: startDate, end: endDate } = getYearRange());
    } else if (period === "all") {
      startDate = "";
      endDate = "";
    }
  }

  function handleStartDateChange() {
    if (startDate && endDate && startDate > endDate) endDate = startDate;
  }

  function handleEndDateChange() {
    if (startDate && endDate && endDate < startDate) startDate = endDate;
  }

  function createDefaultExpenseForm(selectedCurrency = currency) {
    const today = getLocalDateKey();
    return {
      title: "",
      description: "",
      amount: "",
      currency: selectedCurrency || "EUR",
      category: "supplies",
      status: "paid",
      method: "card",
      date: today,
      dueDate: "",
      paidAt: today,
      vendorName: "",
      vendorTaxId: "",
      invoiceNumber: "",
      locationId: "",
      locationName: "",
      deductible: true,
      notes: "",
    };
  }

  function openNewExpense() {
    editingExpense = null;
    formError = "";
    expenseForm = createDefaultExpenseForm(currency);
    receipts = [];
    removedReceipts = [];
    showExpenseForm = true;
  }

  function openEditExpense(expense) {
    if (!canManageExpense(expense)) return;
    editingExpense = expense;
    formError = "";
    expenseForm = {
      ...createDefaultExpenseForm(expense.currency || currency),
      title: expense.title || "",
      description: expense.description || "",
      amount: expense.amount || "",
      category: expense.category || "other",
      status: expense.status || "paid",
      method: expense.method || "other",
      date: expense.date || getLocalDateKey(),
      dueDate: expense.dueDate || "",
      paidAt: expense.paidAt || expense.date || "",
      vendorName: expense.vendorName || "",
      vendorTaxId: expense.vendorTaxId || "",
      invoiceNumber: expense.invoiceNumber || "",
      locationId: expense.locationId || "",
      locationName: expense.locationName || "",
      deductible: expense.deductible !== false,
      notes: expense.notes || "",
    };
    receipts = Array.isArray(expense.receipts) ? expense.receipts.map((receipt) => ({ ...receipt })) : [];
    removedReceipts = [];
    showExpenseForm = true;
  }

  $effect(() => {
    if (!showExpenseForm && (editingExpense || receipts.length || removedReceipts.length)) {
      editingExpense = null;
      formError = "";
      receipts = [];
      removedReceipts = [];
      isUploadingReceipts = false;
      if (receiptFileInput) receiptFileInput.value = "";
    }
  });

  function openReceiptPicker() {
    if (isUploadingReceipts) return;
    if (receipts.length >= MAX_RECEIPTS) {
      showInfoAlert(
        "Límite alcanzado",
        `Solo puedes adjuntar hasta ${MAX_RECEIPTS} recibos por gasto.`,
      );
      return;
    }
    receiptFileInput?.click();
  }

  async function handleReceiptsChange(event) {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      showErrorAlert("Archivos no válidos", "Selecciona una o varias imágenes.");
      return;
    }

    const slotsLeft = MAX_RECEIPTS - receipts.length;
    if (slotsLeft <= 0) {
      showInfoAlert(
        "Límite alcanzado",
        `Solo puedes adjuntar hasta ${MAX_RECEIPTS} recibos por gasto.`,
      );
      return;
    }

    const filesToUpload = imageFiles.slice(0, slotsLeft);
    isUploadingReceipts = true;
    try {
      for (const file of filesToUpload) {
        try {
          const resized = await resizeImageFile(file, 1600, {
            type: "image/webp",
            quality: 0.85,
          });
          const url = await uploader(resized, CLOUDINARY_PRESET_EXPENSES);
          receipts = [...receipts, { url, name: file.name }];
        } catch (error) {
          console.error("Error uploading expense receipt:", error);
          showErrorAlert(
            "No se pudo subir el recibo",
            error?.message || "Inténtalo de nuevo con otra imagen.",
          );
        }
      }
    } finally {
      isUploadingReceipts = false;
    }
  }

  function removeReceipt(index) {
    const target = receipts[index];
    if (!target) return;
    if (!target.uploaded) {
      removedReceipts = [...removedReceipts, target.url];
    } else if (editingExpense?.id) {
      removedReceipts = [...removedReceipts, target.url];
    }
    receipts = receipts.filter((_, itemIndex) => itemIndex !== index);
  }

  function openReceiptLightbox(expense, index = 0) {
    if (!expense?.receipts?.length) return;
    lightboxReceipts = expense;
    lightboxIndex = Math.min(Math.max(0, index), expense.receipts.length - 1);
  }

  function closeReceiptLightbox() {
    lightboxReceipts = null;
    lightboxIndex = 0;
  }

  function nextReceipt(delta) {
    if (!lightboxReceipts) return;
    const total = lightboxReceipts.receipts.length;
    if (total <= 1) return;
    lightboxIndex = (lightboxIndex + delta + total) % total;
  }

  function handleStatusChange() {
    if (expenseForm.status === "paid") {
      expenseForm.paidAt ||= expenseForm.date || getLocalDateKey();
    } else {
      expenseForm.paidAt = "";
    }
  }

  function canManageExpense(expense) {
    if (expense?.source !== "manual") return false;
    return canEditExpenses || (
      canCreateExpenses && expense.createdBy && expense.createdBy === $userStore?.uid
    );
  }

  async function cleanupRemovedReceipts(urls) {
    if (!Array.isArray(urls) || !urls.length) return;
    await Promise.all(
      urls.map(async (url) => {
        if (!url || !url.includes("cloudinary.com")) return;
        try {
          await destroyer(url);
        } catch (error) {
          console.warn("No se pudo eliminar el recibo de Cloudinary:", error);
        }
      }),
    );
  }

  async function saveExpense(event) {
    event?.preventDefault();
    if (!teamId || isSaving || !canCreateExpenses && !editingExpense) return;
    if (editingExpense && !canManageExpense(editingExpense)) return;

    const selectedLocation = $teamLocationsStore.find((location) => location.id === expenseForm.locationId);
    const sanitizedReceipts = receipts
      .filter((receipt) => receipt && typeof receipt.url === "string" && receipt.url)
      .slice(0, MAX_RECEIPTS)
      .map((receipt) => ({ url: receipt.url, name: receipt.name || "Recibo" }));
    const payload = {
      ...expenseForm,
      currency,
      locationName: selectedLocation?.name || "",
      receipts: sanitizedReceipts,
    };
    formError = validateManualExpenseInput(payload);
    if (formError) return;

    const receiptsToDelete = [...removedReceipts];
    isSaving = true;
    try {
      if (editingExpense) {
        await updateManualTeamExpense(teamId, editingExpense.id, payload, $userStore, editingExpense);
        showNotification("Gasto actualizado.");
      } else {
        await addManualTeamExpense(teamId, payload, $userStore);
        showNotification("Gasto manual añadido.");
      }
      await cleanupRemovedReceipts(receiptsToDelete);
      showExpenseForm = false;
      editingExpense = null;
      receipts = [];
      removedReceipts = [];
    } catch (error) {
      formError = error?.message || "No se pudo guardar el gasto.";
    } finally {
      isSaving = false;
    }
  }

  async function removeExpense(expense) {
    if (!canDeleteExpenses || expense?.source !== "manual" || deletingExpenseId) return;
    const hasReceipts = Array.isArray(expense.receipts) && expense.receipts.length > 0;
    const text = hasReceipts
      ? `Se eliminará “${expense.title}” y sus ${expense.receipts.length} recibos adjuntos. Esta acción no modifica pagos ni inventario.`
      : `Se eliminará “${expense.title}”. Esta acción no modifica pagos ni inventario.`;
    const confirmed = await confirmAlert({
      title: "Eliminar gasto",
      text,
      confirmButtonText: "Sí, eliminar",
      danger: true,
    });
    if (!confirmed) return;

    deletingExpenseId = expense.id;
    try {
      await deleteManualTeamExpense(teamId, expense.id);
      await cleanupRemovedReceipts(hasReceipts ? expense.receipts.map((receipt) => receipt.url) : []);
      showNotification("Gasto eliminado.");
    } catch (error) {
      showNotification(error?.message || "No se pudo eliminar el gasto.", "error");
    } finally {
      deletingExpenseId = "";
    }
  }

  function showNotification(message, type = "success") {
    messageToast = message;
    typeToast = type;
    showToast = true;
    setTimeout(() => (showToast = false), 3200);
  }

  function goToTeamHome() {
    navigateTo(teamId ? `/teams/${teamId}` : "/teams");
  }

  function formatMoney(amount, selectedCurrency = currency) {
    try {
      return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: selectedCurrency || currency || "EUR",
      }).format(Number(amount) || 0);
    } catch {
      return `${Number(amount || 0).toFixed(2)} ${selectedCurrency || currency}`;
    }
  }

  function formatDate(value) {
    if (!value) return "Sin fecha";
    const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
    if (!year || !month || !day) return "Sin fecha";
    return new Date(year, month - 1, day).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function getSourceIcon(source) {
    if (source === "payment") return DollarSign;
    if (source === "inventory") return Package;
    return ReceiptText;
  }
</script>

<div class="team-expenses-page">
  <Toast bind:show={showToast} message={messageToast} type={typeToast} />

  {#if team && canViewExpenses}
    <main class="expenses-content">
      <TitleHeader title="Gastos" description={team.name || team.team || "Equipo"} action={goToTeamHome} />

      <section class="source-note">
        <div class="source-note-icon"><ReceiptText size={22} /></div>
        <div>
          <strong>Libro de gastos unificado</strong>
          <p>Los pagos a miembros y las entradas de inventario con precio se incorporan automáticamente. Las jornadas pendientes no se suman hasta que existe un pago, evitando duplicar la nómina.</p>
        </div>
      </section>

      <section class="summary-grid" aria-label="Resumen de gastos filtrados">
        <article class="summary-card total">
          <WalletCards size={20} />
          <span>Total comprometido</span>
          <strong>{formatMoney(summary.total)}</strong>
          <small>{summary.count} movimientos</small>
        </article>
        <article class="summary-card paid">
          <CheckCircle2 size={20} />
          <span>Pagado</span>
          <strong>{formatMoney(summary.paid)}</strong>
          <small>Salida ya registrada</small>
        </article>
        <article class="summary-card pending">
          <Clock size={20} />
          <span>Pendiente</span>
          <strong>{formatMoney(summary.pending)}</strong>
          <small>Solo gastos manuales</small>
        </article>
        <article class="summary-card automatic">
          <Filter size={20} />
          <span>Automático</span>
          <strong>{formatMoney(summary.automatic)}</strong>
          <small>Pagos e inventario</small>
        </article>
        <article class="summary-card manual">
          <FileText size={20} />
          <span>Manual</span>
          <strong>{formatMoney(summary.manual)}</strong>
          <small>Introducido por el equipo</small>
        </article>
      </section>

      <section class="filters-card">
        <div class="filter-heading">
          <div><Filter size={18} /><strong>Filtros</strong></div>
          {#if canCreateExpenses}
            <button class="add-expense-button" onclick={openNewExpense}>
              <Plus size={18} /> Añadir gasto
            </button>
          {/if}
        </div>

        <div class="filter-grid">
          <label class="search-field">
            <span>Buscar</span>
            <div><Search size={17} /><input type="search" bind:value={search} placeholder="Concepto, proveedor, factura..." /></div>
          </label>
          <label>
            <span>Periodo</span>
            <select bind:value={period} onchange={applyPeriod}>
              <option value="month">Este mes</option>
              <option value="year">Este año</option>
              <option value="custom">Personalizado</option>
              <option value="all">Todo</option>
            </select>
          </label>
          <label>
            <span>Desde</span>
            <input type="date" max={endDate || undefined} bind:value={startDate} onchange={handleStartDateChange} disabled={period !== "custom"} />
          </label>
          <label>
            <span>Hasta</span>
            <input type="date" min={startDate || undefined} bind:value={endDate} onchange={handleEndDateChange} disabled={period !== "custom"} />
          </label>
          <label>
            <span>Origen</span>
            <select bind:value={sourceFilter}>
              <option value="all">Todos</option>
              <option value="manual">Manuales</option>
              <option value="payment">Pagos</option>
              {#if includeInventory}<option value="inventory">Inventario</option>{/if}
            </select>
          </label>
          <label>
            <span>Estado</span>
            <select bind:value={statusFilter}>
              <option value="all">Todos</option>
              <option value="paid">Pagados</option>
              <option value="pending">Pendientes</option>
            </select>
          </label>
          <label>
            <span>Categoría</span>
            <select bind:value={categoryFilter}>
              <option value="all">Todas</option>
              {#each availableCategories as category (category.value)}
                <option value={category.value}>{category.label}</option>
              {/each}
            </select>
          </label>
        </div>
      </section>

      {#if $teamExpensesStateStore.errors.length}
        <section class="load-warning">
          <AlertCircle size={19} />
          <div>
            <strong>Algunas fuentes no se han podido cargar</strong>
            <p>Se muestran los datos disponibles. Comprueba tus permisos o la conexión.</p>
          </div>
        </section>
      {/if}

      {#if categoryBreakdown.length}
        <section class="category-panel">
          <h2>Principales categorías</h2>
          <div class="category-bars">
            {#each categoryBreakdown as item (item.label)}
              <div class="category-row">
                <div><span>{item.label}</span><strong>{formatMoney(item.amount)}</strong></div>
                <div class="bar-track"><span style={`width: ${(item.amount / maxCategoryAmount) * 100}%`}></span></div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if $teamExpensesStateStore.loading && ledger.length === 0}
        <section class="empty-state" aria-live="polite">
          <div class="loading-dot"></div>
          <h2>Cargando gastos</h2>
          <p>Consultando pagos, inventario y registros manuales.</p>
        </section>
      {:else if filteredExpenses.length === 0}
        <section class="empty-state">
          <ReceiptText size={52} />
          <h2>No hay gastos en este periodo</h2>
          <p>Ajusta los filtros o añade un gasto manual. Los pagos e incorporaciones de inventario aparecerán solos.</p>
          {#if canCreateExpenses}
            <button onclick={openNewExpense}><Plus size={18} /> Añadir gasto</button>
          {/if}
        </section>
      {:else}
        <section class="expense-list" aria-label="Movimientos de gastos">
          {#each filteredExpenses as expense (expense.id)}
            {@const SourceIcon = getSourceIcon(expense.source)}
            <article class:pending={expense.status === "pending"} class="expense-item">
              <div class={`expense-icon ${expense.source}`}><SourceIcon size={21} /></div>
              <div class="expense-main">
                <div class="expense-title-row">
                  <h3>{expense.title}</h3>
                  <span class={`source-badge ${expense.source}`}>{sourceLabels[expense.source] || expense.sourceLabel}</span>
                  <span class:paid={expense.status === "paid"} class="status-badge">{statusLabels[expense.status] || expense.status}</span>
                </div>
                <p>{expense.description || expense.notes || expense.vendorName || expense.categoryLabel}</p>
                <div class="expense-meta">
                  <span><CalendarDays size={13} /> {formatDate(expense.date)}</span>
                  <span>{expense.categoryLabel}</span>
                  <span>{methodLabels[expense.method] || "No indicado"}</span>
                  {#if expense.vendorName}<span>{expense.vendorName}</span>{/if}
                  {#if expense.invoiceNumber}<span>Factura {expense.invoiceNumber}</span>{/if}
                  {#if expense.locationName}<span>{expense.locationName}</span>{/if}
                  {#if expense.source === "manual"}
                    <span>{expense.deductible ? "Pot. deducible" : "No deducible"}</span>
                  {/if}
                  {#if expense.createdByName}<span>Por {expense.createdByName}</span>{/if}
                </div>
                {#if Array.isArray(expense.receipts) && expense.receipts.length}
                  <div class="expense-receipts">
                    {#each expense.receipts.slice(0, 4) as receipt, index (receipt.url)}
                      <button
                        type="button"
                        class="expense-receipt-thumb"
                        aria-label={`Ver ${receipt.name}`}
                        onclick={() => openReceiptLightbox(expense, index)}
                      >
                        <img src={optimizeCloudinary(receipt.url, 96, { height: 96, crop: "fill" })} alt={receipt.name} loading="lazy" decoding="async" />
                      </button>
                    {/each}
                    {#if expense.receipts.length > 4}
                      <button type="button" class="expense-receipt-more" onclick={() => openReceiptLightbox(expense, 4)}>
                        +{expense.receipts.length - 4}
                      </button>
                    {/if}
                    <span class="expense-receipt-count">
                      <FileImage size={13} /> {expense.receipts.length} {expense.receipts.length === 1 ? "recibo" : "recibos"}
                    </span>
                  </div>
                {/if}
              </div>
              <div class="expense-side">
                <strong>{formatMoney(expense.amount, expense.currency)}</strong>
                {#if expense.status === "pending" && expense.dueDate}
                  <small>Vence {formatDate(expense.dueDate)}</small>
                {/if}
                {#if expense.source === "manual"}
                  <div class="expense-actions">
                    {#if canManageExpense(expense)}
                      <button onclick={() => openEditExpense(expense)} aria-label={`Editar ${expense.title}`}><Pencil size={16} /></button>
                    {/if}
                    {#if canDeleteExpenses}
                      <button class="danger" onclick={() => removeExpense(expense)} disabled={deletingExpenseId === expense.id} aria-label={`Eliminar ${expense.title}`}><Trash2 size={16} /></button>
                    {/if}
                  </div>
                {/if}
              </div>
            </article>
          {/each}
        </section>
      {/if}
    </main>

    {#if canCreateExpenses}
      <CircleAddButton floating onClick={openNewExpense} />
    {/if}

    <SliceContainer bind:show={showExpenseForm}>
      <form class="expense-form" onsubmit={saveExpense}>
        <div class="form-heading">
          <span>{editingExpense ? "Editar gasto" : "Nuevo gasto manual"}</span>
          <strong>{team.name || team.team || "Equipo"}</strong>
        </div>

        <section class="form-section">
          <h3>Gasto</h3>
          <label class="full-field">
            <span>Concepto *</span>
            <input type="text" maxlength="120" bind:value={expenseForm.title} placeholder="Combustible, alquiler, reparación..." required />
          </label>
          <label class="full-field">
            <span>Descripción</span>
            <textarea rows="3" maxlength="600" bind:value={expenseForm.description} placeholder="Detalle del gasto"></textarea>
          </label>
          <div class="form-grid">
            <label>
              <span>Importe *</span>
              <div class="amount-field"><input type="number" min="0.01" max="1000000000" step="0.01" inputmode="decimal" bind:value={expenseForm.amount} required /><b>{currency}</b></div>
            </label>
            <label>
              <span>Categoría</span>
              <select bind:value={expenseForm.category}>
                {#each EXPENSE_CATEGORIES as category (category.value)}
                  <option value={category.value}>{category.label}</option>
                {/each}
              </select>
            </label>
            <label>
              <span>Fecha *</span>
              <input type="date" bind:value={expenseForm.date} required />
            </label>
            <label>
              <span>Estado</span>
              <select bind:value={expenseForm.status} onchange={handleStatusChange}>
                <option value="paid">Pagado</option>
                <option value="pending">Pendiente</option>
              </select>
            </label>
            {#if expenseForm.status === "pending"}
              <label>
                <span>Vencimiento</span>
                <input type="date" min={expenseForm.date} bind:value={expenseForm.dueDate} />
              </label>
            {/if}
            <label>
              <span>Método</span>
              <select bind:value={expenseForm.method}>
                {#each Object.entries(methodLabels) as [value, label]}
                  <option {value}>{label}</option>
                {/each}
              </select>
            </label>
          </div>
        </section>

        <section class="form-section">
          <h3>Proveedor y justificante</h3>
          <div class="form-grid">
            <label>
              <span>Proveedor</span>
              <input type="text" maxlength="120" bind:value={expenseForm.vendorName} placeholder="Nombre o empresa" />
            </label>
            <label>
              <span>NIF/CIF</span>
              <input type="text" maxlength="40" bind:value={expenseForm.vendorTaxId} placeholder="Documento fiscal" />
            </label>
            <label>
              <span>N.º factura / ticket</span>
              <input type="text" maxlength="80" bind:value={expenseForm.invoiceNumber} placeholder="Referencia" />
            </label>
            <label>
              <span>Ubicación</span>
              <select bind:value={expenseForm.locationId}>
                <option value="">General del equipo</option>
                {#each $teamLocationsStore as location (location.id)}
                  <option value={location.id}>{location.name}</option>
                {/each}
              </select>
            </label>
          </div>
          <label class="check-field">
            <input type="checkbox" bind:checked={expenseForm.deductible} />
            <span>Marcar como potencialmente deducible</span>
          </label>
          <div class="receipts-field full-field">
            <div class="receipts-heading">
              <span><FileImage size={16} /> Tickets / facturas adjuntos</span>
              <small>{receipts.length}/{MAX_RECEIPTS}</small>
            </div>
            {#if receipts.length}
              <ul class="receipts-list" aria-label="Recibos adjuntos">
                {#each receipts as receipt, index (receipt.url)}
                  <li class="receipt-chip">
                    <div class="receipt-thumb">
                      <img src={optimizeCloudinary(receipt.url, 80, { height: 80, crop: "fill" })} alt={receipt.name} loading="lazy" decoding="async" />
                    </div>
                    <div class="receipt-meta">
                      <strong>{stripImageFileExtension(receipt.name, "Recibo")}</strong>
                      <small>{receipt.name}</small>
                    </div>
                    <button type="button" class="receipt-remove" aria-label={`Quitar ${receipt.name}`} onclick={() => removeReceipt(index)} disabled={isSaving}>
                      <X size={16} />
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
            <div class="receipts-actions">
              <button type="button" class="receipt-add" onclick={openReceiptPicker} disabled={isUploadingReceipts || isSaving || receipts.length >= MAX_RECEIPTS}>
                {#if isUploadingReceipts}
                  <LoaderCircle size={17} class="spin" /> Subiendo...
                {:else}
                  <Upload size={17} /> Adjuntar imagen
                {/if}
              </button>
              <p class="receipts-hint">Fotos de tickets o facturas. Se guardan al confirmar el gasto.</p>
            </div>
            <input
              bind:this={receiptFileInput}
              type="file"
              accept="image/*"
              multiple
              onchange={handleReceiptsChange}
              style="display:none"
            />
          </div>
          <label class="full-field">
            <span>Notas internas</span>
            <textarea rows="3" maxlength="1000" bind:value={expenseForm.notes} placeholder="Observaciones para el equipo"></textarea>
          </label>
        </section>

        {#if formError}<p class="form-error"><AlertCircle size={17} /> {formError}</p>{/if}
        <button class="save-expense-button" type="submit" disabled={isSaving}>
          <Save size={19} /> {isSaving ? "Guardando..." : editingExpense ? "Actualizar gasto" : "Guardar gasto"}
        </button>
      </form>
    </SliceContainer>

    {#if lightboxReceipts}
      <div
        class="receipt-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="Recibo"
        onclick={closeReceiptLightbox}
      >
        <button
          type="button"
          class="receipt-lightbox-close"
          aria-label="Cerrar"
          onclick={(event) => { event.stopPropagation(); closeReceiptLightbox(); }}
        >
          <X size={22} />
        </button>
        <div class="receipt-lightbox-content" onclick={(event) => event.stopPropagation()}>
          {#if lightboxReceipts.receipts.length > 1}
            <button
              type="button"
              class="receipt-lightbox-nav prev"
              aria-label="Anterior"
              onclick={() => nextReceipt(-1)}
            >
              ‹
            </button>
          {/if}
          {#key `${lightboxReceipts.id || 'new'}-${lightboxIndex}`}
            <img
              class="receipt-lightbox-image"
              src={optimizeCloudinary(lightboxReceipts.receipts[lightboxIndex].url, 1600)}
              alt={lightboxReceipts.receipts[lightboxIndex].name}
            />
          {/key}
          {#if lightboxReceipts.receipts.length > 1}
            <button
              type="button"
              class="receipt-lightbox-nav next"
              aria-label="Siguiente"
              onclick={() => nextReceipt(1)}
            >
              ›
            </button>
          {/if}
          <div class="receipt-lightbox-meta">
            <strong>{stripImageFileExtension(lightboxReceipts.receipts[lightboxIndex].name, "Recibo")}</strong>
            <small>{lightboxIndex + 1} de {lightboxReceipts.receipts.length}</small>
          </div>
        </div>
      </div>
    {/if}
  {:else if team}
    <section class="empty-state page-state">
      <Users size={52} />
      <h2>Sin permiso</h2>
      <p>Necesitas permiso para ver pagos o estadísticas del equipo.</p>
      <button onclick={goToTeamHome}>Volver al equipo</button>
    </section>
  {:else}
    <section class="empty-state page-state">
      <Users size={52} />
      <h2>Equipo no disponible</h2>
      <p>Selecciona un equipo para consultar sus gastos.</p>
      <button onclick={goToTeamHome}>Ver equipos</button>
    </section>
  {/if}
</div>

<style>
  .team-expenses-page {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: var(--page-top-safe) 20px var(--bottom-nav-clearance);
    box-sizing: border-box;
    background: var(--bg-page);
    color: var(--text-primary);
  }

  .expenses-content {
    width: min(100%, 1080px);
    margin: 0 auto;
    display: grid;
    gap: 18px;
  }

  .source-note,
  .load-warning {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 15px;
    border: 1px solid color-mix(in srgb, var(--info-color) 32%, var(--border-color));
    border-radius: var(--radius-lg);
    background: var(--bg-info-subtle);
  }

  .source-note-icon {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    background: var(--bg-card);
    color: var(--info-color);
  }

  .source-note strong,
  .load-warning strong { font-size: 14px; }
  .source-note p,
  .load-warning p {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.45;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }

  .summary-card {
    min-height: 118px;
    display: grid;
    align-content: center;
    gap: 5px;
    padding: 15px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
  }

  .summary-card :global(svg) { color: var(--accent-color); }
  .summary-card.paid :global(svg) { color: var(--success-color); }
  .summary-card.pending :global(svg) { color: var(--warning-color); }
  .summary-card.automatic :global(svg) { color: var(--info-color); }
  .summary-card span,
  .summary-card small { color: var(--text-secondary); font-size: 11px; font-weight: 700; }
  .summary-card strong { font-size: 19px; font-weight: 850; overflow-wrap: anywhere; }

  .filters-card,
  .category-panel {
    padding: 16px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
  }

  .filter-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  .filter-heading > div { display: flex; align-items: center; gap: 8px; }
  .add-expense-button,
  .empty-state button,
  .save-expense-button {
    min-height: 42px;
    border: 0;
    border-radius: var(--radius-md);
    padding: 0 15px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    background: var(--accent-color);
    color: var(--accent-ink);
    font: inherit;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .filter-grid,
  .form-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .filter-grid label,
  .expense-form label { display: grid; gap: 6px; min-width: 0; }
  .filter-grid label > span,
  .expense-form label > span { color: var(--text-secondary); font-size: 11px; font-weight: 800; }
  .search-field { grid-column: span 2; }
  .search-field > div,
  .amount-field {
    min-height: 42px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 11px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-secondary);
  }

  .filter-grid input,
  .filter-grid select,
  .expense-form input,
  .expense-form select,
  .expense-form textarea {
    width: 100%;
    min-height: 42px;
    box-sizing: border-box;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 9px 11px;
    background: var(--bg-input);
    color: var(--text-primary);
    font: inherit;
    font-size: 13px;
  }

  .search-field input,
  .amount-field input {
    min-height: auto;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    outline: 0;
  }
  .amount-field b { font-size: 11px; }
  input:disabled { opacity: 0.58; cursor: not-allowed; }

  .load-warning {
    border-color: color-mix(in srgb, var(--warning-color) 38%, var(--border-color));
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .category-panel h2 { margin: 0 0 13px; font-size: 15px; }
  .category-bars { display: grid; gap: 11px; }
  .category-row { display: grid; gap: 5px; }
  .category-row > div:first-child { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; }
  .category-row span { color: var(--text-secondary); font-weight: 700; }
  .category-row strong { font-size: 12px; }
  .bar-track { height: 6px; overflow: hidden; border-radius: 999px; background: var(--bg-input); }
  .bar-track span { display: block; height: 100%; border-radius: inherit; background: var(--accent-color); }

  .expense-list { display: grid; gap: 11px; }
  .expense-item {
    min-height: 112px;
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    padding: 15px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
  }
  .expense-item.pending { border-color: color-mix(in srgb, var(--warning-color) 35%, var(--border-color)); }
  .expense-icon { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 14px; }
  .expense-icon.manual { background: var(--bg-purple-subtle); color: var(--purple-color); }
  .expense-icon.payment { background: var(--bg-success-subtle); color: var(--success-color); }
  .expense-icon.inventory { background: var(--bg-info-subtle); color: var(--info-color); }
  .expense-main { min-width: 0; display: grid; gap: 6px; }
  .expense-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
  .expense-title-row h3 { margin: 0; min-width: 0; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .expense-main > p { margin: 0; color: var(--text-secondary); font-size: 12px; line-height: 1.35; }
  .source-badge,
  .status-badge {
    padding: 3px 7px;
    border-radius: 999px;
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
    font-size: 10px;
    font-weight: 850;
    white-space: nowrap;
  }
  .status-badge.paid { background: var(--bg-success-subtle); color: var(--success-color); }
  .source-badge { background: var(--bg-input); color: var(--text-secondary); }
  .source-badge.payment { background: var(--bg-success-subtle); color: var(--success-color); }
  .source-badge.inventory { background: var(--bg-info-subtle); color: var(--info-color); }
  .source-badge.manual { background: var(--bg-purple-subtle); color: var(--purple-color); }
  .expense-meta { display: flex; flex-wrap: wrap; gap: 6px 11px; }
  .expense-meta span { display: inline-flex; align-items: center; gap: 4px; color: var(--text-secondary); font-size: 11px; font-weight: 650; }
  .expense-side { display: grid; justify-items: end; gap: 6px; }
  .expense-side > strong { font-size: 17px; white-space: nowrap; }
  .expense-side > small { color: var(--warning-color); font-size: 10px; font-weight: 750; }
  .expense-actions { display: flex; gap: 6px; }
  .expense-actions button {
    width: 36px;
    height: 36px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: var(--bg-input);
    color: var(--text-primary);
    cursor: pointer;
  }
  .expense-actions button.danger { color: var(--danger-color); }
  .expense-actions button:disabled { opacity: 0.5; }

  .empty-state {
    min-height: 260px;
    padding: 28px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    display: grid;
    place-items: center;
    align-content: center;
    gap: 10px;
    text-align: center;
    background: var(--bg-card);
  }
  .empty-state h2,
  .empty-state p { margin: 0; }
  .empty-state p { max-width: 560px; color: var(--text-secondary); font-size: 13px; line-height: 1.5; }
  .empty-state :global(svg) { color: var(--text-secondary); }
  .page-state { width: min(100%, 700px); margin: 80px auto 0; box-sizing: border-box; }
  .loading-dot { width: 34px; height: 34px; border: 4px solid var(--border-color); border-top-color: var(--accent-color); border-radius: 50%; animation: spin 0.8s linear infinite; }

  .expense-form { width: min(100%, 860px); margin: 0 auto; padding: 0 14px 28px; box-sizing: border-box; display: grid; gap: 14px; }
  .form-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 4px 0 8px; }
  .form-heading span { font-size: 20px; font-weight: 850; }
  .form-heading strong { color: var(--text-secondary); font-size: 12px; }
  .form-section { padding: 15px; border: 1px solid var(--border-color); border-radius: var(--radius-lg); background: var(--bg-page); display: grid; gap: 12px; }
  .form-section h3 { margin: 0; font-size: 14px; }
  .full-field { grid-column: 1 / -1; }
  .expense-form textarea { resize: vertical; min-height: 76px; }
  .check-field { grid-template-columns: auto 1fr !important; align-items: center; }
  .check-field input { width: 18px; min-height: 18px; accent-color: var(--accent-color); }
  .form-error { margin: 0; padding: 11px; display: flex; align-items: center; gap: 7px; border-radius: var(--radius-md); background: var(--bg-danger-subtle); color: var(--danger-color); font-size: 12px; font-weight: 750; }
  .save-expense-button { width: 100%; min-height: 48px; }
  .save-expense-button:disabled { opacity: 0.6; cursor: wait; }

  .receipts-field {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px dashed color-mix(in srgb, var(--accent-color) 35%, var(--border-color));
    border-radius: var(--radius-md);
    background: var(--bg-input);
  }
  .receipts-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
  }
  .receipts-heading span { display: inline-flex; align-items: center; gap: 6px; }
  .receipts-heading small { font-weight: 700; }
  .receipts-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
  }
  .receipt-chip {
    display: grid;
    grid-template-columns: 56px 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 8px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
  }
  .receipt-thumb {
    width: 56px;
    height: 56px;
    border-radius: 10px;
    overflow: hidden;
    background: var(--bg-input);
    display: grid;
    place-items: center;
  }
  .receipt-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .receipt-meta { min-width: 0; display: grid; gap: 2px; }
  .receipt-meta strong {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .receipt-meta small {
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .receipt-remove {
    width: 32px;
    height: 32px;
    border: 1px solid color-mix(in srgb, var(--danger-color) 35%, var(--border-color));
    border-radius: 10px;
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .receipt-remove:disabled { opacity: 0.5; cursor: not-allowed; }
  .receipts-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }
  .receipt-add {
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid color-mix(in srgb, var(--accent-color) 35%, var(--border-color));
    border-radius: var(--radius-md);
    background: var(--accent-color);
    color: var(--accent-ink);
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
  }
  .receipt-add:disabled { opacity: 0.55; cursor: not-allowed; }
  .receipts-hint { margin: 0; color: var(--text-secondary); font-size: 11px; font-weight: 650; }

  .expense-receipts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }
  .expense-receipt-thumb,
  .expense-receipt-more {
    width: 40px;
    height: 40px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: var(--bg-input);
    color: var(--text-secondary);
    display: grid;
    place-items: center;
    cursor: pointer;
    overflow: hidden;
    padding: 0;
    font: inherit;
    font-size: 11px;
    font-weight: 800;
  }
  .expense-receipt-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .expense-receipt-count {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  .receipt-lightbox {
    position: fixed;
    inset: 0;
    z-index: 160;
    background: rgba(0, 0, 0, 0.78);
    display: grid;
    place-items: center;
    padding: 18px;
    box-sizing: border-box;
  }
  .receipt-lightbox-content {
    position: relative;
    width: min(100%, 900px);
    display: grid;
    place-items: center;
    gap: 12px;
  }
  .receipt-lightbox-image {
    max-width: 100%;
    max-height: 78vh;
    border-radius: 14px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
    background: var(--bg-card);
    object-fit: contain;
  }
  .receipt-lightbox-close {
    position: absolute;
    top: 0;
    right: 0;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 50%;
    background: var(--bg-card);
    color: var(--text-primary);
    display: grid;
    place-items: center;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  }
  .receipt-lightbox-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 42px;
    height: 42px;
    border: 0;
    border-radius: 50%;
    background: var(--bg-card);
    color: var(--text-primary);
    font-size: 22px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  }
  .receipt-lightbox-nav.prev { left: -8px; }
  .receipt-lightbox-nav.next { right: -8px; }
  .receipt-lightbox-meta {
    display: grid;
    gap: 2px;
    text-align: center;
    color: #fff;
  }
  .receipt-lightbox-meta strong { font-size: 14px; font-weight: 800; }
  .receipt-lightbox-meta small { font-size: 11px; opacity: 0.85; font-weight: 700; }

  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 850px) {
    .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .summary-card.total { grid-column: span 2; }
    .filter-grid,
    .form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  @media (max-width: 620px) {
    .team-expenses-page { padding-left: 12px; padding-right: 12px; }
    .source-note { align-items: center; }
    .source-note p { display: none; }
    .filter-heading { align-items: stretch; flex-direction: column; }
    .add-expense-button { width: 100%; }
    .filter-grid,
    .form-grid { grid-template-columns: 1fr; }
    .search-field { grid-column: auto; }
    .expense-item { grid-template-columns: 42px minmax(0, 1fr); align-items: start; gap: 10px; }
    .expense-icon { width: 42px; height: 42px; }
    .expense-side { grid-column: 2; justify-items: start; grid-template-columns: auto 1fr; align-items: center; }
    .expense-side > small { grid-column: 1 / -1; }
    .expense-actions { justify-self: end; }
    .expense-title-row h3 { flex-basis: 100%; }
    .form-heading { align-items: flex-start; flex-direction: column; }
    .receipts-list { grid-template-columns: 1fr; }
    .receipts-actions { flex-direction: column; align-items: stretch; }
    .receipt-add { width: 100%; justify-content: center; }
    .receipt-lightbox { padding: 12px; }
    .receipt-lightbox-nav.prev { left: 4px; }
    .receipt-lightbox-nav.next { right: 4px; }
  }
</style>
