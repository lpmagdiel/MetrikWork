<script>
  import {
    AlertCircle,
    BarChart3,
    CalendarCheck,
    ChevronDown,
    Clock,
    Download,
    DollarSign,
    Eraser,
    Filter,
    MapPin,
    Package,
    Save,
    Trash2,
    TrendingUp,
    Users,
    WalletCards,
  } from "lucide-svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import Toast from "../components/Toast.svelte";
  import TitleHeader from "../components/TitleHeader.svelte";
  import { navigateTo } from "../router.js";
  import { formatGpsCoordinates, geocodeAddress, normalizeCoordinates } from "../helpers/navigation.js";
  import { downloadExcelReport, openPrintableReport } from "../helpers/reportExport.js";
  import { confirmAlert, showErrorAlert, showSuccessAlert } from "../data/alerts.js";
  import {
    getTeamAdvancedStatsData,
    hasTeamPermission,
    hasGhostControlPermission,
    hasGhostCreatePermission,
    selectedTeam,
    selectedTeamId,
    updateTeamBudget,
    getTeamGhosts,
    removeGhostWorkday,
    clearGhostWorkdays,
    userStore,
  } from "../data/stores.js";

  let team = $derived($selectedTeam);
  let canViewStats = $derived(hasTeamPermission(team, $userStore?.uid, "stats", "view"));
  let canEditStats = $derived(hasTeamPermission(team, $userStore?.uid, "stats", "edit"));
  let canManageGhostRecords = $derived(
    !!(team?.id && $userStore?.uid) && (
      team.admin === $userStore.uid ||
      hasGhostCreatePermission(team, $userStore.uid) ||
      hasGhostControlPermission(team, $userStore.uid)
    )
  );

  let works = $state([]);
  let payments = $state([]);
  let inventory = $state([]);
  let locations = $state([]);
  let absenceRequests = $state([]);
  let isLoading = $state(false);
  let isSavingBudget = $state(false);
  let isClearingGhostId = $state("");
  let isRemovingGhostEntryId = $state("");
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
  let workLocationAddresses = $state({});
  const resolvingLocationAddressIds = new Set();

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
    return Array.from(byId.values())
      .filter((member) => !member.id.startsWith("ghost-"))
      .sort((a, b) =>
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

  let filteredAcceptedRequests = $derived.by(() =>
    absenceRequests.filter((request) => {
      if (!requestOverlapsRange(request, range)) return false;
      if (!matchesMember(request.requesterId)) return false;
      return matchesRequestLocation(request, selectedLocationId);
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
      if (work.type === "variable" && work.timerMode !== "overtime") {
        variableHours += getVariableHours(work);
      }
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
    const acceptedAbsenceRequests = filteredAcceptedRequests.length;
    const acceptedAbsenceDays = filteredAcceptedRequests.reduce(
      (sum, request) => sum + getRequestDays(request),
      0,
    );

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
      acceptedAbsenceRequests,
      acceptedAbsenceDays,
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

  let memberSummaries = $derived.by(() => {
    const memberMap = new Map();
    for (const member of members) {
      memberMap.set(member.id, {
        ...member,
        locationId: memberLocationMap.get(member.id) || "",
        workDays: 0,
        overtimeHours: 0,
        earned: 0,
        paid: 0,
        hasActivity: false,
      });
    }

    for (const work of filteredWorks) {
      const bucket = memberMap.get(work.userId);
      if (!bucket) continue;
      const units = getWorkUnits(work);
      const overtime = Number(work.overtimeHours) || 0;
      const cost = getWorkLaborCost(work);
      bucket.workDays += units;
      bucket.overtimeHours += overtime;
      bucket.earned += cost;
      bucket.hasActivity = bucket.hasActivity || units > 0 || overtime > 0;
    }
    for (const payment of filteredPayments) {
      const bucket = memberMap.get(payment.userId);
      if (!bucket) continue;
      const amount = Number(payment.amount) || 0;
      bucket.paid += amount;
      bucket.hasActivity = bucket.hasActivity || amount > 0;
    }

    const summaries = Array.from(memberMap.values()).map((bucket) => ({
      ...bucket,
      locationName: getLocationName(bucket.locationId),
      balance: bucket.earned - bucket.paid,
      hasActivity: bucket.hasActivity || Boolean(bucket.locationId),
    }));

    return summaries
      .filter((member) => selectedMemberId !== "all" || member.hasActivity)
      .sort((a, b) => (b.earned + b.paid) - (a.earned + a.paid));
  });

  let locationSummaries = $derived.by(() => {
    const visibleLocations = locations.filter(
      (location) => selectedLocationId === "all" || location.id === selectedLocationId,
    );
    const buckets = new Map();

    const ensureBucket = (locationId) => {
      if (!buckets.has(locationId)) {
        const location = locations.find((item) => item.id === locationId);
        const budget = Number(location?.budget) || 0;
        buckets.set(locationId, {
          id: locationId,
          name: location?.name || (locationId === "unassigned" ? "Sin ubicación" : "Ubicación"),
          membersCount: location?.assignedMemberIds?.length || 0,
          workDays: 0,
          labor: 0,
          paid: 0,
          products: 0,
          budget,
        });
      }
      return buckets.get(locationId);
    };

    for (const work of filteredWorks) {
      const locationId = getWorkLocationId(work) || "unassigned";
      const bucket = ensureBucket(locationId);
      bucket.workDays += getWorkUnits(work);
      bucket.labor += getWorkLaborCost(work);
    }
    for (const payment of filteredPayments) {
      const locationId = getPaymentLocationId(payment) || "unassigned";
      const bucket = ensureBucket(locationId);
      bucket.paid += Number(payment.amount) || 0;
    }
    for (const item of consumablesInRange) {
      const locationId = item.locationId || "unassigned";
      const bucket = ensureBucket(locationId);
      bucket.products += getProductCost(item);
    }

    if (selectedLocationId === "all") {
      for (const location of visibleLocations) {
        ensureBucket(location.id);
      }
    }

    const summaries = Array.from(buckets.values())
      .filter((bucket) => visibleLocations.some((location) => location.id === bucket.id))
      .map((bucket) => {
        const total = Math.max(bucket.labor, bucket.paid) + bucket.products;
        return {
          ...bucket,
          total,
          remaining: bucket.budget - total,
          usage: bucket.budget > 0 ? (total / bucket.budget) * 100 : 0,
        };
      });

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

  let ghostSummaries = $derived.by(() => {
    const ghosts = getTeamGhosts(team);
    if (!ghosts.length) return [];
    const buckets = new Map();
    for (const ghost of ghosts) {
      buckets.set(ghost.id, {
        id: ghost.id,
        name: ghost.name,
        fullDays: 0,
        halfDays: 0,
        overtimeHours: 0,
        variableHours: 0,
        workDays: 0,
        lastDate: "",
        totalWorksdays: (ghost.worksdays || []).length,
        totalOvertime: (ghost.overtime || []).length,
        masters: ghost.masters || []
      });
    }
    for (const work of filteredWorks) {
      if (!work?.isGhost && !(typeof work?.userId === "string" && work.userId.startsWith("ghost-"))) continue;
      const ghostId = work.ghostId || (work.userId || "").replace(/^ghost-/, "");
      const bucket = buckets.get(ghostId);
      if (!bucket) continue;
      if (work.type === "full-day") {
        bucket.fullDays += 1;
        bucket.workDays += 1;
      } else if (work.type === "half-day") {
        bucket.halfDays += 1;
        bucket.workDays += 0.5;
      } else if (work.type === "variable" && work.timerMode !== "overtime") {
        const hours = getVariableHours(work);
        bucket.variableHours += hours;
        bucket.workDays += hours / 8;
      }
      bucket.overtimeHours += Number(work.overtimeHours) || 0;
      if ((work.date || "") > bucket.lastDate) bucket.lastDate = work.date;
    }
    return Array.from(buckets.values())
      .filter((bucket) =>
        bucket.fullDays + bucket.halfDays + bucket.variableHours + bucket.overtimeHours > 0 ||
        bucket.lastDate ||
        bucket.totalWorksdays > 0 ||
        bucket.totalOvertime > 0,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  let ghostWorkRecords = $derived.by(() => {
    const ghosts = getTeamGhosts(team);
    if (!ghosts.length) return [];
    return ghosts
      .map((ghost) => {
        const workdays = (ghost.worksdays || [])
          .map((entry) => ({ ...entry, kind: "worksday" }));
        const overtime = (ghost.overtime || [])
          .map((entry) => ({ ...entry, kind: "overtime" }));
        const entries = [...workdays, ...overtime]
          .filter((entry) => entry?.date)
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        return {
          id: ghost.id,
          name: ghost.name,
          masters: ghost.masters || [],
          entries
        };
      })
      .filter((ghost) => ghost.entries.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  let expandedGhostIds = $state(new Set());

  function toggleGhostExpansion(ghostId) {
    const next = new Set(expandedGhostIds);
    if (next.has(ghostId)) next.delete(ghostId);
    else next.add(ghostId);
    expandedGhostIds = next;
  }

  function ghostLabel(kind) {
    return kind === "overtime" ? "Horas extra" : "Jornada";
  }

  function getGhostEntryLabel(entry) {
    if (entry.kind === "overtime") {
      const hours = Number(entry.hours || entry.overtimeHours || 0);
      return `${hours.toFixed(hours % 1 === 0 ? 0 : 2)}h`;
    }
    if (entry.type === "half-day") return "Media jornada";
    return "Jornada completa";
  }

  async function handleClearGhost(ghost) {
    if (!team?.id || !canManageGhostRecords || isClearingGhostId) return;
    const totalEntries = (ghost.entries || []).length;
    if (totalEntries === 0) {
      showNotification("Este miembro temporal no tiene registros para limpiar.");
      return;
    }
    const confirmed = await confirmAlert({
      title: "Limpiar registros del miembro temporal",
      text: `¿Eliminar las ${totalEntries} jornadas${totalEntries > 1 ? "s" : ""} y horas extra de ${ghost.name}? Esta acción no se puede deshacer.`,
      confirmButtonText: "Limpiar todo",
      cancelButtonText: "Cancelar",
      danger: true
    });
    if (!confirmed) return;
    isClearingGhostId = ghost.id;
    try {
      const result = await clearGhostWorkdays(team.id, ghost.id);
      const removed = (result?.removedWorksdays || 0) + (result?.removedOvertime || 0);
      showNotification(
        `Registros de ${ghost.name} eliminados (${removed}).`,
      );
    } catch (error) {
      console.error("Error clearing ghost workdays:", error);
      await showErrorAlert(
        "No se pudo limpiar",
        error?.message || "Inténtalo de nuevo.",
      );
    } finally {
      isClearingGhostId = "";
    }
  }

  async function handleRemoveGhostEntry(ghost, entry) {
    if (!team?.id || !canManageGhostRecords || isRemovingGhostEntryId) return;
    const confirmed = await confirmAlert({
      title: "Eliminar registro",
      text: `¿Quitar la ${entry.kind === "overtime" ? "hora extra" : "jornada"} del ${formatDate(entry.date)}?`,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
      danger: true
    });
    if (!confirmed) return;
    isRemovingGhostEntryId = `${ghost.id}:${entry.id}`;
    try {
      await removeGhostWorkday(team.id, ghost.id, entry.id);
      showNotification("Registro eliminado.");
    } catch (error) {
      console.error("Error removing ghost workday:", error);
      await showErrorAlert(
        "No se pudo eliminar",
        error?.message || "Inténtalo de nuevo.",
      );
    } finally {
      isRemovingGhostEntryId = "";
    }
  }

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

  $effect(() => {
    if (!team?.id || !canViewStats) return;
    const currentRange = range;
    if (!currentRange?.start || !currentRange?.end) return;
    loadStatsData(currentRange);
  });

  $effect(() => {
    const pendingWorks = filteredWorks.filter((work) => {
      const key = getWorkAddressKey(work);
      return getWorkMemberGps(work) &&
        !work.memberLocationAddress &&
        !workLocationAddresses[key] &&
        !resolvingLocationAddressIds.has(key);
    });

    if (pendingWorks.length) {
      resolveWorkLocationAddresses(pendingWorks);
    }
  });

  let loadRequestId = 0;
  async function loadStatsData(currentRange = range) {
    if (!team?.id) return;
    const requestId = ++loadRequestId;
    isLoading = true;
    try {
      const data = await getTeamAdvancedStatsData(team.id, {
        startDate: currentRange?.start,
        endDate: currentRange?.end
      });
      if (requestId !== loadRequestId) return;
      works = data.works;
      payments = data.payments;
      inventory = data.inventory;
      locations = data.locations;
      absenceRequests = data.absenceRequests || [];
      workLocationAddresses = {};
    } catch (error) {
      if (requestId !== loadRequestId) return;
      console.error("Error loading advanced team stats:", error);
      showNotification("Error al cargar estadísticas", "error");
    } finally {
      if (requestId === loadRequestId) isLoading = false;
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

  function matchesRequestLocation(request, locationId) {
    return locationId === "all" || isMemberAssignedToLocation(request.requesterId, locationId);
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

  function getWorkAddressKey(work) {
    return work?.id || `${work?.userId || "member"}-${work?.date || "date"}-${work?.createdAt || ""}`;
  }

  function getWorkMemberGps(work) {
    return normalizeCoordinates(work?.memberGps);
  }

  function getWorkMemberLocationLabel(work) {
    const gps = getWorkMemberGps(work);
    if (!gps) return "";

    return work?.memberLocationAddress ||
      workLocationAddresses[getWorkAddressKey(work)] ||
      formatGpsCoordinates(gps);
  }

  function getWorkMemberLocationUrl(work) {
    const gps = getWorkMemberGps(work);
    if (!gps) return "";
    return `https://www.google.com/maps/search/?api=1&query=${gps.lat},${gps.lon}`;
  }

  async function resolveWorkLocationAddresses(nextWorks) {
    const resolvedEntries = await Promise.all(
      nextWorks.map(async (work) => {
        const key = getWorkAddressKey(work);
        const gps = getWorkMemberGps(work);
        if (!gps) return null;

        resolvingLocationAddressIds.add(key);
        try {
          return [key, await geocodeAddress(gps)];
        } catch (error) {
          return [key, formatGpsCoordinates(gps)];
        } finally {
          resolvingLocationAddressIds.delete(key);
        }
      }),
    );

    const nextAddresses = Object.fromEntries(resolvedEntries.filter(Boolean));
    if (Object.keys(nextAddresses).length) {
      workLocationAddresses = { ...workLocationAddresses, ...nextAddresses };
    }
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
    if (work.type === "variable" && work.timerMode !== "overtime") {
      return getVariableHours(work) / 8;
    }
    return 0;
  }

  function getVariableHours(work) {
    return Math.max(0, Number(work?.variableHours ?? work?.durationHours) || 0);
  }

  function getWorkTypeLabel(work) {
    if (work.type === "full-day") return "Dia completo";
    if (work.type === "half-day") return "Medio dia";
    if (work.type === "variable") return "Jornada variable";
    if (work.type === "overtime") return "Horas extra";
    return "Jornada";
  }

  function getWorkLaborCost(work) {
    if (work?.isGhost || (typeof work?.userId === "string" && work.userId.startsWith("ghost-"))) {
      return 0;
    }
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

  function requestOverlapsRange(request, currentRange) {
    const start = getDateKey(request.startDate);
    const end = getDateKey(request.endDate || request.startDate);
    if (!start || !end) return false;
    return start <= currentRange.end && end >= currentRange.start;
  }

  function getRequestDays(request) {
    const startKey = getDateKey(request.startDate);
    const endKey = getDateKey(request.endDate || request.startDate);
    if (!startKey || !endKey) return 0;
    const start = new Date(`${startKey}T00:00:00`);
    const end = new Date(`${endKey}T00:00:00`);
    const diff = end.getTime() - start.getTime();
    if (Number.isNaN(diff) || diff < 0) return 0;
    return Math.floor(diff / 86400000) + 1;
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

  function formatRequestRange(request) {
    const start = getDateKey(request.startDate);
    const end = getDateKey(request.endDate || request.startDate);
    if (!start) return "";
    if (!end || start === end) return formatDate(start);
    return `${formatDate(start)} - ${formatDate(end)}`;
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

  function createStatsReport() {
    const teamName = team?.name || team?.team || "Equipo";
    const locationLabel =
      selectedLocationId === "all" ? "Todas" : getLocationName(selectedLocationId) || "Sin ubicacion";
    const memberLabel =
      selectedMemberId === "all" ? "Todos" : getMemberName(selectedMemberId);
    const periodLabel = periodLabels[period] || "Periodo";
    const title = `Reporte financiero y de tiempo`;
    const subtitle = `MetricWork - ${teamName}`;

    return {
      title,
      subtitle,
      meta: [
        { label: "Equipo", value: teamName },
        { label: "Periodo", value: `${periodLabel}: ${formatDate(range.start)} - ${formatDate(range.end)}` },
        { label: "Ubicacion", value: locationLabel },
        { label: "Miembro", value: memberLabel },
        { label: "Moneda", value: budgetCurrency || "MXN" },
        { label: "Generado por", value: $userStore?.name || $userStore?.email || "Usuario" },
      ],
      sections: [
        {
          title: "Resumen ejecutivo",
          headers: ["Indicador", "Valor"],
          rows: [
            ["Presupuesto base", formatMoney(summary.budgetBase)],
            ["Usado del presupuesto", formatMoney(summary.spentAgainstBudget)],
            ["Presupuesto restante", formatMoney(summary.budgetRemaining)],
            ["Uso del presupuesto", `${formatNumber(summary.budgetUsage, 0)}%`],
            ["Coste de jornadas", formatMoney(summary.laborCost)],
            ["Pagos realizados", formatMoney(summary.paymentsCost)],
            ["Nomina pendiente estimada", formatMoney(summary.pendingPayroll)],
            ["Consumibles del periodo", formatMoney(summary.consumableCost)],
            ["Jornadas equivalentes", formatNumber(summary.totalWorkDays)],
            ["Horas extra", `${formatNumber(summary.overtimeHours)}h`],
            ["Solicitudes aceptadas", summary.acceptedAbsenceRequests],
            ["Días de ausencia aceptados", formatNumber(summary.acceptedAbsenceDays)],
            ["Miembros activos", summary.activeMembers],
            ["Ubicaciones activas", summary.activeLocations],
          ],
        },
        {
          title: "Coste por miembro",
          headers: ["Miembro", "Ubicacion", "Dias", "Horas extra", "Generado", "Pagado", "Balance"],
          rows: memberSummaries.map((member) => [
            getMemberName(member.id),
            member.locationName || "Sin ubicacion",
            formatNumber(member.workDays),
            `${formatNumber(member.overtimeHours)}h`,
            formatMoney(member.earned),
            formatMoney(member.paid),
            formatMoney(member.balance),
          ]),
        },
        {
          title: "Coste por ubicacion",
          headers: ["Ubicacion", "Miembros", "Dias", "Jornadas", "Pagos", "Consumibles", "Total", "Presupuesto", "Restante"],
          rows: locationSummaries.map((location) => [
            location.name,
            location.membersCount,
            formatNumber(location.workDays),
            formatMoney(location.labor),
            formatMoney(location.paid),
            formatMoney(location.products),
            formatMoney(location.total),
            formatMoney(location.budget),
            formatMoney(location.remaining),
          ]),
        },
        {
          title: "Tendencia",
          headers: ["Periodo", "Jornadas", "Pagos", "Consumibles", "Total"],
          rows: trend.map((item) => [
            item.label,
            formatMoney(item.labor),
            formatMoney(item.payments),
            formatMoney(item.consumables),
            formatMoney(item.total),
          ]),
        },
        {
          title: "Categorias de consumibles",
          headers: ["Categoria", "Articulos", "Valor"],
          rows: categoryTotals.map((item) => [item.label, item.count, formatMoney(item.value)]),
        },
        ...(ghostSummaries.length
          ? [{
              title: "Miembros temporales (sin coste)",
              headers: ["Miembro temporal", "Dias completos", "Medios dias", "Horas extra", "Ultima jornada"],
              rows: ghostSummaries.map((ghost) => [
                `👻 ${ghost.name}`,
                formatNumber(ghost.fullDays, 0),
                formatNumber(ghost.halfDays, 0),
                `${formatNumber(ghost.overtimeHours)}h`,
                ghost.lastDate ? formatDate(ghost.lastDate) : "Sin actividad",
              ]),
            }]
          : []),
        {
          title: "Detalle de jornadas",
          headers: ["Fecha", "Miembro", "Ubicacion", "GPS miembro", "Direccion GPS", "Tipo", "Dias", "Horas extra", "Coste"],
          rows: filteredWorks.map((work) => [
            formatDate(getDateKey(work.date)),
            getMemberName(work.userId),
            getLocationName(getWorkLocationId(work)) || "Sin ubicacion",
            formatGpsCoordinates(getWorkMemberGps(work)) || "Sin GPS",
            getWorkMemberLocationLabel(work) || "Sin direccion",
            getWorkTypeLabel(work),
            formatNumber(getWorkUnits(work)),
            `${formatNumber(work.overtimeHours || 0)}h`,
            formatMoney(getWorkLaborCost(work)),
          ]),
        },
        {
          title: "Detalle de pagos",
          headers: ["Fecha", "Miembro", "Ubicacion", "Tipo", "Monto"],
          rows: filteredPayments.map((payment) => [
            formatDate(getDateKey(payment.date || payment.createdAt)),
            getMemberName(payment.userId),
            getLocationName(getPaymentLocationId(payment)) || "Sin ubicacion",
            payment.type === "total" ? "Pago total" : "Pago parcial",
            formatMoney(payment.amount),
          ]),
        },
        {
          title: "Solicitudes aceptadas",
          headers: ["Periodo", "Miembro", "Tipo", "Dias", "Nota"],
          rows: filteredAcceptedRequests.map((request) => [
            formatRequestRange(request),
            getMemberName(request.requesterId),
            request.absenceTypeLabel || "Ausencia",
            formatNumber(getRequestDays(request), 0),
            request.note || "",
          ]),
        },
      ],
    };
  }

  function handleExportStatsPdf() {
    const opened = openPrintableReport(createStatsReport());
    if (!opened) showNotification("El navegador bloqueo la ventana del reporte", "error");
  }

  function handleExportStatsExcel() {
    const teamName = team?.name || team?.team || "equipo";
    const filename = `reporte-${teamName}-${range.start}-${range.end}`;
    downloadExcelReport(createStatsReport(), filename);
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

          <div class="export-actions">
            <button type="button" onclick={handleExportStatsPdf} disabled={isLoading}>
              <Download size={17} />
              <span>Exportar PDF</span>
            </button>
            <button type="button" onclick={handleExportStatsExcel} disabled={isLoading}>
              <Download size={17} />
              <span>Exportar Excel</span>
            </button>
          </div>

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
              <div class="metric-icon requests"><CalendarCheck size={20} /></div>
              <span>Solicitudes aceptadas</span>
              <strong>{summary.acceptedAbsenceRequests}</strong>
              <small>{formatNumber(summary.acceptedAbsenceDays, 0)} días de ausencia</small>
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

            <details class="panel work-accordion">
              <summary class="panel-heading accordion-summary">
                <div>
                  <p>Control GPS</p>
                  <h2>Jornadas recientes</h2>
                </div>
                <span class="accordion-meta">
                  {filteredWorks.length}
                  <MapPin size={20} />
                </span>
              </summary>
              {#if filteredWorks.length}
                <div class="work-list">
                  {#each filteredWorks.slice(0, 8) as work (work.id)}
                    <article class="work-row">
                      <div class="member-avatar">{getMemberInitials(work.userId)}</div>
                      <div>
                        <h3>{getMemberName(work.userId)}</h3>
                        <p>{formatDate(getDateKey(work.date))} · {getWorkTypeLabel(work)}</p>
                        {#if getWorkMemberLocationLabel(work)}
                          <a class="work-location-link" href={getWorkMemberLocationUrl(work)} target="_blank" rel="noopener noreferrer">
                            <MapPin size={13} />
                            <span>{getWorkMemberLocationLabel(work)}</span>
                          </a>
                        {:else}
                          <small class="work-location-muted">Sin GPS registrada</small>
                        {/if}
                      </div>
                      <strong>{formatMoney(getWorkLaborCost(work))}</strong>
                    </article>
                  {/each}
                </div>
              {:else}
                <div class="empty-inline">Sin jornadas en este periodo.</div>
              {/if}
            </details>
          </section>

          <section class="insights-grid">
            <article class="panel">
              <div class="panel-heading">
                <div>
                  <p>Ausencias</p>
                  <h2>Solicitudes aceptadas</h2>
                </div>
                <CalendarCheck size={20} />
              </div>
              {#if filteredAcceptedRequests.length}
                <div class="request-list">
                  {#each filteredAcceptedRequests.slice(0, 8) as request (request.id)}
                    <article class="request-row">
                      <div>
                        <h3>{request.absenceTypeLabel || "Ausencia"}</h3>
                        <p>{getMemberName(request.requesterId)} · {formatRequestRange(request)}</p>
                      </div>
                      <strong>{formatNumber(getRequestDays(request), 0)} días</strong>
                    </article>
                  {/each}
                </div>
              {:else}
                <div class="empty-inline">Sin solicitudes aceptadas en este periodo.</div>
              {/if}
            </article>
          </section>

          {#if ghostSummaries.length}
            <section class="insights-grid ghost-section">
              <article class="panel ghost-panel">
                <div class="panel-heading">
                  <div>
                    <p>👻 Miembros temporales</p>
                    <h2>Jornadas sin coste</h2>
                  </div>
                  <span class="ghost-count">{ghostSummaries.length} {ghostSummaries.length === 1 ? "miembro temporal" : "miembros temporales"}</span>
                </div>
                <p class="ghost-panel-hint">
                  Las jornadas de miembros temporales se registran con normalidad (incluyendo horas extra y GPS)
                  pero nunca generan coste para el equipo.
                </p>
                <div class="ghost-table">
                  <div class="ghost-table-head">
                    <span>Miembro temporal</span>
                    <span>Días completos</span>
                    <span>Medios días</span>
                    <span>Horas extra</span>
                    <span>Última jornada</span>
                    <span>Total registros</span>
                  </div>
                  {#each ghostSummaries as ghost (ghost.id)}
                    <div class="ghost-table-row">
                      <span class="ghost-name">
                        <span class="ghost-avatar" aria-hidden="true">👻</span>
                        {ghost.name}
                      </span>
                      <span>{formatNumber(ghost.fullDays, 0)}</span>
                      <span>{formatNumber(ghost.halfDays, 0)}</span>
                      <span>{formatNumber(ghost.overtimeHours)}h</span>
                      <span>{ghost.lastDate ? formatDate(ghost.lastDate) : "Sin actividad"}</span>
                      <span class="ghost-total-cell">
                        {ghost.totalWorksdays + ghost.totalOvertime}
                        <small class="ghost-total-detail">
                          {ghost.totalWorksdays} jor · {ghost.totalOvertime} extra
                        </small>
                      </span>
                    </div>
                  {/each}
                </div>
              </article>

              <article class="panel ghost-records-panel">
                <div class="panel-heading">
                  <div>
                    <p>👻 Detalle</p>
                    <h2>Días y horas trabajadas</h2>
                  </div>
                  <span class="ghost-count">
                    {ghostWorkRecords.length} {ghostWorkRecords.length === 1 ? "miembro temporal con registros" : "miembros temporales con registros"}
                  </span>
                </div>
                <p class="ghost-panel-hint">
                  Expande un miembro temporal para revisar cada jornada y hora extra registradas. Los
                  registros pueden borrarse uno a uno o limpiarse por completo.
                </p>
                {#if ghostWorkRecords.length}
                  <ul class="ghost-records-list">
                    {#each ghostWorkRecords as ghost (ghost.id)}
                      <li class="ghost-record-item">
                        <div class="ghost-record-summary">
                          <button
                            type="button"
                            class="ghost-record-toggle"
                            aria-expanded={expandedGhostIds.has(ghost.id)}
                            onclick={() => toggleGhostExpansion(ghost.id)}
                          >
                            <span class="ghost-avatar" aria-hidden="true">👻</span>
                            <span class="ghost-record-name">{ghost.name}</span>
                            <span class="ghost-record-meta">
                              {ghost.entries.length} {ghost.entries.length === 1 ? "registro" : "registros"}
                            </span>
                            <span class="ghost-record-chevron" class:open={expandedGhostIds.has(ghost.id)}>
                              <ChevronDown size={16} />
                            </span>
                          </button>
                          {#if canManageGhostRecords}
                            <button
                              type="button"
                              class="ghost-clear-btn"
                              onclick={() => handleClearGhost(ghost)}
                              disabled={isClearingGhostId === ghost.id}
                              aria-label={`Limpiar todos los registros de ${ghost.name}`}
                            >
                              <Eraser size={14} />
                              <span>{isClearingGhostId === ghost.id ? "Limpiando..." : "Limpiar"}</span>
                            </button>
                          {/if}
                        </div>
                        {#if expandedGhostIds.has(ghost.id)}
                          <div class="ghost-record-entries">
                            {#each ghost.entries as entry (`${ghost.id}:${entry.id}`)}
                              {@const entryKey = `${ghost.id}:${entry.id}`}
                              <div class="ghost-record-entry">
                                <div class="ghost-record-entry-info">
                                  <span class="ghost-record-entry-date">{formatDate(entry.date)}</span>
                                  <span class="ghost-record-entry-kind">{ghostLabel(entry.kind)}</span>
                                  <span class="ghost-record-entry-value">{getGhostEntryLabel(entry)}</span>
                                  {#if entry.taskTitle}
                                    <span class="ghost-record-entry-task">{entry.taskTitle}</span>
                                  {/if}
                                  {#if entry.assignedByName}
                                    <span class="ghost-record-entry-author">
                                      por {entry.assignedByName}
                                    </span>
                                  {/if}
                                </div>
                                {#if canManageGhostRecords}
                                  <button
                                    type="button"
                                    class="ghost-entry-remove"
                                    onclick={() => handleRemoveGhostEntry(ghost, entry)}
                                    disabled={isRemovingGhostEntryId === entryKey}
                                    aria-label={`Eliminar registro del ${formatDate(entry.date)}`}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                {/if}
                              </div>
                            {/each}
                          </div>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {:else}
                  <div class="empty-inline">No hay jornadas ni horas extra registradas para miembros temporales.</div>
                {/if}
              </article>
            </section>
          {/if}

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
  .export-actions button,
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

  .export-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .export-actions button {
    border-radius: 12px;
    min-height: 42px;
    justify-content: center;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--text-primary);
  }

  .export-actions button:hover:not(:disabled) {
    background: var(--bg-accent-subtle);
    color: var(--accent-ink);
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
  .metric-icon.locations,
  .metric-icon.requests {
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

  .work-accordion {
    align-self: start;
  }

  .work-accordion .panel-heading {
    margin-bottom: 0;
  }

  .work-accordion[open] .panel-heading {
    margin-bottom: 16px;
  }

  .ghost-panel {
    border-color: rgba(148, 163, 184, 0.25);
    background: linear-gradient(180deg, rgba(148, 163, 184, 0.08), var(--bg-card, transparent));
  }

  .ghost-panel-hint {
    margin: 0 0 14px;
    font-size: 13px;
    color: var(--text-secondary, #475569);
    line-height: 1.5;
  }

  .ghost-count {
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.18);
    color: #475569;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }

  .ghost-table {
    display: grid;
    gap: 6px;
  }

  .ghost-table-head,
  .ghost-table-row {
    display: grid;
    grid-template-columns: 1.6fr repeat(4, 1fr);
    gap: 8px;
    align-items: center;
    padding: 8px 12px;
    border-radius: var(--radius-sm, 8px);
  }

  .ghost-table-head {
    background: rgba(148, 163, 184, 0.12);
    font-size: 11px;
    font-weight: 800;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .ghost-table-row {
    background: var(--bg-input, rgba(148, 163, 184, 0.05));
    font-size: 14px;
  }

  .ghost-table-row .ghost-name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
  }

  .ghost-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(148, 163, 184, 0.25);
    display: grid;
    place-items: center;
    font-size: 16px;
    line-height: 1;
  }

  .ghost-section {
    grid-template-columns: 1fr;
  }

  @media (min-width: 880px) {
    .ghost-section {
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    }
  }

  .ghost-table-head,
  .ghost-table-row {
    grid-template-columns: 1.6fr repeat(4, 1fr) 1.2fr;
  }

  .ghost-total-cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .ghost-total-detail {
    font-size: 11px;
    color: var(--text-secondary, #64748b);
    font-weight: 500;
  }

  .ghost-records-panel {
    border-color: rgba(148, 163, 184, 0.25);
  }

  .ghost-records-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ghost-record-item {
    background: var(--bg-input, rgba(148, 163, 184, 0.05));
    border-radius: var(--radius-sm, 8px);
    overflow: hidden;
  }

  .ghost-record-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px 4px 4px;
  }

  .ghost-record-toggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-sm, 8px);
    min-width: 0;
  }

  .ghost-record-toggle:hover {
    background: rgba(148, 163, 184, 0.1);
  }

  .ghost-record-name {
    flex: 1;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ghost-record-meta {
    font-size: 12px;
    color: var(--text-secondary, #64748b);
    flex-shrink: 0;
  }

  .ghost-record-chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary, #64748b);
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .ghost-record-chevron.open {
    transform: rotate(180deg);
  }

  .ghost-clear-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: var(--radius-sm, 8px);
    background: rgba(148, 163, 184, 0.1);
    color: var(--text-primary);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease;
    flex-shrink: 0;
  }

  .ghost-clear-btn:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.5);
    color: #b91c1c;
  }

  .ghost-clear-btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .ghost-record-entries {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 8px 8px 12px;
  }

  .ghost-record-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius-sm, 8px);
    background: var(--bg-card, var(--bg-surface, #ffffff));
    border: 1px solid var(--border-color, rgba(148, 163, 184, 0.2));
  }

  .ghost-record-entry-info {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 13px;
  }

  .ghost-record-entry-date {
    font-weight: 700;
  }

  .ghost-record-entry-kind {
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(99, 102, 241, 0.12);
    color: rgb(67, 56, 202);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .ghost-record-entry-value {
    font-weight: 700;
  }

  .ghost-record-entry-task {
    color: var(--text-secondary, #64748b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .ghost-record-entry-author {
    font-size: 11px;
    color: var(--text-secondary, #64748b);
    font-style: italic;
  }

  .ghost-entry-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--border-color, rgba(148, 163, 184, 0.4));
    border-radius: 8px;
    background: transparent;
    color: var(--text-secondary, #64748b);
    cursor: pointer;
    transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
    flex-shrink: 0;
  }

  .ghost-entry-remove:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.5);
    color: #b91c1c;
  }

  .ghost-entry-remove:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  @media (max-width: 540px) {
    .ghost-table-head,
    .ghost-table-row {
      grid-template-columns: 1.4fr repeat(5, 1fr);
      font-size: 12px;
      padding: 6px 8px;
    }
    .ghost-record-entry-info {
      font-size: 12px;
    }
    .ghost-record-entry-task {
      max-width: 100%;
    }
  }

  .accordion-summary {
    list-style: none;
    cursor: pointer;
  }

  .accordion-summary::-webkit-details-marker {
    display: none;
  }

  .accordion-summary::after {
    content: "";
    width: 9px;
    height: 9px;
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: rotate(45deg);
    transition: transform 0.18s ease;
    flex-shrink: 0;
  }

  .work-accordion[open] .accordion-summary::after {
    transform: rotate(225deg);
  }

  .accordion-meta {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    border-radius: 999px;
    background: var(--bg-input);
    color: var(--text-secondary);
    padding: 0 10px;
    font-size: 13px;
    font-weight: 800;
    white-space: nowrap;
  }

  .bar-list,
  .member-list,
  .request-list,
  .work-list {
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

  .member-row,
  .work-row {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 10px;
  }

  .request-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 12px;
    background: var(--bg-input);
  }

  .request-row h3 {
    margin: 0 0 4px;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .request-row p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.3;
  }

  .request-row strong {
    color: var(--info-color);
    font-size: 13px;
    text-align: right;
    white-space: nowrap;
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

  .member-row h3,
  .work-row h3 {
    font-size: 14px;
    margin: 0 0 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .member-row p,
  .work-row p,
  .work-location-muted {
    color: var(--text-secondary);
    font-size: 12px;
    margin: 0;
  }

  .work-location-link {
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    min-width: 0;
    margin-top: 5px;
    text-decoration: none;
    font-size: 12px;
  }

  .work-location-link:hover {
    color: var(--text-primary);
  }

  .work-location-link span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .work-location-muted {
    display: block;
    margin-top: 5px;
  }

  .member-row strong,
  .work-row strong {
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
    .export-actions,
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

    .member-row,
    .work-row {
      grid-template-columns: 38px minmax(0, 1fr);
    }

    .member-row strong,
    .work-row strong {
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
