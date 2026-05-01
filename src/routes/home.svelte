<script>
  import { userStore, notificationsStore, selectedTeam } from "../data/stores";
  import TextAvatar from "../components/TextAvatar.svelte";
  import {
    Bell,
    Calendar,
    Users,
    TrendingUp,
    MessageSquare,
    Calculator,
    StickyNote,
  } from "lucide-svelte";

  let hasUnread = $derived($notificationsStore.some((n) => !n.opened));

  // Estadísticas del mes
  let workDaysThisMonth = $state(0);
  let totalTeams = $state(0);
  let estimatedEarnings = $state(0);
  let messagesSent = $state(0);
  let totalStats = $state(null);

  // Calcular estadísticas
  function calculateStats() {
    try {
      // Días trabajados este mes
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();

      const statsData = localStorage.getItem("userStats");
      if (statsData) {
        const stats = JSON.parse(statsData);
        const thisMonthWorkDays =
          stats.workDays?.filter((day) => {
            const date = new Date(day);
            return (
              date.getMonth() === currentMonth &&
              date.getFullYear() === currentYear
            );
          }).length || 0;
        workDaysThisMonth = thisMonthWorkDays;
      }

      // Mensajes enviados
      const chatStats = localStorage.getItem("chatStats");
      if (chatStats) {
        const stats = JSON.parse(chatStats);
        messagesSent = stats.totalMessages || 0;
      }

      // Ganancias estimadas (simulado)
      estimatedEarnings = workDaysThisMonth * 150 || 0;

      // Cargar datos de localStorage sobre equipos
      const teamsData = localStorage.getItem("userTeams");
      if (teamsData) {
        try {
          totalTeams = JSON.parse(teamsData).length || 0;
        } catch {
          totalTeams = 0;
        }
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
        <TextAvatar fullName={$userStore.name} />
        <div class="greeting-section">
          <p class="greeting-text">{getGreeting()}</p>
          <h1 class="user-name">{$userStore.name}</h1>
        </div>
      </div>
      <div class="header-actions">
        <a href="#/notifications" class="notification-link">
          <Bell size={24} color={hasUnread ? "var(--inactive-color)" : "var(--accent-ink)"} />
          {#if hasUnread}
            <span class="badget"></span>
          {/if}
        </a>
      </div>
    </div>

    <!-- Main Earnings Card -->
    <div class="main-card">
      <div class="main-card-header">
        Ganancias estimadas del mes
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      </div>
      <div class="main-card-value">${estimatedEarnings.toFixed(2)}</div>
    </div>

    <!-- Quick Actions Row -->
    <div class="quick-actions-row">
      <a href="#/teams" class="action-btn">
        <div class="action-icon-box">
          <Users size={28} />
        </div>
        <span class="action-label">Equipos</span>
      </a>
      <a href="#/calculator" class="action-btn">
        <div class="action-icon-box">
          <Calculator size={28} />
        </div>
        <span class="action-label">Calculadora</span>
      </a>
      <a href="#/notes" class="action-btn">
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
  </div>
</div>

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
    padding: 24px 20px;
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
    gap: 8px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .main-card-value {
    font-size: 42px;
    font-weight: 800;
    color: var(--text-primary);
    letter-spacing: -0.03em;
    line-height: 1;
  }

  /* Quick Actions Row */
  .quick-actions-row {
    display: flex;
    justify-content: space-between;
    padding: 0 8px;
    margin-top: 8px;
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
    width: 64px;
    height: 64px;
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
    color: #ffffff;
    border: none;
    padding: 10px 16px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
  }
</style>
