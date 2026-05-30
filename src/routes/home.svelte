<script>
  import { onMount } from "svelte";
  import {
    userStore,
    notificationsStore,
    teamsStore,
    getUserProfile,
    getUserTeamWorks,
    getAssignedTasksFromTeams,
    getAbsenceRequestsForUser,
    REQUEST_STATUS,
    hasTeamPermission,
  } from "../data/stores";
  import AvatarCircle from "../components/AvatarCircle.svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import {
    Bell,
    BellRing,
    Calendar,
    CalendarCheck,
    CheckCircle2,
    ClipboardList,
    Clock,
    Users,
    TrendingUp,
    Calculator,
    StickyNote,
    WalletCards,
    MapPinned,
    MapPin,
    Package,
    ArrowRight,
    PackageSearch,
    Info,
    Inbox,
    TriangleAlert,
    UserPlus,
  } from "lucide-svelte";
  import { collection, getDocs } from "firebase/firestore";
  import { db } from "../data/firebase.js";
  import { navigateTo } from "../router.js";

  let hasUnread = $derived($notificationsStore.some((n) => !n.opened));
  let unreadCount = $derived($notificationsStore.filter((n) => !n.opened).length);

  onMount(async () => {
    if ($userStore?.uid) {
      const profile = await getUserProfile($userStore.uid);
      if (profile) {
        userStore.update(u => ({ ...u, ...profile }));
      }
    }
  });

  // Estadísticas del mes
  let workDaysThisMonth = $state(0);
  let totalTeams = $state(0);
  let estimatedEarnings = $state(0);
  let messagesSent = $state(0);
  let totalStats = $state(null);
  let earningsBreakdown = $state([]);
  let showEarningsDetails = $state(false);
  let statsRequestId = 0;
  let productSearchTerm = $state("");
  let productCatalog = $state([]);
  let isLoadingProducts = $state(false);
  let productSearchError = $state("");
  let productCatalogRequestId = 0;
  let showStatsTeamPicker = $state(false);
  let todayAssignedTasks = $state([]);
  let todayRequestsOverview = $state({ own: [], incoming: [], invitations: [] });
  let todayWorkAssignments = $state([]);
  let isLoadingTodayPanel = $state(false);
  let todayPanelError = $state("");
  let todayPanelRequestId = 0;

  let todayDateKey = $derived(toDateString(new Date()));
  let activeAssignedTasks = $derived.by(() =>
    todayAssignedTasks.filter((task) => !isTaskCompleted(task)),
  );
  let urgentAssignedTasks = $derived.by(() =>
    activeAssignedTasks
      .filter((task) => {
        const dueDate = getDateKey(task.dueDate);
        return dueDate && dueDate <= todayDateKey;
      })
      .sort((a, b) => getDateKey(a.dueDate).localeCompare(getDateKey(b.dueDate))),
  );
  let pendingIncomingRequests = $derived(
    todayRequestsOverview.incoming.filter((request) => request.status === REQUEST_STATUS.pending),
  );
  let pendingOwnRequests = $derived(
    todayRequestsOverview.own.filter((request) => request.status === REQUEST_STATUS.pending),
  );
  let pendingInvitations = $derived(
    todayRequestsOverview.invitations.filter((invitation) => invitation.status === REQUEST_STATUS.pending),
  );
  let pendingRequestCount = $derived(
    pendingIncomingRequests.length + pendingOwnRequests.length + pendingInvitations.length,
  );
  let lowStockProducts = $derived.by(() =>
    productCatalog
      .filter((product) => product.minStock > 0 && product.quantity <= product.minStock)
      .sort((a, b) => (a.quantity - a.minStock) - (b.quantity - b.minStock)),
  );
  let todayActionItems = $derived.by(() => buildTodayActionItems());

  let filteredProducts = $derived.by(() => {
    const term = normalizeSearch(productSearchTerm);

    if (!term) return productCatalog.slice(0, 4);

    return productCatalog
      .filter((product) =>
        [
          product.name,
          product.category,
          product.locationName,
          product.teamName,
          product.typeLabel,
        ].some((value) => normalizeSearch(value).includes(term)),
      )
      .slice(0, 6);
  });

  // Calcular estadísticas
  async function calculateStats() {
    const requestId = ++statsRequestId;

    try {
      const uid = $userStore?.uid;
      const teams = $teamsStore || [];
      const { start, end } = getCurrentMonthRange();

      totalTeams = teams.length;

      if (!uid || teams.length === 0) {
        workDaysThisMonth = 0;
        estimatedEarnings = 0;
        earningsBreakdown = [];
        todayWorkAssignments = [];
        totalStats = {
          workDaysThisMonth,
          totalTeams,
          estimatedEarnings,
          messagesSent,
        };
        return;
      }

      const teamWorks = await Promise.all(
        teams.map(async (team) => ({
          team,
          works: await getUserTeamWorks(team.id, uid),
        })),
      );

      if (requestId !== statsRequestId) return;

      const todayKey = toDateString(new Date());
      todayWorkAssignments = teamWorks
        .flatMap(({ team, works }) =>
          works
            .filter((work) => work.date === todayKey)
            .map((work) => ({
              ...work,
              teamId: team.id,
              teamName: team.name || team.team || "Equipo",
            })),
        )
        .sort((a, b) => (a.teamName || "").localeCompare(b.teamName || "", "es"));

      let totalWorkDays = 0;
      let totalEarnings = 0;
      const breakdown = [];

      teamWorks.forEach(({ team, works }) => {
        const { dailyRate, extraHourRate } = getMemberRates(team, uid);
        const monthWorks = works.filter((work) => work.date >= start && work.date <= end);
        let teamWorkDays = 0;
        let teamBaseEarnings = 0;
        let teamOvertimeHours = 0;
        let teamOvertimeEarnings = 0;

        monthWorks.forEach((work) => {
          const workDayValue = getWorkDayValue(work);
          const baseEarnings = getBaseWorkEarnings(work, dailyRate);
          const overtimeHours = Number(work.overtimeHours) || 0;
          const overtimeEarnings = overtimeHours * extraHourRate;

          teamWorkDays += workDayValue;
          teamBaseEarnings += baseEarnings;
          teamOvertimeHours += overtimeHours;
          teamOvertimeEarnings += overtimeEarnings;
          totalWorkDays += workDayValue;
          totalEarnings += baseEarnings + overtimeEarnings;
        });

        if (monthWorks.length > 0) {
          breakdown.push({
            teamId: team.id,
            teamName: team.name || team.team || "Equipo",
            workDays: teamWorkDays,
            workCount: monthWorks.length,
            dailyRate,
            extraHourRate,
            baseEarnings: teamBaseEarnings,
            overtimeHours: teamOvertimeHours,
            overtimeEarnings: teamOvertimeEarnings,
            total: teamBaseEarnings + teamOvertimeEarnings,
          });
        }
      });

      workDaysThisMonth = totalWorkDays;
      estimatedEarnings = totalEarnings;
      earningsBreakdown = breakdown.sort((a, b) => b.total - a.total);

      // Mensajes enviados
      const chatStats = localStorage.getItem("chatStats");
      if (chatStats) {
        const stats = JSON.parse(chatStats);
        messagesSent = stats.totalMessages || 0;
      }

      totalStats = {
        workDaysThisMonth,
        totalTeams,
        estimatedEarnings,
        messagesSent,
      };
    } catch (error) {
      console.error("Error calculating stats:", error);
      todayWorkAssignments = [];
    }
  }

  $effect(() => {
    calculateStats();
  });

  $effect(() => {
    loadProductCatalog($teamsStore || []);
  });

  $effect(() => {
    loadTodayPanel($userStore?.uid, $teamsStore || []);
  });

  async function loadTodayPanel(uid, teams = []) {
    const requestId = ++todayPanelRequestId;

    if (!uid) {
      todayAssignedTasks = [];
      todayRequestsOverview = { own: [], incoming: [], invitations: [] };
      todayPanelError = "";
      isLoadingTodayPanel = false;
      return;
    }

    isLoadingTodayPanel = true;
    todayPanelError = "";

    try {
      const [assignedTasks, requests] = await Promise.all([
        getAssignedTasksFromTeams(teams, uid),
        getAbsenceRequestsForUser(uid),
      ]);

      if (requestId !== todayPanelRequestId) return;

      todayAssignedTasks = assignedTasks || [];
      todayRequestsOverview = {
        own: requests?.own || [],
        incoming: requests?.incoming || [],
        invitations: requests?.invitations || [],
      };
    } catch (error) {
      console.error("Error loading today panel:", error);
      if (requestId !== todayPanelRequestId) return;
      todayAssignedTasks = [];
      todayRequestsOverview = { own: [], incoming: [], invitations: [] };
      todayPanelError = "No se pudo actualizar el panel.";
    } finally {
      if (requestId === todayPanelRequestId) {
        isLoadingTodayPanel = false;
      }
    }
  }

  async function loadProductCatalog(teams) {
    const requestId = ++productCatalogRequestId;
    const uid = $userStore?.uid;
    const readableTeams = teams.filter((team) =>
      hasTeamPermission(team, uid, "inventory", "view"),
    );

    if (!uid || readableTeams.length === 0) {
      productCatalog = [];
      productSearchError = "";
      isLoadingProducts = false;
      return;
    }

    isLoadingProducts = true;
    productSearchError = "";

    try {
      const teamCatalogs = await Promise.all(
        readableTeams.map(async (team) => {
          const [productsSnapshot, locationsSnapshot] = await Promise.all([
            getDocs(collection(db, "teams", team.id, "inventory")),
            getDocs(collection(db, "teams", team.id, "locations")),
          ]);
          const locationNames = new Map();

          locationsSnapshot.forEach((locationDoc) => {
            const location = locationDoc.data();
            locationNames.set(locationDoc.id, location.name || "");
          });

          return productsSnapshot.docs.map((productDoc) => {
            const product = productDoc.data();
            const locationName =
              locationNames.get(product.locationId) || product.locationName || "";

            return {
              id: productDoc.id,
              teamId: team.id,
              teamName: team.name || team.team || "Equipo",
              name: product.name || "Producto sin nombre",
              category: product.category || "",
              quantity: Number(product.quantity) || 0,
              locationName,
              typeLabel: product.productType === "tool" ? "Herramienta" : "Producto",
              minStock: Number(product.minStock) || 0,
              productType: product.productType || "material",
            };
          });
        }),
      );

      if (requestId !== productCatalogRequestId) return;

      productCatalog = teamCatalogs
        .flat()
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
    } catch (error) {
      console.error("Error loading product catalog:", error);
      if (requestId !== productCatalogRequestId) return;
      productCatalog = [];
      productSearchError = "No se pudieron cargar los productos.";
    } finally {
      if (requestId === productCatalogRequestId) {
        isLoadingProducts = false;
      }
    }
  }

  function normalizeSearch(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function openProductInventory(product) {
    if (!product?.teamId) return;
    navigateTo(`/teams/${product.teamId}/inventory`);
  }

  function openMyStats() {
    const teams = $teamsStore || [];
    if (teams.length === 0) {
      navigateTo("/teams");
      return;
    }
    if (teams.length === 1) {
      navigateTo(`/teams/${teams[0].id}/my-stats`);
      return;
    }
    showStatsTeamPicker = true;
  }

  function openTeamMyStats(team) {
    showStatsTeamPicker = false;
    navigateTo(`/teams/${team.id}/my-stats`);
  }

  function buildTodayActionItems() {
    const items = [];

    if (pendingInvitations.length > 0) {
      items.push({
        key: "team-invitations",
        title: "Invitaciones de equipo",
        subtitle: `${pendingInvitations.length} ${pendingInvitations.length === 1 ? "pendiente" : "pendientes"}`,
        href: "/requests?section=invitations",
        Icon: UserPlus,
        tone: "info",
      });
    }

    if (pendingIncomingRequests.length > 0) {
      items.push({
        key: "incoming-requests",
        title: "Solicitudes por revisar",
        subtitle: `${pendingIncomingRequests.length} ${pendingIncomingRequests.length === 1 ? "solicitud" : "solicitudes"}`,
        href: "/requests?section=incoming",
        Icon: Inbox,
        tone: "warning",
      });
    }

    urgentAssignedTasks.slice(0, 2).forEach((task) => {
      const dueDate = getDateKey(task.dueDate);
      items.push({
        key: `task-${task.teamId}-${task.id}`,
        title: task.title || "Tarea sin título",
        subtitle: `${task.teamName || "Equipo"} · ${getTaskDueLabel(task)}`,
        href: `/teams/${task.teamId}/tasks`,
        Icon: ClipboardList,
        tone: dueDate < todayDateKey ? "danger" : "warning",
      });
    });

    if (pendingOwnRequests.length > 0) {
      items.push({
        key: "own-requests",
        title: "Solicitudes enviadas",
        subtitle: `${pendingOwnRequests.length} ${pendingOwnRequests.length === 1 ? "sigue" : "siguen"} pendiente${pendingOwnRequests.length === 1 ? "" : "s"}`,
        href: "/requests",
        Icon: Clock,
        tone: "neutral",
      });
    }

    todayWorkAssignments.slice(0, 2).forEach((work) => {
      items.push({
        key: `work-${work.teamId}-${work.id || work.date}`,
        title: "Jornada de hoy",
        subtitle: `${work.teamName} · ${getWorkTypeLabel(work)}`,
        href: `/teams/${work.teamId}/planning`,
        Icon: CalendarCheck,
        tone: "success",
      });
    });

    lowStockProducts.slice(0, 2).forEach((product) => {
      items.push({
        key: `stock-${product.teamId}-${product.id}`,
        title: product.name,
        subtitle: `${product.teamName} · ${product.quantity}/${product.minStock} uds.`,
        href: `/teams/${product.teamId}/inventory`,
        Icon: TriangleAlert,
        tone: "danger",
      });
    });

    return items.slice(0, 6);
  }

  function getTodayWorkHref() {
    const teamId = todayWorkAssignments[0]?.teamId;
    return teamId ? `/teams/${teamId}/planning` : "/timer";
  }

  function getTasksHref() {
    const teamId = urgentAssignedTasks[0]?.teamId || activeAssignedTasks[0]?.teamId;
    return teamId ? `/teams/${teamId}/tasks` : "/teams";
  }

  function getRequestsHref() {
    if (pendingInvitations.length > 0) return "/requests?section=invitations";
    if (pendingIncomingRequests.length > 0) return "/requests?section=incoming";
    return "/requests";
  }

  function getInventoryHref() {
    const teamId = lowStockProducts[0]?.teamId || productCatalog[0]?.teamId;
    return teamId ? `/teams/${teamId}/inventory` : "/teams";
  }

  function getCurrentMonthRange() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    return {
      start: toDateString(new Date(year, month, 1)),
      end: toDateString(new Date(year, month + 1, 0)),
    };
  }

  function toDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getDateKey(value) {
    if (!value) return "";
    const stringValue = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(stringValue)) return stringValue.slice(0, 10);

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return toDateString(date);
  }

  function formatShortDate(dateValue) {
    const dateKey = getDateKey(dateValue);
    if (!dateKey) return "";
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
    });
  }

  function isTaskCompleted(task) {
    return task?.status === "completed";
  }

  function getTaskDueLabel(task) {
    const dueDate = getDateKey(task?.dueDate);
    if (!dueDate) return "Sin fecha";
    if (dueDate < todayDateKey) return `Vencida · ${formatShortDate(dueDate)}`;
    if (dueDate === todayDateKey) return "Vence hoy";
    return `Vence ${formatShortDate(dueDate)}`;
  }

  function getWorkTypeLabel(work) {
    if (work?.type === "half-day") return "Media jornada";
    if (work?.type === "overtime") return `${Number(work.overtimeHours) || 0} h extra`;
    if (work?.type === "variable") {
      const hours = Number(work.variableHours || work.durationHours) || 0;
      return hours > 0 ? `${hours} h variables` : "Jornada variable";
    }
    return "Jornada completa";
  }

  function formatTodayLabel() {
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "2-digit",
      month: "short",
    }).format(new Date());
  }

  function getMemberRates(team, uid) {
    const settings = team?.memberSettings?.[uid] || {};
    return {
      dailyRate: Number(settings.dailyRate) || 0,
      extraHourRate: Number(settings.extraHourRate) || 0,
    };
  }

  function getWorkDayValue(work) {
    if (work.type === "full-day") return 1;
    if (work.type === "half-day") return 0.5;
    return 0;
  }

  function getBaseWorkEarnings(work, dailyRate) {
    if (work.type === "full-day") return dailyRate;
    if (work.type === "half-day") return dailyRate / 2;
    return 0;
  }

  function getWorkEarnings(work, dailyRate, extraHourRate) {
    return getBaseWorkEarnings(work, dailyRate) + (Number(work.overtimeHours) || 0) * extraHourRate;
  }

  function formatCurrency(amount) {
    return `$${(Number(amount) || 0).toFixed(2)}`;
  }

  function formatWorkDays(days) {
    return `${days} ${Number(days) === 1 ? "día" : "días"}`;
  }

  function getEarningsMonthLabel() {
    return new Intl.DateTimeFormat("es-ES", {
      month: "long",
      year: "numeric",
    }).format(new Date());
  }

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Buenos días";
    if (hour < 18) return "Buenas tardes";
    return "Buenas noches";
  }
