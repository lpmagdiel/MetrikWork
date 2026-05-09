<script>
  import {
    BarChart3,
    CalendarDays,
    ChevronLeft,
    Clock,
    DollarSign,
    FileText,
    TrendingUp,
    WalletCards,
  } from "lucide-svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import Toast from "../components/Toast.svelte";
  import { navigateTo } from "../router.js";
  import { selectedTeam, selectedTeamId, userStore, getTeamWorks } from "../data/stores.js";

  let team = $derived($selectedTeam);
  let works = $state([]);
  let isLoading = $state(false);
  let period = $state("month");
  let startDate = $state(getMonthStart());
  let endDate = $state(getTodayDateString());
  let messageToast = $state("");
  let typeToast = $state("success");
  let showToast = $state(false);

  const periodLabels = {
    month: "Este mes",
    year: "Este año",
    custom: "Personalizado",
  };

  let memberSettings = $derived(team?.memberSettings?.[$userStore?.uid] || {});
  let dailyRate = $derived(Number(memberSettings.dailyRate) || 0);
  let extraHourRate = $derived(Number(memberSettings.extraHourRate) || 0);

  let userWorks = $derived.by(() =>
    works
      .filter((work) => work.userId === $userStore?.uid)
      .sort((a, b) => (b.date || "").localeCompare(a.date || "")),
  );

  let range = $derived.by(() => {
    const today = new Date();
    const year = today.getFullYear();
    if (period === "year") {
      return { start: `${year}-01-01`, end: `${year}-12-31` };
    }
    if (period === "custom") {
      return { start: startDate, end: endDate };
    }
    return { start: getMonthStart(), end: getMonthEnd() };
  });

  let filteredWorks = $derived.by(() =>
    userWorks.filter((work) => {
      if (!work.date) return false;
      return work.date >= range.start && work.date <= range.end;
    }),
  );

  let stats = $derived.by(() => {
    let fullDays = 0;
    let halfDays = 0;
    let overtimeEntries = 0;
    let overtimeHours = 0;
    let notesCount = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    const activeDates = new Set();

    filteredWorks.forEach((work) => {
      if (work.type === "full-day") fullDays += 1;
      if (work.type === "half-day") halfDays += 1;
      if (Number(work.overtimeHours) > 0 || work.type === "overtime") {
        overtimeEntries += 1;
        overtimeHours += Number(work.overtimeHours) || 0;
      }
      if (work.note) notesCount += 1;
      if (work.paid) paidCount += 1;
      else unpaidCount += 1;
      activeDates.add(work.date);
    });

    const totalWorkDays = fullDays + halfDays / 2;
    const estimatedEarnings =
      fullDays * dailyRate + halfDays * (dailyRate / 2) + overtimeHours * extraHourRate;

    return {
      fullDays,
      halfDays,
      overtimeEntries,
      overtimeHours,
      notesCount,
      paidCount,
      unpaidCount,
      activeDates: activeDates.size,
      totalEntries: filteredWorks.length,
      totalWorkDays,
      estimatedEarnings,
      averagePerActiveDay: activeDates.size ? estimatedEarnings / activeDates.size : 0,
    };
  });

  let distribution = $derived.by(() => [
    { label: "Completas", value: stats.fullDays, color: "var(--success-color)" },
    { label: "Medias", value: stats.halfDays, color: "var(--warning-color)" },
    { label: "Extra", value: stats.overtimeHours, color: "var(--info-color)" },
  ]);

  let monthlyTrend = $derived.by(() => {
    const buckets = new Map();
    filteredWorks.forEach((work) => {
      const key = (work.date || "").slice(0, 7);
      if (!key) return;
      const previous = buckets.get(key) || { label: formatMonthKey(key), days: 0, earnings: 0 };
      previous.days += work.type === "half-day" ? 0.5 : work.type === "full-day" ? 1 : 0;
      previous.earnings += getWorkEarnings(work);
      buckets.set(key, previous);
    });
    return Array.from(buckets.values()).slice(-6);
  });

  let maxDistributionValue = $derived(
    Math.max(...distribution.map((item) => item.value), 1),
  );
  let maxTrendValue = $derived(
    Math.max(...monthlyTrend.map((item) => item.earnings), 1),
  );

  $effect(() => {
    if (team?.id && $userStore?.uid) loadWorks();
  });

  async function loadWorks() {
    isLoading = true;
    try {
      works = await getTeamWorks(team.id);
    } catch (error) {
      console.error("Error loading team stats:", error);
      showNotification("Error al cargar estadísticas", "error");
    } finally {
      isLoading = false;
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

  function getTodayDateString() {
    return toDateString(new Date());
  }

  function getMonthStart() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }

  function getMonthEnd() {
    const now = new Date();
    return toDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
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

  function formatMonthKey(key) {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("es-ES", {
      month: "short",
      year: "2-digit",
    });
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(value || 0);
  }

  function getWorkEarnings(work) {
    const base =
      work.type === "full-day" ? dailyRate : work.type === "half-day" ? dailyRate / 2 : 0;
    return base + (Number(work.overtimeHours) || 0) * extraHourRate;
  }

  function workTypeLabel(work) {
    if (work.type === "full-day") return "Jornada completa";
    if (work.type === "half-day") return "Media jornada";
    if (work.type === "overtime") return "Horas extra";
    return "Jornada";
  }
</script>

<div class="stats-page">
  <Toast message={messageToast} type={typeToast} show={showToast} />

  {#if team}
    <header>
      <button
        class="back-btn"
        onclick={() => navigateTo(`/teams/${team?.id || $selectedTeamId}`)}
        aria-label="Volver al equipo"
      >
        <ChevronLeft size={24} />
      </button>
      <div class="header-title">
        <h1>Mis estadísticas</h1>
        <span>{periodLabels[period]}</span>
      </div>
    </header>

    <main class="stats-content">
      <section class="summary-band">
        <div>
          <p>Ingresos estimados</p>
          <strong>{formatMoney(stats.estimatedEarnings)}</strong>
          <span>{formatDate(range.start)} - {formatDate(range.end)}</span>
        </div>
        <div class="summary-icon">
          <TrendingUp size={28} />
        </div>
      </section>

      <section class="filters-panel">
        <div class="period-tabs">
          {#each Object.entries(periodLabels) as [key, label]}
            <button class:active={period === key} onclick={() => (period = key)}>
              {label}
            </button>
          {/each}
        </div>

        {#if period === "custom"}
          <div class="date-filters">
            <label>
              <span>Desde</span>
              <input type="date" bind:value={startDate} />
            </label>
            <label>
              <span>Hasta</span>
              <input type="date" bind:value={endDate} />
            </label>
          </div>
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
            <div class="metric-icon earnings"><DollarSign size={20} /></div>
            <span>Ingresos</span>
            <strong>{formatMoney(stats.estimatedEarnings)}</strong>
            <small>{formatMoney(stats.averagePerActiveDay)} por día activo</small>
          </article>

          <article class="metric-card">
            <div class="metric-icon days"><CalendarDays size={20} /></div>
            <span>Jornadas</span>
            <strong>{stats.totalWorkDays}</strong>
            <small>{stats.fullDays} completas / {stats.halfDays} medias</small>
          </article>

          <article class="metric-card">
            <div class="metric-icon overtime"><Clock size={20} /></div>
            <span>Horas extra</span>
            <strong>{stats.overtimeHours}h</strong>
            <small>{stats.overtimeEntries} registros</small>
          </article>

          <article class="metric-card">
            <div class="metric-icon paid"><WalletCards size={20} /></div>
            <span>Pendiente</span>
            <strong>{stats.unpaidCount}</strong>
            <small>{stats.paidCount} registros pagados</small>
          </article>
        </section>

        <section class="insights-grid">
          <article class="panel">
            <div class="panel-heading">
              <div>
                <p>Distribución</p>
                <h2>Tipo de trabajo</h2>
              </div>
              <BarChart3 size={20} />
            </div>
            <div class="bar-list">
              {#each distribution as item}
                <div class="bar-row">
                  <div class="bar-label">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                  <div class="bar-track">
                    <i
                      style={`width: ${(item.value / maxDistributionValue) * 100}%; background: ${item.color};`}
                    ></i>
                  </div>
                </div>
              {/each}
            </div>
          </article>

          <article class="panel">
            <div class="panel-heading">
              <div>
                <p>Tendencia</p>
                <h2>Ingresos por mes</h2>
              </div>
              <TrendingUp size={20} />
            </div>
            {#if monthlyTrend.length > 0}
              <div class="trend-bars">
                {#each monthlyTrend as item}
                  <div class="trend-item">
                    <span>{formatMoney(item.earnings)}</span>
                    <i style={`height: ${Math.max((item.earnings / maxTrendValue) * 100, 6)}%;`}></i>
                    <small>{item.label}</small>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="empty-inline">Sin datos para graficar.</div>
            {/if}
          </article>
        </section>

        <section class="details-panel">
          <div class="panel-heading">
            <div>
              <p>Actividad</p>
              <h2>Últimos registros</h2>
            </div>
            <FileText size={20} />
          </div>

          <div class="detail-stats">
            <div>
              <strong>{stats.totalEntries}</strong>
              <span>registros</span>
            </div>
            <div>
              <strong>{stats.activeDates}</strong>
              <span>días activos</span>
            </div>
            <div>
              <strong>{stats.notesCount}</strong>
              <span>con nota</span>
            </div>
          </div>

          {#if filteredWorks.length > 0}
            <div class="records-list">
              {#each filteredWorks.slice(0, 8) as work (work.id)}
                <article class="record-item">
                  <div>
                    <h3>{workTypeLabel(work)}</h3>
                    <p>{formatDate(work.date)}</p>
                    {#if work.note}
                      <small>{work.note}</small>
                    {/if}
                  </div>
                  <strong>{formatMoney(getWorkEarnings(work))}</strong>
                </article>
              {/each}
            </div>
          {:else}
            <div class="empty-state">
              <CalendarDays size={32} />
              <p>No hay registros en este periodo.</p>
            </div>
          {/if}
        </section>
      {/if}
    </main>
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

  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 24px 20px 16px;
    flex-shrink: 0;
  }

  .back-btn {
    background: var(--bg-card);
    border: none;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-card);
    cursor: pointer;
    color: var(--text-primary);
    flex-shrink: 0;
  }

  .header-title {
    min-width: 0;
  }

  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
  }

  .header-title span,
  .summary-band p,
  .panel-heading p,
  label span,
  .metric-card span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
  }

  .stats-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px 20px var(--bottom-nav-clearance);
    display: grid;
    gap: 16px;
    align-content: start;
    -webkit-overflow-scrolling: touch;
  }

  .summary-band {
    background: var(--text-primary);
    color: var(--bg-card);
    border-radius: var(--radius-md);
    padding: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .summary-band p,
  .summary-band span {
    color: inherit;
    opacity: 0.72;
  }

  .summary-band strong {
    display: block;
    font-size: 34px;
    line-height: 1;
    margin: 8px 0;
  }

  .summary-icon {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    background: var(--accent-color);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .filters-panel,
  .panel,
  .details-panel,
  .metric-card {
    background: var(--bg-card);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
  }

  .filters-panel {
    padding: 10px;
  }

  .period-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .period-tabs button {
    border: none;
    border-radius: 12px;
    min-height: 42px;
    background: var(--bg-input);
    color: var(--text-secondary);
    font-weight: 800;
    cursor: pointer;
  }

  .period-tabs button.active {
    background: var(--text-primary);
    color: var(--bg-card);
  }

  .date-filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 12px;
  }

  label {
    display: grid;
    gap: 7px;
  }

  input {
    width: 100%;
    border: 1px solid var(--border-color);
    background: var(--bg-input);
    color: var(--text-primary);
    border-radius: 12px;
    padding: 12px;
    font-size: 14px;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .metric-card {
    padding: 14px;
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .metric-card strong {
    font-size: 22px;
    line-height: 1;
  }

  .metric-card small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .metric-icon {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .metric-icon.earnings {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }

  .metric-icon.days {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .metric-icon.overtime {
    background: var(--bg-info-subtle);
    color: var(--info-color);
  }

  .metric-icon.paid {
    background: var(--bg-purple-subtle);
    color: var(--purple-color);
  }

  .insights-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
  }

  .panel,
  .details-panel {
    padding: 16px;
  }

  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    color: var(--text-secondary);
  }

  .panel-heading h2 {
    margin-top: 3px;
    font-size: 18px;
  }

  .bar-list,
  .records-list {
    display: grid;
    gap: 12px;
  }

  .bar-label {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    margin-bottom: 7px;
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
  }

  .trend-item {
    flex: 1;
    height: 100%;
    min-width: 0;
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
  }

  .trend-item i {
    width: 100%;
    max-width: 38px;
    border-radius: 10px 10px 4px 4px;
    background: var(--text-primary);
  }

  .detail-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 14px;
  }

  .detail-stats div {
    background: var(--bg-input);
    border-radius: 12px;
    padding: 12px;
    display: grid;
    gap: 3px;
  }

  .detail-stats strong {
    font-size: 20px;
  }

  .detail-stats span {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .record-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 12px;
  }

  .record-item h3 {
    font-size: 14px;
    margin-bottom: 3px;
  }

  .record-item p,
  .record-item small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .record-item small {
    display: block;
    margin-top: 5px;
  }

  .loading-state,
  .empty-state,
  .empty-inline {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    text-align: center;
  }

  .loading-state,
  .empty-state {
    min-height: 180px;
    flex-direction: column;
    gap: 12px;
  }

  .loading-state.full {
    height: 100%;
  }

  .empty-state {
    border: 1px dashed var(--border-color);
    border-radius: 12px;
  }

  .empty-inline {
    min-height: 190px;
  }

  @media (max-width: 900px) {
    .metrics-grid,
    .insights-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 640px) {
    header,
    .stats-content {
      padding-inline: 16px;
    }

    .summary-band strong {
      font-size: 28px;
    }

    .metrics-grid,
    .insights-grid,
    .date-filters,
    .detail-stats {
      grid-template-columns: 1fr;
    }

    .period-tabs {
      grid-template-columns: 1fr;
    }
  }
</style>
