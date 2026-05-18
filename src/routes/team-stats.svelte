<script>
  import {
    AlertCircle,
    BarChart3,
    Clock,
    DollarSign,
    Filter,
    MapPin,
    Package,
    Save,
    TrendingUp,
    Users,
    WalletCards,
  } from "lucide-svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import Toast from "../components/Toast.svelte";
  import TitleHeader from "../components/TitleHeader.svelte";
  import { navigateTo } from "../router.js";
  import {
    getTeamAdvancedStatsData,
    hasTeamPermission,
    selectedTeam,
    selectedTeamId,
    updateTeamBudget,
    userStore,
  } from "../data/stores.js";

  let team = $derived($selectedTeam);
  let canViewStats = $derived(hasTeamPermission(team, $userStore?.uid, "stats", "view"));
  let canEditStats = $derived(hasTeamPermission(team, $userStore?.uid, "stats", "edit"));

  let works = $state([]);
  let payments = $state([]);
  let inventory = $state([]);
  let locations = $state([]);
  let isLoading = $state(false);
  let isSavingBudget = $state(false);
  let period = $state("month");
  let startDate = $state(getPeriodRange("month").start);
  let endDate = $state(getPeriodRange("month").end);
  let selectedLocationId = $state("all");
  let selectedMemberId = $state("all");
  let budgetAmount = $state(0);
  let budgetCurrency = $state("MXN");
  let messageToast = $state("");
  let typeToast = $state("success");
  let showToast = $state(false);

  const periodLabels = {
    week: "Semana",
    month: "Mes",
    quarter: "Trimestre",
    year: "Año",
    custom: "Manual",
  };

  const currencyOptions = ["MXN", "USD", "EUR"];

  let members = $derived.by(() => {
    const byId = new Map();
    (team?.membersData || []).forEach((member) => {
      if (!member?.id) return;
      byId.set(member.id, {
        id: member.id,
        name: member.name || member.email || "Usuario",
        email: member.email || "",
      });
    });
    (team?.members || []).forEach((memberId) => {
      if (!byId.has(memberId)) byId.set(memberId, { id: memberId, name: "Usuario" });
    });
    return Array.from(byId.values()).sort((a, b) =>
      (a.name || a.email || "Usuario").localeCompare(b.name || b.email || "Usuario"),
    );
  });

  let range = $derived.by(() => {
    if (period === "custom") {
      return { start: startDate, end: endDate };
    }
    return getPeriodRange(period);
  });

  let locationMap = $derived.by(() => {
    const map = new Map();
    locations.forEach((location) => map.set(location.id, location));
    return map;
  });

  let memberLocationMap = $derived.by(() => {
    const map = new Map();
    locations.forEach((location) => {
      (location.assignedMemberIds || []).forEach((memberId) => {
        if (!map.has(memberId)) map.set(memberId, location.id);
      });
    });
    return map;
  });

  let filteredWorks = $derived.by(() =>
    works.filter((work) => {
      if (!dateInRange(work.date, range)) return false;
      if (!matchesMember(work.userId)) return false;
      return matchesWorkLocation(work, selectedLocationId);
    }),
  );

  let filteredPayments = $derived.by(() =>
    payments.filter((payment) => {
      if (!dateInRange(payment.date || payment.createdAt, range)) return false;
      if (!matchesMember(payment.userId)) return false;
      return matchesPaymentLocation(payment, selectedLocationId);
    }),
  );

  let currentConsumables = $derived.by(() =>
    inventory.filter((item) => isConsumable(item) && matchesProductLocation(item, selectedLocationId)),
  );

  let consumablesInRange = $derived.by(() =>
    currentConsumables.filter((item) => {
      const dateKey = getDateKey(item.createdAt || item.updatedAt);
      return !dateKey || dateInRange(dateKey, range);
    }),
  );

  let summary = $derived.by(() => {
    let fullDays = 0;
    let halfDays = 0;
    let variableHours = 0;
    let overtimeHours = 0;
    let laborCost = 0;
    const activeDates = new Set();
    const activeMembers = new Set();
    const activeLocations = new Set();

    filteredWorks.forEach((work) => {
      if (work.type === "full-day") fullDays += 1;
      if (work.type === "half-day") halfDays += 1;
      if (work.type === "variable") variableHours += Number(work.variableHours || work.durationHours) || 0;
      overtimeHours += Number(work.overtimeHours) || 0;
      laborCost += getWorkLaborCost(work);
      if (work.date) activeDates.add(work.date);
      if (work.userId) activeMembers.add(work.userId);
      const locationId = getWorkLocationId(work);
      if (locationId) activeLocations.add(locationId);
    });

    const consumableCost = consumablesInRange.reduce(
      (sum, item) => sum + getProductCost(item),
      0,
    );
    const currentConsumableValue = currentConsumables.reduce(
      (sum, item) => sum + getProductCost(item),
      0,
    );
    const paymentsCost = filteredPayments.reduce(
      (sum, payment) => sum + (Number(payment.amount) || 0),
      0,
    );
    const totalWorkDays = fullDays + halfDays / 2 + variableHours / 8;
    const payrollExposure = Math.max(laborCost, paymentsCost);
    const spentAgainstBudget = payrollExposure + consumableCost;
    const projectBudget = Number(team?.projectBudget) || 0;
    const scopedLocations = locations.filter(
      (location) => selectedLocationId === "all" || location.id === selectedLocationId,
    );
    const totalLocationBudget = scopedLocations.reduce(
      (sum, location) => sum + (Number(location.budget) || 0),
      0,
    );
    const budgetBase =
      selectedLocationId !== "all" && totalLocationBudget > 0
        ? totalLocationBudget
        : projectBudget > 0
          ? projectBudget
          : totalLocationBudget;
    const budgetRemaining = budgetBase - spentAgainstBudget;
    const budgetUsage = budgetBase > 0 ? (spentAgainstBudget / budgetBase) * 100 : 0;
    const pendingPayroll = Math.max(laborCost - paymentsCost, 0);

    return {
      fullDays,
      halfDays,
      variableHours,
      overtimeHours,
      totalWorkDays,
      laborCost,
      consumableCost,
      currentConsumableValue,
      paymentsCost,
      payrollExposure,
      spentAgainstBudget,
      projectBudget,
      totalLocationBudget,
      budgetBase,
      budgetRemaining,
      budgetUsage,
      pendingPayroll,
      totalWorks: filteredWorks.length,
      totalPayments: filteredPayments.length,
      activeDates: activeDates.size,
      activeMembers: activeMembers.size,
      activeLocations: activeLocations.size,
      lowStockItems: currentConsumables.filter(
        (item) => Number(item.quantity) <= Number(item.minStock || 0),
      ).length,
    };
  });

  let expenseDistribution = $derived.by(() => [
    {
      label: "Jornadas",
      value: summary.laborCost,
      color: "var(--info-color)",
    },
    {
      label: "Pagos",
      value: summary.paymentsCost,
      color: "var(--success-color)",
    },
    {
      label: "Consumibles",
      value: summary.consumableCost,
      color: "var(--warning-color)",
    },
  ]);

  let memberSummaries = $derived.by(() =>
    members
      .map((member) => {
        const memberWorks = filteredWorks.filter((work) => work.userId === member.id);
        const memberPayments = filteredPayments.filter((payment) => payment.userId === member.id);
        const earned = memberWorks.reduce((sum, work) => sum + getWorkLaborCost(work), 0);
        const paid = memberPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
        const locationId = memberLocationMap.get(member.id) || "";
        return {
          ...member,
          locationId,
          locationName: getLocationName(locationId),
          workDays: memberWorks.reduce((sum, work) => sum + getWorkUnits(work), 0),
          overtimeHours: memberWorks.reduce((sum, work) => sum + (Number(work.overtimeHours) || 0), 0),
          earned,
          paid,
          balance: earned - paid,
        };
      })
      .filter((member) => selectedMemberId !== "all" || member.earned || member.paid || member.locationId)
      .sort((a, b) => b.earned + b.paid - (a.earned + a.paid)),
  );

  let locationSummaries = $derived.by(() => {
    const summaries = locations
      .filter((location) => selectedLocationId === "all" || location.id === selectedLocationId)
      .map((location) => {
        const locWorks = filteredWorks.filter((work) => workBelongsToLocation(work, location.id));
        const locPayments = filteredPayments.filter((payment) =>
          paymentBelongsToLocation(payment, location.id),
        );
        const locProducts = consumablesInRange.filter((item) => item.locationId === location.id);
        const labor = locWorks.reduce((sum, work) => sum + getWorkLaborCost(work), 0);
        const paid = locPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
        const products = locProducts.reduce((sum, item) => sum + getProductCost(item), 0);
        const total = Math.max(labor, paid) + products;
        const budget = Number(location.budget) || 0;
        return {
          ...location,
          membersCount: (location.assignedMemberIds || []).length,
          workDays: locWorks.reduce((sum, work) => sum + getWorkUnits(work), 0),
          labor,
          paid,
          products,
          total,
          budget,
          remaining: budget - total,
          usage: budget > 0 ? (total / budget) * 100 : 0,
        };
      });

    const unassignedProducts = consumablesInRange.filter((item) => !item.locationId);
    const unassignedWorks = filteredWorks.filter((work) => !getWorkLocationId(work));
    const unassignedPayments = filteredPayments.filter((payment) => !getPaymentLocationId(payment));
    if (
      selectedLocationId === "all" &&
      (unassignedProducts.length || unassignedWorks.length || unassignedPayments.length)
    ) {
      const labor = unassignedWorks.reduce((sum, work) => sum + getWorkLaborCost(work), 0);
      const paid = unassignedPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
      const products = unassignedProducts.reduce((sum, item) => sum + getProductCost(item), 0);
      const total = Math.max(labor, paid) + products;
      summaries.push({
        id: "unassigned",
        name: "Sin ubicación",
        membersCount: 0,
        workDays: unassignedWorks.reduce((sum, work) => sum + getWorkUnits(work), 0),
        labor,
        paid,
        products,
        total,
        budget: 0,
        remaining: -total,
        usage: 0,
      });
    }

    return summaries
      .filter((item) => item.total || item.membersCount || item.budget)
      .sort((a, b) => b.total - a.total);
  });

  let categoryTotals = $derived.by(() => {
    const totals = new Map();
    consumablesInRange.forEach((item) => {
      const key = item.category?.trim() || "Sin categoría";
      const previous = totals.get(key) || { label: key, value: 0, count: 0 };
      previous.value += getProductCost(item);
      previous.count += 1;
      totals.set(key, previous);
    });
    return Array.from(totals.values()).sort((a, b) => b.value - a.value).slice(0, 6);
  });

  let trend = $derived.by(() => {
    const buckets = new Map();
    const addToBucket = (dateValue, key, amount) => {
      const dateKey = getDateKey(dateValue);
      if (!dateKey) return;
      const bucketKey = getTrendBucketKey(dateKey);
      const previous = buckets.get(bucketKey) || {
        key: bucketKey,
        label: getTrendBucketLabel(bucketKey),
        labor: 0,
        payments: 0,
        consumables: 0,
      };
      previous[key] += Number(amount) || 0;
      buckets.set(bucketKey, previous);
    };

    filteredWorks.forEach((work) => addToBucket(work.date, "labor", getWorkLaborCost(work)));
    filteredPayments.forEach((payment) =>
      addToBucket(payment.date || payment.createdAt, "payments", payment.amount),
    );
    consumablesInRange.forEach((item) =>
      addToBucket(item.createdAt || item.updatedAt, "consumables", getProductCost(item)),
    );

    return Array.from(buckets.values())
      .map((bucket) => ({
        ...bucket,
        total: Math.max(bucket.labor, bucket.payments) + bucket.consumables,
      }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-10);
  });

  let maxExpenseValue = $derived(Math.max(...expenseDistribution.map((item) => item.value), 1));
  let maxLocationValue = $derived(Math.max(...locationSummaries.map((item) => item.total), 1));
  let maxCategoryValue = $derived(Math.max(...categoryTotals.map((item) => item.value), 1));
  let maxTrendValue = $derived(Math.max(...trend.map((item) => item.total), 1));

  $effect(() => {
    if (!team) return;
    budgetAmount = Number(team.projectBudget) || 0;
    budgetCurrency = team.projectBudgetCurrency || "MXN";
  });

  $effect(() => {
    if (team?.id && canViewStats) loadStatsData();
  });

  async function loadStatsData() {
    isLoading = true;
    try {
      const data = await getTeamAdvancedStatsData(team.id);
      works = data.works;
      payments = data.payments;
      inventory = data.inventory;
      locations = data.locations;
    } catch (error) {
      console.error("Error loading advanced team stats:", error);
      showNotification("Error al cargar estadísticas", "error");
    } finally {
      isLoading = false;
    }
  }

  async function handleSaveBudget() {
    if (!team?.id || !canEditStats || isSavingBudget) return;
    isSavingBudget = true;
    try {
      await updateTeamBudget(team.id, budgetAmount, budgetCurrency);
      showNotification("Presupuesto actualizado");
    } catch (error) {
      console.error("Error saving budget:", error);
      showNotification("No se pudo guardar el presupuesto", "error");
    } finally {
      isSavingBudget = false;
    }
  }

  function setPeriod(nextPeriod) {
    period = nextPeriod;
    if (nextPeriod !== "custom") {
      const nextRange = getPeriodRange(nextPeriod);
      startDate = nextRange.start;
      endDate = nextRange.end;
    }
  }

  function showNotification(message, type = "success") {
    messageToast = message;
    typeToast = type;
    showToast = true;
    setTimeout(() => {
      showToast = false;
    }, 3000);
  }

  function matchesMember(userId) {
    return selectedMemberId === "all" || userId === selectedMemberId;
  }

  function matchesWorkLocation(work, locationId) {
    return locationId === "all" || workBelongsToLocation(work, locationId);
  }

  function matchesPaymentLocation(payment, locationId) {
    return locationId === "all" || paymentBelongsToLocation(payment, locationId);
  }

  function matchesProductLocation(item, locationId) {
    return locationId === "all" || item.locationId === locationId;
  }

  function workBelongsToLocation(work, locationId) {
    return getWorkLocationId(work) === locationId || isMemberAssignedToLocation(work.userId, locationId);
  }

  function paymentBelongsToLocation(payment, locationId) {
    return getPaymentLocationId(payment) === locationId || isMemberAssignedToLocation(payment.userId, locationId);
  }

  function isMemberAssignedToLocation(memberId, locationId) {
    const location = locationMap.get(locationId);
    return Boolean(memberId && location?.assignedMemberIds?.includes(memberId));
  }

  function getWorkLocationId(work) {
    return work?.locationId || memberLocationMap.get(work?.userId) || "";
  }

  function getPaymentLocationId(payment) {
    return payment?.locationId || memberLocationMap.get(payment?.userId) || "";
  }

  function getLocationName(locationId) {
    return locationMap.get(locationId)?.name || "";
  }

  function isConsumable(item) {
    return (item.productType || "material") === "material";
  }

  function getProductCost(item) {
    return (Number(item.price) || 0) * (Number(item.quantity) || 0);
  }

  function getWorkUnits(work) {
    if (work.type === "full-day") return 1;
    if (work.type === "half-day") return 0.5;
    if (work.type === "variable") {
      return (Number(work.variableHours || work.durationHours) || 0) / 8;
    }
    return 0;
  }

  function getWorkLaborCost(work) {
    const settings = team?.memberSettings?.[work.userId] || {};
    const dailyRate = Number(settings.dailyRate) || 0;
    const extraHourRate = Number(settings.extraHourRate) || 0;
    const base = getWorkUnits(work) * dailyRate;
    const overtime = (Number(work.overtimeHours) || 0) * extraHourRate;
    return base + overtime;
  }

  function getMemberName(memberId) {
    const member =
      members.find((item) => item.id === memberId) ||
      team?.membersData?.find((item) => item.id === memberId);
    return member?.name || member?.email || "Usuario";
  }

  function getMemberInitials(memberId) {
    return getMemberName(memberId)
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  function getDateKey(value) {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return toDateString(date);
  }

  function dateInRange(value, currentRange) {
    const dateKey = getDateKey(value);
    if (!dateKey) return false;
    return dateKey >= currentRange.start && dateKey <= currentRange.end;
  }

  function getPeriodRange(periodKey) {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    if (periodKey === "week") {
      const day = today.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const start = new Date(year, month, today.getDate() + mondayOffset);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      return { start: toDateString(start), end: toDateString(end) };
    }

    if (periodKey === "quarter") {
      const quarterStartMonth = Math.floor(month / 3) * 3;
      const start = new Date(year, quarterStartMonth, 1);
      const end = new Date(year, quarterStartMonth + 3, 0);
      return { start: toDateString(start), end: toDateString(end) };
    }

    if (periodKey === "year") {
      return { start: `${year}-01-01`, end: `${year}-12-31` };
    }

    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return { start: toDateString(start), end: toDateString(end) };
  }

  function toDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDate(dateString) {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: budgetCurrency || "MXN",
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  }

  function formatNumber(value, digits = 1) {
    return new Intl.NumberFormat("es-ES", {
      maximumFractionDigits: digits,
    }).format(Number(value) || 0);
  }

  function getTrendBucketKey(dateKey) {
    if (period === "year" || period === "quarter") return dateKey.slice(0, 7);
    return dateKey;
  }

  function getTrendBucketLabel(bucketKey) {
    if (bucketKey.length === 7) {
      const [year, month] = bucketKey.split("-").map(Number);
      return new Date(year, month - 1, 1).toLocaleDateString("es-ES", {
        month: "short",
      });
    }
    const [, month, day] = bucketKey.split("-");
    return `${day}/${month}`;
  }

  function goToTeamHome() {
    const teamId = team?.id || $selectedTeamId;
    navigateTo(teamId ? `/teams/${teamId}` : "/teams");
  }
</script>

<div class="stats-page">
  <Toast message={messageToast} type={typeToast} show={showToast} />

  {#if team}
    <TitleHeader
      title="Estadísticas avanzadas"
      description={team?.name || ""}
      action={goToTeamHome}
      paddingHorizontal={true}
    />

    {#if !canViewStats}
      <div class="access-state">
        <AlertCircle size={44} />
        <h2>Acceso denegado</h2>
        <p>No tienes permiso para ver las estadísticas avanzadas de este equipo.</p>
      </div>
    {:else}
      <main class="stats-content">
        <section class="summary-band">
          <div>
            <p>Presupuesto restante</p>
            <strong class:negative={summary.budgetRemaining < 0}>
              {formatMoney(summary.budgetRemaining)}
            </strong>
            <span>{formatDate(range.start)} - {formatDate(range.end)}</span>
          </div>
          <div class="budget-progress" aria-label="Uso del presupuesto">
            <span>{formatNumber(summary.budgetUsage, 0)}%</span>
            <i style={`height: ${Math.min(summary.budgetUsage, 100)}%;`}></i>
          </div>
        </section>

        <section class="controls-panel">
          <div class="period-tabs" aria-label="Periodo">
            {#each Object.entries(periodLabels) as [key, label]}
              <button type="button" class:active={period === key} onclick={() => setPeriod(key)}>
                {label}
              </button>
            {/each}
          </div>

          <div class="filter-row">
            <label class="compact-field">
              <span>Ubicación</span>
              <select bind:value={selectedLocationId}>
                <option value="all">Todas</option>
                {#each locations as location (location.id)}
                  <option value={location.id}>{location.name}</option>
                {/each}
              </select>
            </label>
            <label class="compact-field">
              <span>Miembro</span>
              <select bind:value={selectedMemberId}>
                <option value="all">Todos</option>
                {#each members as member (member.id)}
                  <option value={member.id}>{getMemberName(member.id)}</option>
                {/each}
              </select>
            </label>
          </div>

          {#if period === "custom"}
            <div class="date-filters">
              <label class="compact-field">
                <span>Desde</span>
                <input type="date" bind:value={startDate} />
              </label>
              <label class="compact-field">
                <span>Hasta</span>
                <input type="date" bind:value={endDate} />
              </label>
            </div>
          {/if}

          {#if canEditStats}
            <details class="budget-details">
              <summary>
                <span>Presupuesto</span>
                <strong>{formatMoney(summary.projectBudget)}</strong>
              </summary>
              <div class="budget-form">
                <label class="compact-field">
                  <span>Monto</span>
                  <input type="number" min="0" step="0.01" bind:value={budgetAmount} />
                </label>
                <label class="compact-field">
                  <span>Moneda</span>
                  <select bind:value={budgetCurrency}>
                    {#each currencyOptions as currency}
                      <option value={currency}>{currency}</option>
                    {/each}
                  </select>
                </label>
                <button type="button" onclick={handleSaveBudget} disabled={isSavingBudget}>
                  <Save size={18} />
                  <span>{isSavingBudget ? "Guardando..." : "Guardar"}</span>
                </button>
              </div>
            </details>
          {/if}
        </section>

        {#if isLoading}
          <div class="loading-state">
            <LoadingSpinner show={true} />
            <p>Cargando estadísticas...</p>
          </div>
        {:else}
          <section class="metrics-grid">
            <article class="metric-card">
              <div class="metric-icon budget"><DollarSign size={20} /></div>
              <span>Usado del presupuesto</span>
              <strong>{formatMoney(summary.spentAgainstBudget)}</strong>
              <small>{formatMoney(summary.budgetBase)} asignado</small>
            </article>

            <article class="metric-card">
              <div class="metric-icon products"><Package size={20} /></div>
              <span>Consumibles</span>
              <strong>{formatMoney(summary.consumableCost)}</strong>
              <small>{summary.lowStockItems} con stock bajo</small>
            </article>

            <article class="metric-card">
              <div class="metric-icon labor"><Clock size={20} /></div>
              <span>Jornadas</span>
              <strong>{formatMoney(summary.laborCost)}</strong>
              <small>{formatNumber(summary.totalWorkDays)} días / {formatNumber(summary.overtimeHours)}h extra</small>
            </article>

            <article class="metric-card">
              <div class="metric-icon payments"><WalletCards size={20} /></div>
              <span>Pagos realizados</span>
              <strong>{formatMoney(summary.paymentsCost)}</strong>
              <small>{formatMoney(summary.pendingPayroll)} pendiente estimado</small>
            </article>

            <article class="metric-card">
              <div class="metric-icon members"><Users size={20} /></div>
              <span>Miembros activos</span>
              <strong>{summary.activeMembers}</strong>
              <small>{summary.totalWorks} registros</small>
            </article>

            <article class="metric-card">
              <div class="metric-icon locations"><MapPin size={20} /></div>
              <span>Ubicaciones activas</span>
              <strong>{summary.activeLocations}</strong>
              <small>{formatMoney(summary.totalLocationBudget)} presupuestado</small>
            </article>
          </section>

          <section class="insights-grid">
            <article class="panel">
              <div class="panel-heading">
                <div>
                  <p>Gastos</p>
                  <h2>Distribución</h2>
                </div>
                <BarChart3 size={20} />
              </div>
              <div class="bar-list">
                {#each expenseDistribution as item}
                  <div class="bar-row">
                    <div class="bar-label">
                      <span>{item.label}</span>
                      <strong>{formatMoney(item.value)}</strong>
                    </div>
                    <div class="bar-track">
                      <i style={`width: ${(item.value / maxExpenseValue) * 100}%; background: ${item.color};`}></i>
                    </div>
                  </div>
                {/each}
              </div>
            </article>

            <article class="panel">
              <div class="panel-heading">
                <div>
                  <p>Tendencia</p>
                  <h2>Coste por periodo</h2>
                </div>
                <TrendingUp size={20} />
              </div>
              {#if trend.length}
                <div class="trend-bars">
                  {#each trend as item (item.key)}
                    <div class="trend-item">
                      <span>{formatMoney(item.total)}</span>
                      <i style={`height: ${Math.max((item.total / maxTrendValue) * 100, 6)}%;`}></i>
                      <small>{item.label}</small>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="empty-inline">Sin datos en este periodo.</div>
              {/if}
            </article>
          </section>

          <section class="insights-grid">
            <article class="panel">
              <div class="panel-heading">
                <div>
                  <p>Mapa operativo</p>
                  <h2>Ubicaciones</h2>
                </div>
                <MapPin size={20} />
              </div>
              {#if locationSummaries.length}
                <div class="bar-list">
                  {#each locationSummaries as location (location.id)}
                    <div class="bar-row">
                      <div class="bar-label">
                        <span>{location.name}</span>
                        <strong>{formatMoney(location.total)}</strong>
                      </div>
                      <div class="location-meta">
                        <small>{location.membersCount} miembros</small>
                        <small>{formatNumber(location.workDays)} días</small>
                        <small>{formatMoney(location.products)} consumibles</small>
                        <small>{formatMoney(location.budget)} presupuesto</small>
                        {#if location.budget > 0}
                          <small class:negative={location.remaining < 0}>
                            {formatMoney(location.remaining)} restante
                          </small>
                        {/if}
                      </div>
                      <div class="bar-track">
                        <i style={`width: ${(location.total / maxLocationValue) * 100}%; background: var(--info-color);`}></i>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="empty-inline">Sin ubicaciones con actividad.</div>
              {/if}
            </article>

            <article class="panel">
              <div class="panel-heading">
                <div>
                  <p>Equipo</p>
                  <h2>Coste por miembro</h2>
                </div>
                <Users size={20} />
              </div>
              {#if memberSummaries.length}
                <div class="member-list">
                  {#each memberSummaries.slice(0, 8) as member (member.id)}
                    <article class="member-row">
                      <div class="member-avatar">{getMemberInitials(member.id)}</div>
                      <div>
                        <h3>{getMemberName(member.id)}</h3>
                        <p>{member.locationName || "Sin ubicación"} · {formatNumber(member.workDays)} días</p>
                      </div>
                      <strong>{formatMoney(member.earned)}</strong>
                    </article>
                  {/each}
                </div>
              {:else}
                <div class="empty-inline">Sin miembros con actividad.</div>
              {/if}
            </article>
          </section>

          <section class="insights-grid">
            <article class="panel">
              <div class="panel-heading">
                <div>
                  <p>Consumibles</p>
                  <h2>Categorías</h2>
                </div>
                <Package size={20} />
              </div>
              {#if categoryTotals.length}
                <div class="bar-list">
                  {#each categoryTotals as item}
                    <div class="bar-row">
                      <div class="bar-label">
                        <span>{item.label}</span>
                        <strong>{formatMoney(item.value)}</strong>
                      </div>
                      <div class="bar-track">
                        <i style={`width: ${(item.value / maxCategoryValue) * 100}%; background: var(--warning-color);`}></i>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="empty-inline">Sin consumibles en este periodo.</div>
              {/if}
            </article>

            <article class="panel">
              <div class="panel-heading">
                <div>
                  <p>Resumen</p>
                  <h2>Indicadores</h2>
                </div>
                <Filter size={20} />
              </div>
              <div class="indicator-grid">
                <div>
                  <strong>{formatMoney(summary.currentConsumableValue)}</strong>
                  <span>valor actual de consumibles</span>
                </div>
                <div>
                  <strong>{summary.activeDates}</strong>
                  <span>días con actividad</span>
                </div>
                <div>
                  <strong>{summary.totalPayments}</strong>
                  <span>pagos registrados</span>
                </div>
                <div>
                  <strong>{formatNumber(summary.budgetUsage, 0)}%</strong>
                  <span>presupuesto usado</span>
                </div>
              </div>
            </article>
          </section>
        {/if}
      </main>
    {/if}
  {:else}
    <div class="loading-state full">
      <LoadingSpinner show={true} />
      <p>Cargando información del equipo...</p>
    </div>
  {/if}
</div>

<style>
  .stats-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--bg-page);
    overflow: hidden;
    padding-top: var(--page-top-safe);
  }

  .stats-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px 20px calc(var(--bottom-nav-clearance) + 90px);
    display: grid;
    gap: 14px;
    align-content: start;
    -webkit-overflow-scrolling: touch;
  }

  .stats-page :global(.header-container) {
    grid-template-columns: 50px minmax(0, 1fr);
    gap: 10px;
    padding-top: 8px;
    padding-bottom: 10px;
  }

  .stats-page :global(.header-content) {
    min-width: 0;
  }

  .stats-page :global(.header-content h1) {
    font-size: clamp(22px, 7vw, 34px);
    line-height: 1.06;
    overflow-wrap: anywhere;
  }

  .summary-band {
    min-width: 0;
    background: var(--text-primary);
    color: var(--bg-card);
    border-radius: var(--radius-md);
    padding: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .summary-band > div:first-child {
    min-width: 0;
  }

  .summary-band p,
  .summary-band span {
    color: inherit;
    opacity: 0.72;
  }

  .summary-band strong {
    display: block;
    font-size: clamp(26px, 7vw, 34px);
    line-height: 1;
    margin: 8px 0;
    overflow-wrap: anywhere;
  }

  .summary-band strong.negative {
    color: var(--danger-color);
  }

  .budget-progress {
    width: 68px;
    height: 96px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--bg-card) 18%, transparent);
    color: var(--bg-card);
    display: flex;
    align-items: end;
    justify-content: center;
    overflow: hidden;
    position: relative;
    flex-shrink: 0;
  }

  .budget-progress span {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    opacity: 1;
    z-index: 1;
  }

  .budget-progress i {
    width: 100%;
    min-height: 4px;
    background: var(--accent-color);
    display: block;
  }

  .controls-panel,
  .panel,
  .metric-card {
    min-width: 0;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
  }

  .controls-panel {
    padding: 12px;
    height: auto;
    display: grid;
    gap: 10px;
    align-content: start;
    overflow: visible;
  }

  .panel {
    padding: 12px;
    overflow: hidden;
  }

  .period-tabs {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }

  .period-tabs::-webkit-scrollbar {
    display: none;
  }

  .period-tabs button,
  .budget-form button {
    border: none;
    border-radius: 999px;
    min-height: 34px;
    background: var(--bg-input);
    color: var(--text-secondary);
    flex: 0 0 auto;
    padding: 0 13px;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .period-tabs button.active,
  .budget-form button {
    background: var(--text-primary);
    color: var(--bg-card);
  }

  .filter-row,
  .date-filters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: 0;
  }

  .budget-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(86px, 110px) auto;
    align-items: end;
    gap: 8px;
    margin-top: 0;
  }

  label {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .compact-field {
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--bg-input);
    padding: 7px 10px;
  }

  label span,
  .metric-card span,
  .panel-heading p {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
  }

  input,
  select {
    width: 100%;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text-primary);
    border-radius: 0;
    padding: 0;
    font-size: 14px;
    line-height: 1.35;
    outline: none;
  }

  .budget-form button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 16px;
    border-radius: 12px;
    min-height: 48px;
  }

  .budget-details {
    margin-top: 0;
    border-top: 1px solid var(--border-color);
    padding-top: 10px;
  }

  .budget-details summary {
    min-height: 34px;
    list-style: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
    color: var(--text-primary);
  }

  .budget-details summary::-webkit-details-marker {
    display: none;
  }

  .budget-details summary span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
  }

  .budget-details summary strong {
    font-size: 14px;
    overflow-wrap: anywhere;
    text-align: right;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 12px;
  }

  .metric-card {
    padding: 14px;
    display: grid;
    gap: 8px;
    min-width: 0;
    min-height: 142px;
    align-content: center;
  }

  .metric-card strong {
    font-size: 21px;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }

  .metric-card small {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.3;
  }

  .metric-icon {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .metric-icon.budget,
  .metric-icon.payments {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }

  .metric-icon.products {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .metric-icon.labor,
  .metric-icon.locations {
    background: var(--bg-info-subtle);
    color: var(--info-color);
  }

  .metric-icon.members {
    background: var(--bg-purple-subtle);
    color: var(--purple-color);
  }

  .insights-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
    gap: 16px;
  }

  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    color: var(--text-secondary);
  }

  .panel-heading > div {
    min-width: 0;
  }

  .panel-heading h2 {
    margin-top: 3px;
    font-size: 18px;
  }

  .bar-list,
  .member-list {
    display: grid;
    gap: 12px;
  }

  .bar-label,
  .location-meta {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .bar-label {
    font-size: 13px;
    margin-bottom: 7px;
  }

  .bar-label strong {
    overflow-wrap: anywhere;
    text-align: right;
  }

  .bar-label span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .location-meta {
    color: var(--text-secondary);
    flex-wrap: wrap;
    font-size: 11px;
    margin: -2px 0 7px;
  }

  .location-meta .negative {
    color: var(--danger-color);
    font-weight: 800;
  }

  .bar-track {
    height: 10px;
    border-radius: 999px;
    background: var(--bg-input);
    overflow: hidden;
  }

  .bar-track i {
    display: block;
    height: 100%;
    min-width: 4px;
    border-radius: inherit;
  }

  .trend-bars {
    height: 190px;
    display: flex;
    align-items: end;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .trend-item {
    flex: 1 0 58px;
    height: 100%;
    min-width: 58px;
    display: flex;
    flex-direction: column;
    justify-content: end;
    align-items: center;
    gap: 7px;
  }

  .trend-item span,
  .trend-item small {
    color: var(--text-secondary);
    font-size: 11px;
    text-align: center;
    max-width: 72px;
    overflow-wrap: anywhere;
  }

  .trend-item i {
    width: 100%;
    max-width: 38px;
    border-radius: 10px 10px 4px 4px;
    background: var(--text-primary);
  }

  .member-row {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 10px;
  }

  .member-avatar {
    width: 38px;
    height: 38px;
    border-radius: 999px;
    background: var(--bg-accent-subtle);
    color: var(--accent-ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 900;
  }

  .member-row h3 {
    font-size: 14px;
    margin: 0 0 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .member-row p {
    color: var(--text-secondary);
    font-size: 12px;
    margin: 0;
  }

  .member-row strong {
    font-size: 13px;
    max-width: 130px;
    overflow-wrap: anywhere;
    text-align: right;
  }

  .indicator-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .indicator-grid div {
    min-height: 78px;
    background: var(--bg-input);
    border-radius: 12px;
    padding: 12px;
    display: grid;
    align-content: center;
    gap: 4px;
  }

  .indicator-grid strong {
    font-size: 18px;
  }

  .indicator-grid span {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .loading-state,
  .access-state,
  .empty-inline {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    text-align: center;
  }

  .loading-state,
  .access-state {
    min-height: 220px;
    flex-direction: column;
    gap: 12px;
  }

  .access-state {
    height: 100%;
    padding: 24px;
  }

  .loading-state.full {
    height: 100%;
  }

  .empty-inline {
    min-height: 180px;
    border: 1px dashed var(--border-color);
    border-radius: 12px;
  }

  button:disabled,
  input:disabled,
  select:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  @media (max-width: 1180px) {
    .metrics-grid {
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    }
  }

  @media (max-width: 900px) {
    .insights-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 700px) {
    .stats-content {
      padding-inline: 14px;
      gap: 12px;
    }

    .summary-band strong {
      font-size: 28px;
    }

    .metrics-grid,
    .filter-row,
    .date-filters,
    .budget-form,
    .indicator-grid {
      grid-template-columns: 1fr;
    }

    .budget-form {
      align-items: stretch;
    }

    .summary-band {
      align-items: flex-start;
      padding: 18px;
    }

    .budget-progress {
      width: 58px;
      height: 82px;
    }

    .metric-card {
      min-height: 96px;
      grid-template-columns: 46px minmax(0, 1fr);
      grid-template-rows: auto auto auto;
      column-gap: 12px;
      row-gap: 4px;
      align-content: center;
      padding: 14px;
    }

    .metric-icon {
      grid-row: 1 / 4;
      width: 44px;
      height: 44px;
    }

    .metric-card strong {
      font-size: 22px;
    }

    .member-row {
      grid-template-columns: 38px minmax(0, 1fr);
    }

    .member-row strong {
      grid-column: 2;
      justify-self: start;
      max-width: none;
      text-align: left;
    }
  }

  @media (max-width: 380px) {
    .summary-band {
      flex-direction: column;
    }

    .budget-progress {
      width: 100%;
      height: 46px;
      border-radius: 14px;
    }

  }
</style>