</script>

<div class="home-page">
  <div class="top-bg"></div>

  <div class="content-wrapper">
    <div class="home-page-user-toSay">
      <div>
        <AvatarCircle editable={false} size={40}/>
        <div class="greeting-section">
          <p class="greeting-text">{getGreeting()}</p>
          <h1 class="user-name">{$userStore?.name || $userStore?.email || "Usuario"}</h1>
        </div>
      </div>
      <div class="header-actions">
        <a
          href="/notifications"
          class="notification-link"
          class:has-unread={hasUnread}
          aria-label={hasUnread ? `${unreadCount} notificaciones pendientes` : "Notificaciones"}
        >
          {#if hasUnread}
            <BellRing size={27} strokeWidth={2.4} />
            <span class="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>
          {:else}
            <Bell size={24} strokeWidth={2.3} />
          {/if}
        </a>
      </div>
    </div>

    <section class="today-section" aria-labelledby="today-title">
      <div class="today-heading">
        <div>
          <p>{formatTodayLabel()}</p>
          <h2 id="today-title">Hoy</h2>
        </div>
        {#if isLoadingTodayPanel}
          <span class="today-status">Actualizando</span>
        {:else if todayActionItems.length > 0}
          <span class="today-status active">{todayActionItems.length} pendientes</span>
        {:else}
          <span class="today-status calm">Al día</span>
        {/if}
      </div>

      <div class="today-summary-grid">
        <a href={getTodayWorkHref()} class="today-summary-card success">
          <span class="today-summary-icon">
            <CalendarCheck size={20} />
          </span>
          <span class="today-summary-copy">
            <strong>{todayWorkAssignments.length}</strong>
            <small>Jornadas</small>
          </span>
        </a>

        <a href={getTasksHref()} class="today-summary-card warning">
          <span class="today-summary-icon">
            <ClipboardList size={20} />
          </span>
          <span class="today-summary-copy">
            <strong>{urgentAssignedTasks.length}</strong>
            <small>Tareas</small>
          </span>
        </a>

        <a href={getRequestsHref()} class="today-summary-card info">
          <span class="today-summary-icon">
            <Inbox size={20} />
          </span>
          <span class="today-summary-copy">
            <strong>{pendingRequestCount}</strong>
            <small>Solicitudes</small>
          </span>
        </a>

        <a href={getInventoryHref()} class="today-summary-card danger">
          <span class="today-summary-icon">
            <TriangleAlert size={20} />
          </span>
          <span class="today-summary-copy">
            <strong>{lowStockProducts.length}</strong>
            <small>Stock bajo</small>
          </span>
        </a>
      </div>

      {#if todayPanelError}
        <div class="today-empty warning">
          <TriangleAlert size={20} />
          <span>{todayPanelError}</span>
        </div>
      {:else if todayActionItems.length > 0}
        <div class="today-action-list" aria-label="Prioridades de hoy">
          {#each todayActionItems as item (item.key)}
            {@const ActionIcon = item.Icon}
            <a href={item.href} class={`today-action-item ${item.tone}`}>
              <span class="today-action-icon">
                <ActionIcon size={18} />
              </span>
              <span class="today-action-copy">
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </span>
              <ArrowRight size={17} />
            </a>
          {/each}
        </div>
      {:else}
        <div class="today-empty">
          <CheckCircle2 size={20} />
          <span>Todo al día</span>
        </div>
      {/if}
    </section>

    <section class="product-search-card" aria-labelledby="product-search-title">
      <div class="product-search-header">
        <div>
          <h2 id="product-search-title">Buscar producto</h2>
          <p>Encuentra rápido su equipo y ubicación</p>
        </div>
        <Package size={24} />
      </div>

      <label class="product-search-input" for="home-product-search">
        <PackageSearch size={18}/>
        <input
          id="home-product-search"
          type="search"
          bind:value={productSearchTerm}
          placeholder="Nombre, categoría o ubicación"
          autocomplete="off"
        />
      </label>

      <div class="product-results">
        {#if isLoadingProducts}
          <div class="product-result-state">Cargando productos...</div>
        {:else if productSearchError}
          <div class="product-result-state error">{productSearchError}</div>
        {:else if productCatalog.length === 0}
          <div class="product-result-state">No hay productos disponibles.</div>
        {:else if filteredProducts.length === 0}
          <div class="product-result-state">Sin resultados para "{productSearchTerm}".</div>
        {:else if productSearchTerm.length > 0}
          {#each filteredProducts as product (`${product.teamId}-${product.id}`)}
            <button
              type="button"
              class="product-result"
              onclick={() => openProductInventory(product)}
            >
              <span class="product-result-icon">
                <Package size={18} />
              </span>
              <span class="product-result-info">
                <strong>{product.name}</strong>
                <small>{product.teamName} · {product.typeLabel} · {product.quantity} uds.</small>
                <span>
                  <MapPin size={14} />
                  {product.locationName || "Sin ubicación"}
                </span>
              </span>
              <ArrowRight size={18} />
            </button>
          {/each}
        {/if}
      </div>
    </section>

    <!-- Quick Actions Row -->
    <div class="quick-actions-row">
      <a href="/teams" class="action-btn">
        <div class="action-icon-box">
          <Users size={28} />
        </div>
        <span class="action-label">Equipos</span>
      </a>
      <button type="button" class="action-btn" onclick={openMyStats}>
        <div class="action-icon-box">
          <TrendingUp size={28} />
        </div>
        <span class="action-label">Estadísticas</span>
      </button>
      <a href="/calendar" class="action-btn">
        <div class="action-icon-box">
          <Calendar size={28} />
        </div>
        <span class="action-label">Agenda</span>
      </a>
      <a href="/calculator" class="action-btn">
        <div class="action-icon-box">
          <Calculator size={28} />
        </div>
        <span class="action-label">Calculadora</span>
      </a>
      <a href="/locations" class="action-btn">
        <div class="action-icon-box">
          <MapPinned size={28} />
        </div>
        <span class="action-label">Ubicaciones</span>
      </a>
      <a href="/notes" class="action-btn">
        <div class="action-icon-box">
          <StickyNote size={28} />
        </div>
        <span class="action-label">Notas</span>
      </a>
    </div>

    <!-- Secondary Stats Section -->
    <div class="secondary-section">
      <div class="section-header">
        <h2 class="section-title">Estadísticas</h2>
        <span class="status-badge">{totalTeams} equipos activos</span>
      </div>
      
      <div class="stats-list">
        <div class="stat-row">
          <div class="stat-info">
            <span class="stat-title">Días Trabajados</span>
            <span class="stat-subtitle">Total este mes</span>
          </div>
          <button class="stat-value-btn">{workDaysThisMonth} días</button>
        </div>

        <div class="stat-row">
          <div class="stat-info">
            <span class="stat-title">Mensajes</span>
            <span class="stat-subtitle">Enviados en total</span>
          </div>
          <button class="stat-value-btn" style="background: var(--bg-input); color: var(--text-primary);">{messagesSent}</button>
        </div>
      </div>
    </div>

    <!-- Main Earnings Card -->
    <button
      type="button"
      class="main-card"
      title="Ver detalle de ganancias"
      aria-label="Ver detalle de ganancias"
      onclick={() => (showEarningsDetails = true)}
    >
      <div class="main-card-icon">
        <WalletCards size={30} />
      </div>
      <div class="main-card-content">
        <span>Ganancias estimadas del mes</span>
        <strong>{formatCurrency(estimatedEarnings)}</strong>
        <small>{getEarningsMonthLabel()} · {formatWorkDays(workDaysThisMonth)}</small>
      </div>
      <span class="earnings-details-btn" aria-hidden="true">
        <Info size={18} />
      </span>
    </button>
  </div>
</div>

<SliceContainer bind:show={showEarningsDetails}>
  <div class="earnings-slice">
    <div class="earnings-slice-header">
      <span>Ganancias estimadas</span>
      <h2>{formatCurrency(estimatedEarnings)}</h2>
      <p>{getEarningsMonthLabel()}</p>
    </div>

    <div class="earnings-summary-grid">
      <div>
        <span>Días</span>
        <strong>{formatWorkDays(workDaysThisMonth)}</strong>
      </div>
      <div>
        <span>Equipos</span>
        <strong>{earningsBreakdown.length}</strong>
      </div>
    </div>

    {#if earningsBreakdown.length === 0}
      <div class="earnings-empty">No hay jornadas registradas este mes.</div>
    {:else}
      <div class="earnings-breakdown-list">
        {#each earningsBreakdown as item (item.teamId)}
          <article class="earnings-breakdown-item">
            <div class="earnings-team-row">
              <div>
                <h3>{item.teamName}</h3>
                <p>{item.workCount} registros · {formatWorkDays(item.workDays)}</p>
              </div>
              <strong>{formatCurrency(item.total)}</strong>
            </div>

            <div class="earnings-detail-grid">
              <div>
                <span>Jornadas</span>
                <strong>{formatCurrency(item.baseEarnings)}</strong>
                <small>{formatCurrency(item.dailyRate)} / día</small>
              </div>
              <div>
                <span>Horas extra</span>
                <strong>{formatCurrency(item.overtimeEarnings)}</strong>
                <small>{item.overtimeHours} h · {formatCurrency(item.extraHourRate)} / h</small>
              </div>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</SliceContainer>

<SliceContainer bind:show={showStatsTeamPicker}>
  <div class="team-picker-slice">
    <div class="team-picker-header">
      <span>Mis estadísticas</span>
      <h2>Elige un equipo</h2>
      <p>Verás tus jornadas, horas extra e ingresos estimados dentro del equipo seleccionado.</p>
    </div>

    <div class="team-picker-list">
      {#each $teamsStore as team (team.id)}
        <button type="button" class="team-picker-item" onclick={() => openTeamMyStats(team)}>
          <span class="team-picker-icon">
            <Users size={18} />
          </span>
          <span>
            <strong>{team.name || team.team || "Equipo"}</strong>
            <small>{team.members?.length || 0} miembros</small>
          </span>
          <ArrowRight size={18} />
        </button>
      {/each}
    </div>
  </div>
</SliceContainer>

<style>
  .home-page {
    width: 100%;
    height: 100%;
    background: var(--bg-page);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    position: relative;
    padding-bottom: var(--bottom-nav-clearance);
    padding-top: var(--page-top-safe);
  }

  .top-bg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 400px;
    background-color: var(--accent-color);
    z-index: 0;
  }

  .content-wrapper {
    position: relative;
    z-index: 1;
    padding: 18px 20px 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .home-page-user-toSay {
    display: grid;
    align-items: center;
    grid-template-columns: 1fr auto;
    gap: 16px;
    padding-bottom: 8px;
    color: var(--accent-ink);
  }

  .home-page-user-toSay > div:first-child {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-direction: row;
  }

  .greeting-section {
    display: flex;
    flex-direction: column;
    gap: 0px;
  }

  .greeting-text {
    font-size: 14px;
    color: var(--accent-ink);
    opacity: 0.8;
    margin: 0;
    font-weight: 500;
  }

  .user-name {
    font-size: 18px;
    font-weight: 700;
    color: var(--accent-ink);
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .notification-link {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 40px;
    color: var(--accent-ink);
    background: color-mix(in srgb, var(--bg-card) 34%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent-ink) 12%, transparent);
    border-radius: 15px;
    text-decoration: none;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
    transition: all 0.2s ease;
  }

  .notification-link.has-unread {
    width: 58px;
    background: var(--accent-strong);
    color: var(--bg-page);
    border-color: transparent;
    box-shadow: 0 12px 28px color-mix(in srgb, var(--accent-strong) 24%, transparent);
  }
  
  .notification-link:active {
    transform: scale(0.95);
  }

  .notification-count {
    position: absolute;
    top: -7px;
    right: -7px;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background-color: var(--danger-color);
    color: #ffffff;
    border: 2px solid var(--accent-color);
    border-radius: 999px;
    font-size: 11px;
    font-weight: 900;
    line-height: 1;
    box-shadow: 0 6px 16px rgba(220, 38, 38, 0.28);
  }

  .today-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .today-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    color: var(--accent-ink);
  }

  .today-heading p {
    margin: 0 0 2px;
    color: var(--accent-ink);
    opacity: 0.72;
    font-size: 13px;
    font-weight: 800;
    text-transform: capitalize;
  }

  .today-heading h2 {
    margin: 0;
    color: var(--accent-ink);
    font-size: 30px;
    line-height: 1;
    font-weight: 900;
    letter-spacing: 0;
  }

  .today-status {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--bg-card) 45%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent-ink) 12%, transparent);
    color: var(--accent-ink);
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }

  .today-status.active {
    background: var(--accent-strong);
    border-color: var(--accent-strong);
    color: var(--bg-page);
  }

  .today-status.calm {
    background: color-mix(in srgb, var(--bg-card) 62%, transparent);
  }

  .today-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .today-summary-card {
    min-height: 94px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    background: var(--bg-card);
    border: 1px solid color-mix(in srgb, var(--border-color) 80%, transparent);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
    color: var(--text-primary);
    text-decoration: none;
    transition: transform 0.2s ease, border-color 0.2s ease;
  }

  .today-summary-card:active,
  .today-action-item:active {
    transform: scale(0.98);
  }

  .today-summary-icon,
  .today-action-icon {
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .today-summary-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .today-summary-copy strong {
    color: var(--text-primary);
    font-size: 24px;
    line-height: 1;
    font-weight: 900;
  }

  .today-summary-copy small {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
    line-height: 1.15;
  }

  .today-summary-card.success .today-summary-icon,
  .today-action-item.success .today-action-icon {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }

  .today-summary-card.warning .today-summary-icon,
  .today-action-item.warning .today-action-icon {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .today-summary-card.info .today-summary-icon,
  .today-action-item.info .today-action-icon {
    background: var(--bg-info-subtle);
    color: var(--info-color);
  }

  .today-summary-card.danger .today-summary-icon,
  .today-action-item.danger .today-action-icon {
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
  }

  .today-action-item.neutral .today-action-icon {
    background: var(--bg-input);
    color: var(--text-secondary);
  }

  .today-action-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .today-action-item {
    min-height: 66px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
    color: var(--text-primary);
    text-decoration: none;
    transition: transform 0.2s ease, border-color 0.2s ease;
  }

  .today-action-item.danger {
    border-color: color-mix(in srgb, var(--danger-color) 24%, var(--border-color));
  }

  .today-action-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .today-action-copy strong,
  .today-action-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .today-action-copy strong {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 850;
  }

  .today-action-copy small {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 650;
  }

  .today-empty {
    min-height: 58px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px;
    background: color-mix(in srgb, var(--bg-card) 88%, transparent);
    border: 1px solid color-mix(in srgb, var(--border-color) 84%, transparent);
    border-radius: var(--radius-md);
    color: var(--success-color);
    font-size: 14px;
    font-weight: 800;
    box-shadow: var(--shadow-card);
  }

  .today-empty.warning {
    color: var(--warning-color);
  }

  @media (max-width: 460px) {
    .today-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* Main Card Section */
  .main-card {
    width: 100%;
    background: linear-gradient(135deg, var(--accent-color) 0%, var(--bg-card) 100%);
    border-radius: var(--radius-lg);
    padding: 20px;
    border: 1px solid var(--border-color);
    box-shadow: var(--shadow-card);
    display: flex;
    align-items: center;
    gap: 16px;
    color: var(--accent-ink);
    text-align: left;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .main-card:active {
    transform: scale(0.98);
  }

  .main-card-icon {
    width: 58px;
    height: 58px;
    background: var(--accent-strong);
    color: var(--bg-card);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  :global(:root.dark) .main-card-icon {
    color: #000000;
  }

  .main-card-content {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .main-card-content span {
    color: var(--accent-ink);
    opacity: 0.76;
    font-size: 13px;
    font-weight: 800;
  }

  .main-card-content strong {
    color: var(--accent-ink);
    font-size: clamp(28px, 8vw, 42px);
    font-weight: 800;
    letter-spacing: 0;
    line-height: 1;
  }

  .main-card-content small {
    color: var(--accent-ink);
    opacity: 0.68;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.35;
  }

  .earnings-details-btn {
    width: 36px;
    height: 36px;
    border: none;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent-ink) 10%, transparent);
    color: var(--accent-ink);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .earnings-slice {
    width: 100%;
    padding: 0 20px 28px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .earnings-slice-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .earnings-slice-header span {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
  }

  .earnings-slice-header h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: 36px;
    line-height: 1;
    font-weight: 800;
  }

  .earnings-slice-header p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 14px;
    text-transform: capitalize;
  }

  .earnings-summary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .earnings-summary-grid div,
  .earnings-detail-grid div {
    border: 1px solid var(--border-color);
    background: var(--bg-page);
    border-radius: var(--radius-md);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .earnings-summary-grid span,
  .earnings-detail-grid span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
  }

  .earnings-summary-grid strong,
  .earnings-detail-grid strong {
    color: var(--text-primary);
    font-size: 16px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .earnings-breakdown-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .earnings-breakdown-item {
    border: 1px solid var(--border-color);
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .earnings-team-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: flex-start;
  }

  .earnings-team-row h3 {
    margin: 0 0 4px;
    color: var(--text-primary);
    font-size: 16px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .earnings-team-row p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .earnings-team-row > strong {
    color: var(--accent-strong);
    font-size: 16px;
    font-weight: 800;
  }

  .earnings-detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .earnings-detail-grid small {
    color: var(--text-secondary);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .earnings-empty {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-page);
    color: var(--text-secondary);
    font-size: 14px;
    padding: 18px;
    text-align: center;
  }

  @media (max-width: 380px) {
    .earnings-detail-grid {
      grid-template-columns: 1fr;
    }
  }


  .product-search-card {
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    padding: 20px;
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .product-search-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    color: var(--text-primary);
  }

  .product-search-header h2 {
    font-size: 20px;
    font-weight: 700;
    margin: 0 0 4px;
    color: var(--text-primary);
  }

  .product-search-header p {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0;
  }

  .product-search-input {
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
  }

  .product-search-input input {
    width: 100%;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 15px;
  }

  .product-search-input input::placeholder {
    color: var(--text-secondary);
  }

  .product-results {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .product-result {
    width: 100%;
    min-height: 72px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--bg-page);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease;
  }

  .product-result:active {
    transform: scale(0.98);
  }

  .product-result-icon {
    width: 42px;
    height: 42px;
    border-radius: var(--radius-sm);
    background: var(--bg-accent-subtle);
    color: var(--accent-strong);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .product-result-info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .product-result-info strong,
  .product-result-info small,
  .product-result-info span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .product-result-info strong {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .product-result-info small {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .product-result-info span {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .product-result-state {
    padding: 14px;
    border-radius: var(--radius-md);
    background: var(--bg-page);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    font-size: 14px;
    text-align: center;
  }

  .product-result-state.error {
    color: var(--danger-color);
  }

  /* Quick Actions Row */
  .quick-actions-row {
    display: flex;
    justify-content: flex-start;
    gap: 14px;
    overflow-x: auto;
    padding: 0 8px;
    margin-top: 18px;
    scrollbar-width: none;
  }

  .quick-actions-row::-webkit-scrollbar {
    display: none;
  }

  .action-btn {
    flex: 0 0 68px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 0;
    border: 0;
    background: transparent;
    text-decoration: none;
    color: var(--text-primary);
    transition: transform 0.2s ease;
    cursor: pointer;
  }

  .action-btn:active {
    transform: scale(0.95);
  }

  .action-icon-box {
    width: 52px;
    height: 52px;
    background: var(--bg-card);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-card);
    color: var(--text-primary);
  }

  .action-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    text-align: center;
    line-height: 1.15;
  }

  .team-picker-slice {
    width: 100%;
    padding: 0 20px 28px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .team-picker-header {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .team-picker-header span {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 700;
  }

  .team-picker-header h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: 24px;
    font-weight: 800;
  }

  .team-picker-header p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.4;
  }

  .team-picker-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .team-picker-item {
    width: 100%;
    min-height: 68px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-page);
    color: var(--text-primary);
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 12px;
    text-align: left;
    cursor: pointer;
  }

  .team-picker-icon {
    width: 42px;
    height: 42px;
    border-radius: var(--radius-sm);
    background: var(--bg-purple-subtle);
    color: var(--purple-color);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .team-picker-item span:nth-child(2) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .team-picker-item strong,
  .team-picker-item small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .team-picker-item strong {
    font-size: 15px;
    font-weight: 800;
  }

  .team-picker-item small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  /* Secondary Stats Section */
  .secondary-section {
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    padding: 24px;
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .section-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .status-badge {
    background: var(--bg-accent-subtle);
    color: var(--success-color);
    padding: 4px 10px;
    border-radius: 100px;
    font-size: 12px;
    font-weight: 700;
  }

  .stats-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-color);
  }

  .stat-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .stat-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .stat-subtitle {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .stat-value-btn {
    background: var(--accent-strong);
    color: var(--bg-page);
    border: none;
    padding: 10px 16px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
  }

</style>
