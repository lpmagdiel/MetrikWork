<script>
  import {
    BarChart3,
    CalendarDays,
    ChevronRight,
    Clock,
    DollarSign,
    FileText,
    TrendingUp,
    WalletCards,
  } from "lucide-svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import Toast from "../components/Toast.svelte";
  import TitleHeader from "../components/TitleHeader.svelte";
  import { getUserTeamPayments } from "../data/teamPayments.js";
  import { navigateTo } from "../router.js";
  import { getUserTeamWorks, selectedTeam, selectedTeamId, userStore } from "../data/stores.js";

  let team = $derived($selectedTeam);
  let works = $state([]);
  let payments = $state([]);
  let isLoading = $state(false);
  let period = $state("month");
  let startDate = $state(getMonthStart());
  let endDate = $state(getTodayDateString());
  let messageToast = $state("");
  let typeToast = $state("success");
  let showToast = $state(false);
  let loadRequestId = 0;

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
      .sort((a, b) => getWorkDateKey(b).localeCompare(getWorkDateKey(a))),
  );

  let range = $derived.by(() => {
    const today = new Date();
    const year = today.getFullYear();
    if (period === "year") return { start: `${year}-01-01`, end: `${year}-12-31` };
    if (period === "custom") return { start: startDate, end: endDate };
    return { start: getMonthStart(), end: getMonthEnd() };
  });

  let filteredWorks = $derived.by(() =>
    userWorks.filter((work) => dateInRange(getWorkDateKey(work), range)),
  );

  let filteredPayments = $derived.by(() =>
    payments.filter((payment) => dateInRange(payment.date || payment.createdAt, range)),
  );

  let stats = $derived.by(() => {
    let fullDays = 0;
    let halfDays = 0;
    let variableEntries = 0;
    let variableHours = 0;
    let overtimeEntries = 0;
    let overtimeHours = 0;
    let notesCount = 0;
    const activeDates = new Set();

    filteredWorks.forEach((work) => {
      if (work.type === "full-day") fullDays += 1;
      if (work.type === "half-day") halfDays += 1;
      if (work.type === "variable" && !isOvertimeTimer(work)) {
        variableEntries += 1;
        variableHours += getVariableHours(work);
      }
      if (Number(work.overtimeHours) > 0 || work.type === "overtime") {
        overtimeEntries += 1;
        overtimeHours += Number(work.overtimeHours) || 0;
      }
      if (work.note) notesCount += 1;
      const dateKey = getWorkDateKey(work);
      if (dateKey) activeDates.add(dateKey);
    });

    const totalWorkDays = fullDays + halfDays / 2 + variableHours / 8;
    const estimatedEarnings = filteredWorks.reduce(
      (sum, work) => sum + getWorkEarnings(work),
      0,
    );
    const totalPaid = filteredPayments.reduce(
      (sum, payment) => sum + (Number(payment.amount) || 0),
      0,
    );
    const pendingAmount = Math.max(estimatedEarnings - totalPaid, 0);

    return {
      fullDays,
      halfDays,
      variableEntries,
      variableHours,
      overtimeEntries,
      overtimeHours,
      notesCount,
      activeDates: activeDates.size,
      totalEntries: filteredWorks.length,
      totalWorkDays,
      estimatedEarnings,
      totalPaid,
      pendingAmount,
      paymentCount: filteredPayments.length,
      averagePerActiveDay: activeDates.size ? estimatedEarnings / activeDates.size : 0,
    };
  });

  let distribution = $derived.by(() => [
    { label: "Completas", value: stats.fullDays, color: "var(--success-color)" },
    { label: "Medias", value: stats.halfDays, color: "var(--warning-color)" },
    { label: "Parciales", value: stats.variableEntries, color: "var(--purple-color)" },
    { label: "Extra", value: stats.overtimeEntries, color: "var(--info-color)" },
  ]);

  let monthlyTrend = $derived.by(() => {
    const buckets = new Map();
    filteredWorks.forEach((work) => {
      const key = getWorkDateKey(work).slice(0, 7);
      if (!key) return;
      const previous = buckets.get(key) || { key, label: formatMonthKey(key), earnings: 0 };
      previous.earnings += getWorkEarnings(work);
      buckets.set(key, previous);
    });
    return Array.from(buckets.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-6);
  });

  let maxDistributionValue = $derived(Math.max(...distribution.map((item) => item.value), 1));
  let maxTrendValue = $derived(Math.max(...monthlyTrend.map((item) => item.earnings), 1));

  $effect(() => {
    if (team?.id && $userStore?.uid) {
      loadWorks(team.id, $userStore.uid);
    } else {
      works = [];
      payments = [];
    }
  });

  async function loadWorks(teamId, userId) {
    const requestId = ++loadRequestId;
    isLoading = true;
    try {
      const [worksResult, paymentsResult] = await Promise.allSettled([
        getUserTeamWorks(teamId, userId),
        getUserTeamPayments(teamId, userId),
      ]);
      if (requestId !== loadRequestId) return;
      if (worksResult.status === "rejected") throw worksResult.reason;

      works = worksResult.value;
      payments = paymentsResult.status === "fulfilled" ? paymentsResult.value : [];
      if (paymentsResult.status === "rejected") {
        console.error("Error loading user payments:", paymentsResult.reason);
        showNotification("No se pudieron cargar los pagos; las jornadas sí están disponibles.", "error");
      }
    } catch (error) {
      if (requestId !== loadRequestId) return;
      console.error("Error loading user stats:", error);
      showNotification("Error al cargar estadísticas", "error");
    } finally {
      if (requestId === loadRequestId) isLoading = false;
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
    const dateKey = getDateKey(dateString);
    if (!dateKey) return "";
    const [year, month, day] = dateKey.split("-").map(Number);
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
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: team?.projectBudgetCurrency || "MXN",
    }).format(Number(value) || 0);
  }

  function getWorkEarnings(work) {
    const base = getWorkUnits(work) * dailyRate;
    return base + (Number(work.overtimeHours) || 0) * extraHourRate;
  }

  function getWorkUnits(work) {
    if (work.type === "full-day") return 1;
    if (work.type === "half-day") return 0.5;
    if (work.type === "variable" && !isOvertimeTimer(work)) {
      return getVariableHours(work) / 8;
    }
    return 0;
  }

  function getVariableHours(work) {
    return Math.max(0, Number(work?.variableHours ?? work?.durationHours) || 0);
  }

  function isOvertimeTimer(work) {
    return work?.timerMode === "overtime";
  }

  function getDateKey(value) {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }

    const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return toDateString(date);
  }

  function getWorkDateKey(work) {
    return (
      getDateKey(work?.date) ||
      getDateKey(work?.startedAt) ||
      getDateKey(work?.createdAt)
    );
  }

  function dateInRange(value, currentRange) {
    const date = getDateKey(value);
    return Boolean(date && date >= currentRange.start && date <= currentRange.end);
  }

  function formatNumber(value, digits = 1) {
    return new Intl.NumberFormat("es-ES", {
      maximumFractionDigits: digits,
    }).format(Number(value) || 0);
  }

  function workTypeLabel(work) {
    if (work.type === "full-day") return "Jornada completa";
    if (work.type === "half-day") return "Media jornada";
    if (work.type === "variable") {
      return isOvertimeTimer(work) ? "Horas extra" : "Jornada parcial";
    }
    if (work.type === "overtime") return "Horas extra";
    return "Jornada";
  }

  function paymentTypeLabel(payment) {
    return payment.type === "total" ? "Pago total recibido" : "Pago parcial recibido";
  }

  function goToTeamHome() {
    const teamId = team?.id || $selectedTeamId;
    navigateTo(teamId ? `/teams/${teamId}` : "/teams");
  }

  function goToPlanning() {
    const teamId = team?.id || $selectedTeamId;
    navigateTo(teamId ? `/teams/${teamId}/planning` : "/teams");
  }
