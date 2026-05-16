<script>
  import { onMount } from "svelte";
  import {
    userStore,
    notificationsStore,
    teamsStore,
    getUserProfile,
    getUserTeamWorks,
    hasTeamPermission,
  } from "../data/stores";
  import AvatarCircle from "../components/AvatarCircle.svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import {
    Bell,
    Calendar,
    Users,
    TrendingUp,
    MessageSquare,
    Calculator,
    StickyNote,
    Timer,
    Sparkles,
    MapPinned,
    MapPin,
    Package,
    Search,
    ArrowRight,
    PackageSearch,
    Info,
  } from "lucide-svelte";
  import { collection, getDocs } from "firebase/firestore";
  import { db } from "../data/firebase.js";
  import { navigateTo } from "../router.js";

  let hasUnread = $derived($notificationsStore.some((n) => !n.opened));

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
    }
  }

  $effect(() => {
    calculateStats();
  });

  $effect(() => {
    loadProductCatalog($teamsStore || []);
  });

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
        <a href="/notifications" class="notification-link">
          <Bell size={24} color={hasUnread ? "var(--inactive-color)" : "var(--accent-ink)"} />
          {#if hasUnread}
            <span class="badget"></span>
          {/if}
        </a>
      </div>
    </div>

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
            <a href="/timer" class="action-btn">
        <div class="action-icon-box">
          <Timer size={28} />
        </div>
        <span class="action-label">Timer</span>
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

    <!-- Tutorial Banner -->
    <a href="/tour" class="tutorial-card">
      <div class="tutorial-icon">
        <Sparkles size={32} />
      </div>
      <div class="tutorial-text">
        <h3>Aprende a usar MetricWork</h3>
        <p>Domina el calendario, tareas y equipos en 1 minuto.</p>
      </div>
      <div class="tutorial-arrow">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </div>
    </a>
        <!-- Main Earnings Card -->
    <div class="main-card">
      <div class="main-card-header">
        <span>Ganancias estimadas del mes</span>
        <button
          type="button"
          class="earnings-details-btn"
          title="Ver detalle de ganancias"
          aria-label="Ver detalle de ganancias"
          onclick={() => (showEarningsDetails = true)}
        >
          <Info size={18} />
        </button>
      </div>
      <div class="main-card-value">{formatCurrency(estimatedEarnings)}</div>
    </div>
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
    height: 280px;
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
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: var(--accent-ink);
    background: transparent;
    border: none;
    transition: all 0.2s ease;
  }
  
  .notification-link:active {
    transform: scale(0.95);
  }

  .badget {
    position: absolute;
    top: 2px;
    right: 4px;
    width: 8px;
    height: 8px;
    background-color: var(--danger-color);
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--accent-color);
  }

  /* Main Card Section */
  .main-card {
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    padding: 24px;
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .main-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .main-card-value {
    font-size: 42px;
    font-weight: 800;
    color: var(--text-primary);
    letter-spacing: 0;
    line-height: 1;
  }

  .earnings-details-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }

  .earnings-details-btn:active {
    transform: scale(0.95);
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
    justify-content: space-between;
    padding: 0 8px;
    margin-top: 18px;
  }

  .action-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    color: var(--text-primary);
    transition: transform 0.2s ease;
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

  /* Tutorial Card */
  .tutorial-card {
    background: linear-gradient(135deg, var(--accent-color) 0%, #ffffff 100%);
    border-radius: var(--radius-lg);
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    text-decoration: none;
    box-shadow: var(--shadow-card);
    border: 1px solid var(--border-color);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .tutorial-card:active {
    transform: scale(0.98);
  }

  .tutorial-icon {
    width: 56px;
    height: 56px;
    background: var(--accent-strong);
    color: white;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .tutorial-text {
    flex: 1;
  }

  .tutorial-text h3 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 4px;
    color: var(--accent-ink);
  }

  .tutorial-text p {
    font-size: 13px;
    color: var(--accent-ink);
    opacity: 0.7;
    margin: 0;
    line-height: 1.4;
  }

  .tutorial-arrow {
    color: var(--accent-ink);
    opacity: 0.5;
  }
</style>
