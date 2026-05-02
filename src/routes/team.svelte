<script>
  import {
    ChevronLeft,
    Users,
    Shield,
    UserPlus,
    Trash2,
    MessageSquare,
    CheckSquare,
    Clock,
    BarChart2,
    Settings,
    DollarSign,
    Save,
    Mail,
    Plus,
    Minus,
    Package,
    ClipboardList,
    CalendarDays,
    UserCheck,
    Circle,
    CheckCircle2,
    AlertCircle,
    Loader,
    Edit2,
    X,
  } from "lucide-svelte";
  import {
    selectedTeam,
    userStore,
    updateMemberSettings,
    getUserProfile,
    addMemberByEmail,
    registerWorkday,
    getTeamStats,
    teamTasksStore,
    subscribeToTeamTasks,
    addTeamTask,
    updateTeamTask,
    deleteTeamTask,
  } from "../data/stores.js";
  import { currentPath } from "../router.js";
  import SliceContainer from "../components/SliceContainer.svelte";
  import Toast from "../components/Toast.svelte";
  import Chart from "../components/Chart.svelte";
  import Calendar from "../components/Calendar.svelte";

  let team = $derived($selectedTeam);
  let isAdmin = $derived(team?.admin === $userStore?.uid);

  let showMemberSettings = $state(false);
  let memberList = $state([]);
  let showAddMember = $state(false);
  let selectedMemberId = $state(null);
  let selectedMemberEmail = $state("");
  let newMemberEmail = $state("");
  let dailyRate = $state(0);
  let extraHourRate = $state(0);
  let isSaving = $state(false);
  let isAddingMember = $state(false);
  let messageToast = $state("");
  let typeToast = $state("");
  let showToast = $state(false);
  let showWorkdayForm = $state(false);
  let workDay = $state({
    type: "full-day", // "full-day" | "half-day"
    overtimeHours: 0,
  });
  let showStats = $state(false);
  let statsMode = $state("month");
  let stats = $state(null);
  let dateRangeStart = $state(null);
  let dateRangeEnd = $state(null);

  // Tasks state
  let showTasks = $state(false);
  let showAddTask = $state(false);
  let editingTaskId = $state(null);
  let taskFilter = $state("all");
  let isSavingTask = $state(false);
  let taskForm = $state({
    title: "",
    description: "",
    status: "pending",
    assignedTo: [],
    dueDate: "",
  });

  const statusConfig = {
    unassigned: { label: "Sin Asignar", color: "#9e9e9e", bg: "#f5f5f5" },
    pending: { label: "Pendiente", color: "#ff9800", bg: "#fff3e0" },
    "in-progress": { label: "En Proceso", color: "#2196f3", bg: "#e3f2fd" },
    completed: { label: "Completado", color: "#4caf50", bg: "#e8f5e9" },
  };

  let filteredTasks = $derived(
    taskFilter === "all"
      ? $teamTasksStore
      : $teamTasksStore.filter((t) => t.status === taskFilter),
  );

  $effect(() => {
    if (team?.id) {
      subscribeToTeamTasks(team.id);
    }
    return () => subscribeToTeamTasks(null);
  });

  function openAddTask() {
    editingTaskId = null;
    taskForm = {
      title: "",
      description: "",
      status: "pending",
      assignedTo: [],
      dueDate: "",
    };
    showAddTask = true;
  }

  function openEditTask(task) {
    editingTaskId = task.id;
    taskForm = {
      title: task.title || "",
      description: task.description || "",
      status: task.status || "pending",
      assignedTo: task.assignedTo ? [...task.assignedTo] : [],
      dueDate: task.dueDate ? task.dueDate.split("T")[0] : "",
    };
    showAddTask = true;
  }

  async function handleSaveTask() {
    if (!taskForm.title.trim() || !team?.id) return;
    isSavingTask = true;
    try {
      const data = {
        ...taskForm,
        dueDate: taskForm.dueDate
          ? new Date(taskForm.dueDate).toISOString()
          : null,
      };
      if (editingTaskId) {
        await updateTeamTask(team.id, editingTaskId, data);
      } else {
        await addTeamTask(team.id, data);
      }
      showAddTask = false;
    } catch (e) {
      messageToast = "Error al guardar la tarea";
      typeToast = "error";
      showToast = true;
    } finally {
      isSavingTask = false;
    }
  }

  async function handleDeleteTask(taskId) {
    if (!team?.id) return;
    await deleteTeamTask(team.id, taskId);
  }

  function toggleAssignedMember(memberId) {
    if (taskForm.assignedTo.includes(memberId)) {
      taskForm.assignedTo = taskForm.assignedTo.filter((id) => id !== memberId);
    } else {
      taskForm.assignedTo = [...taskForm.assignedTo, memberId];
    }
  }

  function formatDate(isoString) {
    if (!isoString) return "";
    return new Date(isoString).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function getMemberInitials(memberId) {
    const member = memberList.find((m) => m.id === memberId);
    if (!member) return "?";
    const parts = (member.name || member.email || "?").split(" ");
    return parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0][0];
  }

  $effect(() => {
    if (team.members) {
      const userPromises = team.members.map(async (memberId) =>
        getUserProfile(memberId),
      );
      Promise.all(userPromises).then((users) => {
        memberList = users.filter(Boolean);
      });
    }
  });
  async function openMemberSettings(memberId, email) {
    selectedMemberId = memberId;
    selectedMemberEmail = email;
    const settings = team.memberSettings?.[memberId] || {};
    dailyRate = settings.dailyRate || 0;
    extraHourRate = settings.extraHourRate || 0;
    showMemberSettings = true;
  }

  function showNotification(msg, type = "success") {
    messageToast = msg;
    typeToast = type;
    showToast = true;
    setTimeout(() => {
      showToast = false;
    }, 3000);
  }

  async function handleRegisterWorkday() {
    if (!team?.id || !$userStore?.uid) return;
    try {
      await registerWorkday(team.id, $userStore.uid, $userStore.name || $userStore.email, workDay);
      showWorkdayForm = false;
      showNotification("Jornada registrada correctamente", "success");
    } catch (error) {
      showNotification("Error al registrar jornada", "error");
    }
  }

  async function handleOpenStats() {
    if (!team?.id || !$userStore?.uid) return;
    showStats = true;
    if (statsMode !== "calendar") {
      try {
        const settings = team.memberSettings?.[$userStore.uid] || {};
        const dailyRate = Number(settings.dailyRate) || 0;
        const extraHourRate = Number(settings.extraHourRate) || 0;
        stats = await getTeamStats(team.id, $userStore.uid, statsMode, dailyRate, extraHourRate);
      } catch (error) {
        console.error("Error loading stats:", error);
        messageToast = "Error al cargar estadísticas";
        typeToast = "error";
        showToast = true;
      }
    }
  }

  $effect(() => {
    if (showStats && team?.id && $userStore?.uid && statsMode !== "calendar") {
      const settings = team.memberSettings?.[$userStore.uid] || {};
      const dailyRate = Number(settings.dailyRate) || 0;
      const extraHourRate = Number(settings.extraHourRate) || 0;
      getTeamStats(team.id, $userStore.uid, statsMode, dailyRate, extraHourRate).then((result) => {
        stats = result;
      });
    }
  });

  async function handleAddMember() {
    if (!newMemberEmail || !team?.id) return;
    isAddingMember = true;
    try {
      await addMemberByEmail(team.id, newMemberEmail);
      newMemberEmail = "";
      showAddMember = false;
    } catch (error) {
      messageToast = "Error al añadir miembro";
      typeToast = "error";
      showToast = true;
    } finally {
      isAddingMember = false;
    }
  }

  async function handleSaveSettings() {
    if (!selectedMemberId) return;
    isSaving = true;
    try {
      await updateMemberSettings(
        team.id,
        selectedMemberId,
        dailyRate,
        extraHourRate,
      );
      showMemberSettings = false;
    } catch (error) {
      messageToast = "Error al guardar los ajustes";
      typeToast = "error";
      showToast = true;
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="team-detail">
  <Toast message={messageToast} type={typeToast} show={showToast} />
  <header>
    <button class="back-btn" onclick={() => ($currentPath = "#/teams")}>
      <ChevronLeft size={24} />
    </button>
    <h1>Detalles del Equipo</h1>
  </header>

  {#if team}
    <div class="content">
      <div class="team-header-card">
        <div class="team-icon">
          <Users size={40} />
        </div>
        <h2>{team.name}</h2>
        <div class="center">
          <div class="admin-badge">
            <Shield size={14} />
            <span>{isAdmin ? "Admin" : "Miembro"}</span>
          </div>
        </div>
      </div>

      <section class="menu-section">
        <div class="menu-grid">
          <button
            class="menu-card"
            onclick={() => ($currentPath = `#/teams/${team.id}/chat`)}
          >
            <div class="menu-icon chat">
              <MessageSquare size={24} />
            </div>
            <span>Chat</span>
          </button>
          <button class="menu-card" onclick={() => ($currentPath = `#/teams/${team.id}/tasks`)}>
            <div class="menu-icon tasks">
              <CheckSquare size={24} />
            </div>
            <span>Tareas</span>
          </button>
          <button class="menu-card" onclick={() => (showWorkdayForm = true)}>
            <div class="menu-icon workday">
              <Clock size={24} />
            </div>
            <span>Ingresar jornada</span>
          </button>
          <button class="menu-card" onclick={handleOpenStats}>
            <div class="menu-icon stats">
              <BarChart2 size={24} />
            </div>
            <span>Mis estadísticas</span>
          </button>
          <button
            class="menu-card"
            onclick={() => ($currentPath = `#/teams/${team.id}/inventory`)}
          >
            <div class="menu-icon inventory">
              <Package size={24} />
            </div>
            <span>Inventario</span>
          </button>
          {#if isAdmin}
            <button class="menu-card">
              <div class="menu-icon settings">
                <Settings size={24} />
              </div>
              <span>Ajustes</span>
            </button>
            <button class="menu-card" onclick={() => ($currentPath = `#/teams/${team.id}/payments`)}>
              <div class="menu-icon payments">
                <DollarSign size={24} />
              </div>
              <span>Pagos</span>
            </button>
          {/if}
        </div>
      </section>

      <section class="members-section">
        <div class="section-header">
          <h3>Miembros ({team.members?.length || 0})</h3>
          {#if isAdmin}
            <button
              class="add-member-btn"
              onclick={() => (showAddMember = true)}
            >
              <UserPlus size={18} />
            </button>
          {/if}
        </div>

        <div class="members-list">
          {#each memberList as member}
            <div class="member-item">
              <div class="member-avatar">
                {member.avatar || "👤"}
              </div>
              <div class="member-info">
                <p class="member-id">
                  {member.name}
                </p>
              </div>
              {#if isAdmin}
                <button
                  class="member-settings-btn"
                  onclick={() => openMemberSettings(member.id, member.email)}
                  aria-label="Ajustes de miembro"
                >
                  <Settings size={18} />
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </section>

      {#if isAdmin}
        <button class="delete-team-btn">
          <Trash2 size={20} />
          <span>Eliminar Equipo</span>
        </button>
      {/if}
    </div>

    <SliceContainer bind:show={showAddMember}>
      <div class="member-settings-form">
        <h3>Agregar Miembro</h3>
        <p class="form-instruction">
          Ingresa el correo del usuario que deseas invitar al equipo.
        </p>

        <div class="form-group">
          <label for="newEmail">Correo electrónico</label>
          <div class="input-with-icon">
            <Mail size={18} color="#e3654e" />
            <input
              type="email"
              id="newEmail"
              bind:value={newMemberEmail}
              placeholder="usuario@ejemplo.com"
            />
          </div>
        </div>

        <button
          class="save-settings-btn"
          onclick={handleAddMember}
          disabled={isAddingMember || !newMemberEmail}
        >
          {#if isAddingMember}
            <span>Añadiendo...</span>
          {:else}
            <UserPlus size={20} />
            <span>Añadir al Equipo</span>
          {/if}
        </button>
      </div>
    </SliceContainer>

    <SliceContainer bind:show={showMemberSettings}>
      <div class="member-settings-form">
        <h3>Ajustes de Miembro</h3>
        <div class="member-details-header">
          <div class="detail-row">
            <Mail size={14} />
            <span>{selectedMemberEmail}</span>
          </div>
          <div class="detail-row id-row">
            <span>ID: {selectedMemberId}</span>
          </div>
        </div>

        <div class="form-group">
          <label for="dailyRate">Salario por día</label>
          <div class="input-with-icon">
            <DollarSign size={18} color="#1be885" />
            <input
              type="number"
              id="dailyRate"
              bind:value={dailyRate}
              placeholder="0.00"
            />
          </div>
        </div>

        <div class="form-group">
          <label for="extraHourRate">Tarifa hora extra</label>
          <div class="input-with-icon">
            <DollarSign size={18} color="#1be885" />
            <input
              type="number"
              id="extraHourRate"
              bind:value={extraHourRate}
              placeholder="0.00"
            />
          </div>
        </div>

        <button
          class="save-settings-btn"
          onclick={handleSaveSettings}
          disabled={isSaving}
        >
          {#if isSaving}
            <span>Guardando...</span>
          {:else}
            <Save size={20} />
            <span>Guardar Ajustes</span>
          {/if}
        </button>
      </div>
    </SliceContainer>

    <SliceContainer bind:show={showWorkdayForm}>
      <div class="workday-form">
        <h3>Registrar Jornada</h3>
        <p class="form-instruction">
          Selecciona el tipo de jornada que deseas registrar para hoy.
        </p>

        <div class="workday-options">
          <button
            class="workday-option {workDay.type === 'full-day'
              ? 'work-option-active'
              : ''}"
            onclick={() => (workDay.type = "full-day")}
          >
            <div class="option-icon full-day">
              <Clock size={24} />
            </div>
            <div class="option-text">
              <span class="option-title">Jornada Completa</span>
              <p class="option-desc">Día completo de trabajo</p>
            </div>
          </button>

          <button
            class="workday-option {workDay.type === 'half-day'
              ? 'work-option-active'
              : ''}"
            onclick={() => (workDay.type = "half-day")}
          >
            <div class="option-icon half-day">
              <Clock size={24} />
            </div>
            <div class="option-text">
              <span class="option-title">Media Jornada</span>
              <p class="option-desc">Medio día de trabajo</p>
            </div>
          </button>

          <div class="workday-option overtime">
            <div class="option-icon overtime-icon">
              <Clock size={24} />
            </div>
            <div class="option-text">
              <span class="option-title">Horas Extras</span>
              <div class="overtime-counter">
                <button
                  class="counter-btn"
                  onclick={() =>
                    (workDay.overtimeHours = Math.max(
                      0,
                      workDay.overtimeHours - 1,
                    ))}
                  disabled={workDay.overtimeHours === 0}
                >
                  <Minus size={18} />
                </button>
                <span class="counter-value">{workDay.overtimeHours}h</span>
                <button
                  class="counter-btn"
                  onclick={() =>
                    (workDay.overtimeHours = Math.min(
                      12,
                      workDay.overtimeHours + 1,
                    ))}
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <button class="register-workday-btn" onclick={handleRegisterWorkday}>
          <Save size={20} />
          <span>Registrar Jornada</span>
        </button>
      </div>
    </SliceContainer>

    <SliceContainer bind:show={showStats}>
      <div class="stats-container">
        <h3>Estadísticas</h3>

        <div class="period-selector">
          <button
            class="period-btn {statsMode === 'month' ? 'active' : ''}"
            onclick={() => {
              statsMode = "month";
            }}
          >
            Mes
          </button>
          <button
            class="period-btn {statsMode === 'year' ? 'active' : ''}"
            onclick={() => {
              statsMode = "year";
            }}
          >
            Año
          </button>
          <button
            class="period-btn {statsMode === 'calendar' ? 'active' : ''}"
            onclick={() => {
              statsMode = "calendar";
            }}
          >
            Calendario
          </button>
        </div>

        {#if statsMode === "calendar"}
          <div class="calendar-section">
            <Calendar
              bind:selectedStart={dateRangeStart}
              bind:selectedEnd={dateRangeEnd}
            />
            {#if dateRangeStart && dateRangeEnd}
              <div class="date-range-display">
                <p class="range-text">
                  {dateRangeStart.toLocaleDateString("es-ES")} - {dateRangeEnd.toLocaleDateString(
                    "es-ES",
                  )}
                </p>
              </div>
            {/if}
          </div>
        {/if}

        {#if stats}
          <div class="stats-grid">
            <div class="stat-card earnings">
              <div class="stat-icon">
                <DollarSign size={18} />
              </div>
              <div class="stat-content">
                <span class="stat-label">Ingresos</span>
                <span class="stat-value">${stats.totalEarnings.toFixed(2)}</span
                >
              </div>
            </div>

            <div class="stat-card workdays">
              <div class="stat-icon">
                <Clock size={18} />
              </div>
              <div class="stat-content">
                <span class="stat-label">Jornadas</span>
                <span class="stat-value">{stats.totalWorkDays}</span>
                <span class="stat-detail"
                  >{stats.totalFullDays} completas / {stats.totalHalfDays} medias</span
                >
              </div>
            </div>

            <div class="stat-card overtime">
              <div class="stat-icon">
                <BarChart2 size={18} />
              </div>
              <div class="stat-content">
                <span class="stat-label">Horas Extras</span>
                <span class="stat-value">{stats.totalOvertimeHours}h</span>
              </div>
            </div>
          </div>

          <div class="chart-section">
            <h4>Distribución de Jornadas</h4>
            <Chart
              data={[
                stats.totalFullDays,
                stats.totalHalfDays,
                stats.totalOvertimeHours,
              ]}
              labels={["Completas", "Medias", "H. Extras"]}
              color="#e3654e"
              maxValue={Math.max(
                stats.totalFullDays,
                stats.totalHalfDays,
                stats.totalOvertimeHours,
                5,
              )}
            />
          </div>
        {:else}
          <div class="loading-stats">
            <p>Cargando estadísticas...</p>
          </div>
        {/if}
      </div>
    </SliceContainer>
  {:else}
    <div class="empty-state">
      <p>No se seleccionó ningún equipo.</p>
      <button onclick={() => ($currentPath = "#/teams")}>Volver</button>
    </div>
  {/if}
</div>

<style>
  .team-detail {
    padding: 24px 20px var(--bottom-nav-clearance);
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-page);
  }

  header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }

  .back-btn {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    width: 44px;
    height: 44px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-card);
    cursor: pointer;
    color: var(--text-primary);
    transition: all 0.2s ease;
  }
  
  .back-btn:hover {
    transform: translateY(-2px);
    border-color: var(--accent-color);
  }

  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 8px;
  }

  .team-header-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    padding: 32px 24px;
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: var(--shadow-card);
    margin-bottom: 32px;
  }

  .team-icon {
    width: 72px;
    height: 72px;
    background: var(--bg-accent-subtle);
    color: var(--accent-ink);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
  }

  .team-header-card h2 {
    margin: 0 0 12px;
    font-size: 26px;
    font-weight: 800;
  }

  .center {
    gap: 1rem;
  }
  
  .admin-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-input);
    padding: 6px 14px;
    border-radius: 100px;
    font-size: 13px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .menu-section {
    margin-bottom: 32px;
  }

  .menu-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .menu-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    padding: 24px 16px;
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    box-shadow: var(--shadow-card);
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .menu-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-soft);
    border-color: var(--accent-color);
  }

  .menu-card:active {
    transform: scale(0.96);
  }

  .menu-icon {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .menu-card:hover .menu-icon {
    transform: scale(1.1);
  }

  .menu-card span {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
    text-align: center;
  }

  /* Icon Colors */
  .menu-icon.chat {
    background: var(--bg-info-subtle);
    color: var(--info-color);
  }
  .menu-icon.tasks {
    background: var(--bg-purple-subtle);
    color: var(--purple-color);
  }
  .menu-icon.workday {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }
  .menu-icon.stats {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }
  .menu-icon.inventory {
    background: var(--bg-info-subtle);
    color: var(--info-color);
  }
  .menu-icon.settings {
    background: var(--bg-input);
    color: var(--text-secondary);
  }
  .menu-icon.payments {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }

  .members-section {
    margin-bottom: 32px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .section-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .add-member-btn {
    background: #000;
    color: white;
    border: none;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .add-member-btn:hover {
    background: var(--accent-color);
    color: #ffffff;
    border-color: var(--accent-color);
  }

  .members-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .member-item {
    background: var(--bg-card);
    padding: 12px 16px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: var(--shadow-card);
    transition: transform 0.2s ease;
  }

  .member-avatar {
    width: 40px;
    height: 40px;
    background: var(--bg-accent-subtle);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    color: var(--accent-color);
  }

  .member-info p {
    margin: 0;
    font-size: 15px;
    font-weight: 500;
  }

  .member-settings-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--text-secondary);
    padding: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    transition: all 0.2s;
  }

  .member-settings-btn:hover {
    background: var(--bg-input);
    color: var(--accent-color);
  }

  .member-settings-form {
    padding: 24px;
  }

  .member-settings-form h3 {
    margin: 0 0 12px;
    font-size: 20px;
    font-weight: 700;
  }

  .form-instruction {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 24px;
    line-height: 1.5;
  }

  .member-details-header {
    margin-bottom: 24px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detail-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: var(--text-primary);
    font-weight: 500;
  }

  .detail-row.id-row {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .input-with-icon {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-input);
    padding: 12px 16px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
    transition: border-color 0.2s ease;
  }
  
  .input-with-icon:focus-within {
    border-color: var(--accent-color);
  }

  .input-with-icon input {
    background: transparent;
    border: none;
    outline: none;
    width: 100%;
    font-size: 16px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .save-settings-btn {
    width: 100%;
    padding: 16px;
    background: var(--accent-color);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    margin-top: 12px;
    box-shadow: var(--shadow-button);
    transition: all 0.2s ease;
  }
  
  .save-settings-btn:hover:not(:disabled) {
    background: var(--accent-strong);
    transform: translateY(-2px);
  }

  .save-settings-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .delete-team-btn {
    width: 100%;
    padding: 16px;
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    margin-top: 16px;
    transition: all 0.2s ease;
  }
  
  .delete-team-btn:hover {
    background: var(--danger-color);
    color: #ffffff;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 16px;
    color: var(--text-secondary);
  }

  /* Workday Form Styles */
  .workday-form {
    padding: 24px;
  }

  .workday-form h3 {
    margin: 0 0 12px;
    font-size: 20px;
    font-weight: 700;
  }

  .workday-options {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
  }

  .workday-option {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    padding: 16px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    gap: 16px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .work-option-active {
    border-color: #e3654e;
  }
  .workday-option:not(.overtime):hover {
    border-color: #e3654e;
    background: #fff8f7;
  }

  .workday-option.overtime {
    cursor: default;
  }

  .option-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .option-icon.full-day {
    background: #e8f5e9;
    color: #4caf50;
  }

  .option-icon.half-day {
    background: var(--bg-warning-subtle);
    color: #ff9800;
  }

  .option-icon.overtime-icon {
    background: #f3e5f5;
    color: #9c27b0;
  }

  .option-text {
    flex: 1;
  }

  .option-title {
    display: block;
    font-size: 16px;
    font-weight: 600;
    color: #333;
    margin-bottom: 4px;
  }

  .option-desc {
    margin: 0;
    font-size: 13px;
    color: #878787;
  }

  .overtime-counter {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 8px;
  }

  .counter-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: #f5f5f5;
    color: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
  }

  .counter-btn:hover:not(:disabled) {
    background: #e3654e;
    color: white;
  }

  .counter-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .counter-value {
    font-size: 18px;
    font-weight: 700;
    color: #333;
    min-width: 40px;
    text-align: center;
  }

  .register-workday-btn {
    width: 100%;
    padding: 16px;
    background: #e3654e;
    color: white;
    border: none;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(227, 101, 78, 0.2);
  }

  /* Statistics Styles */
  .stats-container {
    padding: 24px;
    background: linear-gradient(135deg, #fcfaf6 0%, #ffffff 100%);
    border-radius: 8px;
  }

  .stats-container h3 {
    margin: 0 0 24px;
    font-size: 24px;
    font-weight: 800;
    color: #1a1a1a;
    text-align: center;
    background: linear-gradient(135deg, #e3654e 0%, #d85845 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .calendar-section {
    margin-bottom: 24px;
    background: white;
    padding: 16px;
    border-radius: 16px;
    border: 1px solid #e8e8e8;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .date-range-display {
    margin-top: 16px;
    padding: 14px;
    background: linear-gradient(135deg, #fff3f0 0%, #fffbf9 100%);
    border-radius: 12px;
    border: 1px solid #ffe0d5;
    text-align: center;
  }

  .range-text {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #e3654e;
  }

  .period-selector {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    background: linear-gradient(135deg, #f5f5f5 0%, #f0f0f0 100%);
    padding: 8px;
    border-radius: 16px;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
  }

  .period-btn {
    flex: 1;
    padding: 12px;
    background: transparent;
    border: none;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 700;
    color: #999;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
  }

  .period-btn.active {
    background: linear-gradient(135deg, #e3654e 0%, #d85845 100%);
    color: white;
    box-shadow: 0 6px 16px rgba(227, 101, 78, 0.35);
    transform: translateY(-2px);
  }

  .period-btn:hover:not(.active) {
    background: rgba(255, 255, 255, 0.7);
    color: #666;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: 1fr;
      gap: 12px;
    }
  }

  .stat-card {
    background: white;
    border: 1px solid #e8e8e8;
    padding: 20px 16px;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
    text-align: center;
  }

  .stat-card::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #e3654e 0%, #f39c12 100%);
    opacity: 0;
    transition: opacity 0.3s;
  }

  .stat-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
    border-color: #e0e0e0;
  }

  .stat-card:hover::before {
    opacity: 1;
  }

  .stat-icon {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: all 0.3s;
    flex-shrink: 0;
  }

  .stat-card:hover .stat-icon {
    transform: scale(1.15) rotate(-5deg);
  }

  .stat-card.earnings .stat-icon {
    background: linear-gradient(135deg, #81c784 0%, #66bb6a 100%);
    color: white;
    box-shadow: 0 6px 16px rgba(76, 175, 80, 0.35);
  }

  .stat-card.workdays .stat-icon {
    background: linear-gradient(135deg, #ffb74d 0%, #ffa726 100%);
    color: white;
    box-shadow: 0 6px 16px rgba(255, 152, 0, 0.35);
  }

  .stat-card.overtime .stat-icon {
    background: linear-gradient(135deg, #ba68c8 0%, #ab47bc 100%);
    color: white;
    box-shadow: 0 6px 16px rgba(156, 39, 176, 0.35);
  }

  .stat-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .stat-label {
    font-size: 12px;
    color: #999;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 800;
    color: #1a1a1a;
    line-height: 1;
  }

  .stat-detail {
    font-size: 12px;
    color: #bbb;
    font-weight: 500;
  }

  .chart-section {
    background: white;
    border: 1px solid #e8e8e8;
    padding: 20px;
    border-radius: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .chart-section:hover {
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
  }

  .chart-section h4 {
    margin: 0 0 20px;
    font-size: 16px;
    font-weight: 700;
    color: #1a1a1a;
    text-align: center;
  }

  .loading-stats {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: #999;
    font-size: 15px;
    font-weight: 500;
    flex-direction: column;
    gap: 12px;
  }

  .loading-stats::before {
    content: "";
    width: 40px;
    height: 40px;
    border: 3px solid #f0f0f0;
    border-top-color: #e3654e;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ── Tasks Panel ── */
  .tasks-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .tasks-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px 16px;
  }

  .tasks-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tasks-title-group h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: #333;
  }

  .tasks-count {
    background: #f3e5f5;
    color: #9c27b0;
    font-size: 12px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 100px;
  }

  .task-fab {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, #e3654e 0%, #d85845 100%);
    color: white;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(227, 101, 78, 0.4);
    transition:
      transform 0.2s,
      box-shadow 0.2s;
  }

  .task-fab:active {
    transform: scale(0.92);
  }

  /* Filter pills */
  .task-filters {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 0 20px 16px;
    scrollbar-width: none;
  }

  .task-filters::-webkit-scrollbar {
    display: none;
  }

  .filter-pill {
    flex-shrink: 0;
    padding: 7px 14px;
    border-radius: 100px;
    border: none;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    background: #f0f0f0;
    color: #666;
    transition: all 0.2s;
  }

  .filter-pill.active {
    color: white;
    background: #e3654e;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
  }

  /* Task list */
  .task-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .task-card {
    background: var(--bg-card);
    border-radius: 16px;
    padding: 14px 16px;
    border-left: 4px solid #ccc;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
    transition:
      transform 0.15s,
      box-shadow 0.15s;
  }

  .task-card:active {
    transform: scale(0.98);
  }

  .task-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .task-card-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .task-status-badge {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 100px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .task-due {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #878787;
    font-weight: 500;
  }

  .task-actions {
    display: flex;
    gap: 4px;
  }

  .task-action-btn {
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 8px;
    background: #f5f5f5;
    color: #666;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .task-action-btn:hover {
    background: #eee;
    color: #333;
  }
  .task-action-btn.delete:hover {
    background: var(--bg-danger-subtle);
    color: #e53935;
  }

  .task-title {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 700;
    color: #222;
  }

  .task-desc {
    margin: 0 0 10px;
    font-size: 13px;
    color: #878787;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .task-assignees {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
  }

  .assignee-avatars {
    display: flex;
    gap: -4px;
  }

  .assignee-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: linear-gradient(135deg, #e3654e, #d85845);
    color: white;
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid white;
    margin-left: -6px;
    text-transform: uppercase;
  }

  .assignee-avatar:first-child {
    margin-left: 0;
  }

  .assignee-avatar.more {
    background: #f0f0f0;
    color: #666;
    font-size: 9px;
  }

  .tasks-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 60px 20px;
    color: #bbb;
    text-align: center;
  }

  .tasks-empty p {
    margin: 0;
    font-size: 15px;
    font-weight: 500;
  }

  .add-task-empty-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    background: #fff3f0;
    color: #e3654e;
    border: 2px dashed #e3654e;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .add-task-empty-btn:hover {
    background: #ffe8e4;
  }

  /* ── Task Form Panel ── */
  .task-form-panel {
    padding: 20px 24px 40px;
  }

  .task-form-panel h3 {
    margin: 0 0 20px;
    font-size: 20px;
    font-weight: 700;
    color: #333;
  }

  .required {
    color: #e3654e;
  }

  textarea {
    width: 100%;
    padding: 12px 16px;
    border: none;
    border-radius: 12px;
    background: #f5f5f5;
    font-size: 15px;
    font-family: inherit;
    resize: none;
    outline: none;
    box-sizing: border-box;
    color: #333;
  }

  textarea:focus {
    background: #fff;
    box-shadow: 0 0 0 2px rgba(227, 101, 78, 0.2);
  }

  /* Status options */
  .status-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .status-option {
    padding: 8px 14px;
    border-radius: 100px;
    border: 2px solid #eee;
    background: #fafafa;
    color: #666;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .status-option.selected {
    font-weight: 700;
  }

  /* Member checkboxes */
  .member-checkboxes {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .member-checkbox-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 14px;
    border: 2px solid #f0f0f0;
    background: var(--bg-card);
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
    width: 100%;
  }

  .member-checkbox-item.checked {
    border-color: rgba(227, 101, 78, 0.3);
    background: #fff8f7;
  }

  .mc-avatar {
    width: 32px;
    height: 32px;
    background: #eee;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
  }

  .mc-name {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: #333;
    text-align: left;
  }
</style>