</script>

<div class="stats-page">
  <Toast message={messageToast} type={typeToast} show={showToast} />

  {#if team}
    <TitleHeader
      title="Mis estadísticas"
      description={team?.name || periodLabels[period]}
      action={goToTeamHome}
      paddingHorizontal={true}
    />

    <main class="stats-content">
      <section class="summary-band">
        <div>
          <p>Pendiente por cobrar</p>
          <strong>{formatMoney(stats.pendingAmount)}</strong>
          <span>{formatDate(range.start)} - {formatDate(range.end)}</span>
        </div>
        <div class="summary-icon">
          <TrendingUp size={28} />
        </div>
      </section>

      <button type="button" class="planning-access" onclick={goToPlanning}>
        <span class="planning-access-icon"><CalendarDays size={20} /></span>
        <span class="planning-access-copy">
          <small>Calendario del equipo</small>
          <strong>Abrir Planning</strong>
        </span>
        <ChevronRight size={20} aria-hidden="true" />
      </button>

      <section class="filters-panel">
        <div class="period-tabs">
          {#each Object.entries(periodLabels) as [key, label]}
            <button type="button" class:active={period === key} onclick={() => (period = key)}>
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
            <span>Generado</span>
            <strong>{formatMoney(stats.estimatedEarnings)}</strong>
            <small>{formatMoney(stats.averagePerActiveDay)} por día activo</small>
          </article>

          <article class="metric-card">
            <div class="metric-icon days"><CalendarDays size={20} /></div>
            <span>Jornadas</span>
            <strong>{formatNumber(stats.totalWorkDays)}</strong>
            <small>
              {stats.fullDays} completas / {stats.halfDays} medias
              {#if stats.variableHours > 0}
                / {formatNumber(stats.variableHours)}h parciales
              {/if}
            </small>
          </article>

          <article class="metric-card">
            <div class="metric-icon overtime"><Clock size={20} /></div>
            <span>Horas extra</span>
            <strong>{formatNumber(stats.overtimeHours)}h</strong>
            <small>{stats.overtimeEntries} registros</small>
          </article>

          <article class="metric-card">
            <div class="metric-icon paid"><WalletCards size={20} /></div>
            <span>Pagado</span>
            <strong>{formatMoney(stats.totalPaid)}</strong>
            <small>{stats.paymentCount} pagos registrados</small>
          </article>

          <article class="metric-card">
            <div class="metric-icon pending"><WalletCards size={20} /></div>
            <span>Pendiente</span>
            <strong>{formatMoney(stats.pendingAmount)}</strong>
            <small>después de pagos registrados</small>
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
                    <i style={`width: ${(item.value / maxDistributionValue) * 100}%; background: ${item.color};`}></i>
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
              <strong>{stats.paymentCount}</strong>
              <span>pagos</span>
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

          {#if filteredPayments.length > 0}
            <div class="records-list payments-list">
              {#each filteredPayments.slice(0, 5) as payment (payment.id)}
                <article class="record-item payment-record">
                  <div>
                    <h3>{paymentTypeLabel(payment)}</h3>
                    <p>{formatDate(payment.date || payment.createdAt)}</p>
                    {#if payment.registeredByName}
                      <small>Registrado por {payment.registeredByName}</small>
                    {/if}
                  </div>
                  <strong>{formatMoney(payment.amount)}</strong>
                </article>
              {/each}
            </div>
          {/if}

          {#if filteredWorks.length > 0}
            <div class="records-list">
              {#each filteredWorks.slice(0, 8) as work (work.id)}
                <article class="record-item">
                  <div>
                    <h3>{workTypeLabel(work)}</h3>
                    <p>{formatDate(getWorkDateKey(work))}</p>
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

  .planning-access {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
    color: var(--text-primary);
    padding: 14px 16px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    text-align: left;
  }

  .planning-access:hover {
    border-color: var(--info-color);
  }

  .planning-access:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--info-color) 35%, transparent);
    outline-offset: 2px;
  }

  .planning-access-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-info-subtle);
    color: var(--info-color);
  }

  .planning-access-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .planning-access-copy small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .filters-panel,
  .panel,
  .details-panel,
  .metric-card {
    min-width: 0;
    background: var(--bg-card);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
  }

  .filters-panel,
  .panel,
  .details-panel {
    padding: 16px;
  }

  .period-tabs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
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
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
    margin-top: 12px;
  }

  label {
    display: grid;
    gap: 7px;
  }

  label span,
  .metric-card span,
  .panel-heading p {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
  }

  input {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border-color);
    background: var(--bg-input);
    color: var(--text-primary);
    border-radius: 12px;
    padding: 12px;
    font-size: 14px;
  }

  .metrics-grid,
  .insights-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }

  .metric-card {
    padding: 14px;
    display: grid;
    gap: 8px;
  }

  .metric-card strong {
    font-size: 22px;
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

  .metric-icon.pending {
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
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
    gap: 10px;
    font-size: 13px;
    margin-bottom: 7px;
  }

  .bar-label span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .detail-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
    margin-bottom: 14px;
  }

  .detail-stats div {
    background: var(--bg-input);
    border-radius: 12px;
    padding: 12px;
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .detail-stats strong {
    font-size: 20px;
  }

  .detail-stats span,
  .record-item p,
  .record-item small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .record-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: flex-start;
    gap: 12px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 12px;
  }

  .payments-list {
    margin-bottom: 12px;
  }

  .payment-record {
    border-color: color-mix(in srgb, var(--success-color) 28%, var(--border-color));
    background: var(--bg-success-subtle);
  }

  .record-item h3 {
    font-size: 14px;
    margin-bottom: 3px;
  }

  .record-item small {
    display: block;
    margin-top: 5px;
  }

  .record-item strong {
    max-width: 130px;
    overflow-wrap: anywhere;
    text-align: right;
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

  .empty-state,
  .empty-inline {
    border: 1px dashed var(--border-color);
    border-radius: 12px;
  }

  .empty-inline {
    min-height: 190px;
  }

  @media (max-width: 520px) {
    .stats-content {
      padding-inline: 14px;
    }

    .summary-band {
      align-items: flex-start;
    }

    .period-tabs,
    .metrics-grid,
    .insights-grid,
    .date-filters {
      grid-template-columns: 1fr;
    }

    .record-item {
      grid-template-columns: 1fr;
    }

    .record-item strong {
      max-width: none;
      text-align: left;
    }
  }
</style>
