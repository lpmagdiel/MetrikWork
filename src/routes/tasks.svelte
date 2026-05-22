<script>
  import {
    ChevronLeft,
    Plus,
    ClipboardList,
    CalendarDays,
    UserCheck,
    Circle,
    CheckCircle2,
    Loader,
    Save,
    Edit2,
    X,
    Trash2,
  } from "lucide-svelte";
  import {
    selectedTeam,
    selectedTeamId,
    userStore,
    teamTasksStore,
    subscribeToTeamTasks,
    addTeamTask,
    updateTeamTask,
    deleteTeamTask,
    getUserProfile,
    getProfileImage,
    isProfileImage,
    hasTeamPermission,
  } from "../data/stores.js";
  import { navigateTo } from "../router.js";
  import SliceContainer from "../components/SliceContainer.svelte";
  import Toast from "../components/Toast.svelte";
    import AvatarCircle from "../components/AvatarCircle.svelte";
    import CircleAddButton from "../components/CircleAddButton.svelte";
  import TitleHeader from "../components/TitleHeader.svelte";

  let team = $derived($selectedTeam);
  let canViewTasks = $derived(hasTeamPermission(team, $userStore?.uid, "tasks", "view"));
  let canCreateTasks = $derived(hasTeamPermission(team, $userStore?.uid, "tasks", "create"));
  let canEditTasks = $derived(hasTeamPermission(team, $userStore?.uid, "tasks", "edit"));
  let canDeleteTasks = $derived(hasTeamPermission(team, $userStore?.uid, "tasks", "delete"));

  // Members list for assignee display
  let memberList = $state([]);

  $effect(() => {
    let active = true;
    if (team?.members) {
      Promise.all(team.members.map((id) => getUserProfile(id))).then(
        (users) => {
          if (active) {
            memberList = users.filter(Boolean);
          }
        },
      );
    }
    return () => {
      active = false;
    };
  });

  $effect(() => {
    if (team?.id && canViewTasks) subscribeToTeamTasks(team.id);
    return () => subscribeToTeamTasks(null);
  });

  // UI state
  let taskFilter = $state("pending"); // pending, in-progress, completed, unassigned, all
  let showAddTask = $state(false);
  let editingTaskId = $state(null);
  let isSavingTask = $state(false);
  let messageToast = $state("");
  let typeToast = $state("");
  let showToast = $state(false);

  let taskForm = $state({
    title: "",
    description: "",
    status: "pending",
    assignedTo: [],
    dueDate: "",
  });

  const statusConfig = {
    unassigned: { label: "Sin Asignar", color: "var(--text-secondary)", bg: "var(--bg-input)" },
    pending: { label: "Pendiente", color: "var(--warning-color)", bg: "var(--bg-warning-subtle)" },
    "in-progress": { label: "En Proceso", color: "var(--info-color)", bg: "var(--bg-info-subtle)" },
    completed: { label: "Completado", color: "var(--success-color)", bg: "var(--bg-success-subtle)" },
  };

  let filteredTasks = $derived(
    taskFilter === "all"
      ? $teamTasksStore
      : $teamTasksStore.filter((t) => t.status === taskFilter),
  );

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
    if ((editingTaskId && !canEditTasks) || (!editingTaskId && !canCreateTasks)) return;
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
        await addTeamTask(team.id, data, $userStore, team.name);
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
    if (!team?.id || !canDeleteTasks) return;
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

  function getMemberName(memberId) {
    const member = memberList.find((m) => m.id === memberId);
    return member?.name || member?.email || "?";
  }

  function getMemberInitials(memberId) {
    const name = getMemberName(memberId);
    const parts = name.split(" ");
    return parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0][0];
  }

  function getTeamHomePath() {
    return $selectedTeamId ? `/teams/${$selectedTeamId}` : "/teams";
  }

  function getMemberPhoto(member) {
    return getProfileImage(member);
  }

  function getMemberFallbackAvatar(member) {
    if (member?.avatar && !isProfileImage(member.avatar)) return member.avatar;
    return getMemberInitials(member.id);
  }
</script>

<div class="tasks-page">
  <Toast message={messageToast} type={typeToast} show={showToast} />

  <!-- Header -->
   <TitleHeader title="Tareas" description={team?.name || "" + $teamTasksStore.length} action={() => navigateTo(getTeamHomePath())} icon={ChevronLeft} paddingHorizontal={true}/>
    {#if canCreateTasks}
      <CircleAddButton onClick={openAddTask} floating={true}/>
    {/if}

  {#if !canViewTasks}
    <div class="empty-state">
      <ClipboardList size={56} color="var(--text-muted)" />
      <p>No tienes permiso para ver las tareas de este equipo.</p>
    </div>
  {:else}
    <!-- Filter pills -->
    <div class="filter-scroll">
      {#each Object.entries( {pending: "Pendiente", "in-progress": "En Proceso", completed: "Completado", all: "Todas", unassigned: "Sin Asignar"}, ) as [key, label]}
        <button
          class="filter-pill {taskFilter === key ? 'active' : ''}"
          style={taskFilter === key && key !== "all"
            ? `background:${statusConfig[key]?.color ?? "var(--accent-strong)"};`
            : ""}
          onclick={() => (taskFilter = key)}
        >
          {label}
          {#if key !== "all"}
            <span class="pill-count">
              {$teamTasksStore.filter((t) => t.status === key).length}
            </span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- Task list -->
    <div class="task-list">
    {#if filteredTasks.length === 0}
      <div class="empty-state">
        <ClipboardList size={56} color="var(--text-muted)" />
        <p>
          {taskFilter !== "all"
            ? "No hay tareas en esta categoría"
            : "Aún no hay tareas"}
        </p>
        {#if taskFilter === "all" && canCreateTasks}
          <button class="empty-cta" onclick={openAddTask}>
            <Plus size={16} />
            Crear primera tarea
          </button>
        {/if}
      </div>
    {:else}
      {#each filteredTasks as task (task.id)}
        {@const cfg = statusConfig[task.status] ?? statusConfig.unassigned}
        <div class="task-card" style="border-left-color:{cfg.color}">
          <!-- Top row: status + date + actions -->
          <div class="card-top">
            <div class="card-meta">
              <span
                class="status-badge"
                style="background:{cfg.bg}; color:{cfg.color}"
              >
                {cfg.label}
              </span>
              {#if task.dueDate}
                <span class="due-date">
                  <CalendarDays size={12} />
                  {formatDate(task.dueDate)}
                </span>
              {/if}
            </div>
            <div class="card-actions">
              {#if canEditTasks}
                <button
                  class="action-btn"
                  onclick={() => openEditTask(task)}
                  aria-label="Editar"
                >
                  <Edit2 size={15} />
                </button>
              {/if}
              {#if canDeleteTasks}
                <button
                  class="action-btn danger"
                  onclick={() => handleDeleteTask(task.id)}
                  aria-label="Eliminar"
                >
                  <Trash2 size={15} />
                </button>
              {/if}
            </div>
          </div>

          <!-- Title + description -->
          <h3 class="task-title">{task.title}</h3>
          {#if task.description}
            <p class="task-desc">{task.description}</p>
          {/if}

          <!-- Assigned members -->
          {#if task.assignedTo?.length > 0}
            <div class="assignees-row">
              <UserCheck size={13} color="var(--text-secondary)" />
              <div class="avatar-stack">
                {#each task.assignedTo.slice(0, 5) as uid}
                  <div class="avatar" title={getMemberName(uid)}>
                    {getMemberInitials(uid)}
                  </div>
                {/each}
                {#if task.assignedTo.length > 5}
                  <div class="avatar more">+{task.assignedTo.length - 5}</div>
                {/if}
              </div>
              <span class="assignees-label">
                {task.assignedTo.length === 1
                  ? getMemberName(task.assignedTo[0])
                  : `${task.assignedTo.length} asignados`}
              </span>
            </div>
          {/if}

          <!-- Created date -->
          {#if task.createdAt}
            <p class="created-at">Creada {formatDate(task.createdAt)}</p>
          {/if}
        </div>
      {/each}
    {/if}
    </div>
  {/if}
</div>

<!-- Add/Edit Task SliceContainer -->
<SliceContainer bind:show={showAddTask}>
  <div class="task-form">
    <h3>{editingTaskId ? "Editar Tarea" : "Nueva Tarea"}</h3>

    <div class="form-group">
      <label for="taskTitle">Título <span class="req">*</span></label>
      <div class="input-row">
        <ClipboardList size={18} color="var(--text-primary)" />
        <input
          id="taskTitle"
          type="text"
          bind:value={taskForm.title}
          placeholder="Nombre de la tarea"
        />
      </div>
    </div>

    <div class="form-group">
      <label for="taskDesc">Descripción</label>
      <textarea
        id="taskDesc"
        bind:value={taskForm.description}
        placeholder="Descripción opcional..."
        rows="3"
      ></textarea>
    </div>

    <div class="form-group">
      <label for="taskDue">Fecha límite</label>
      <div class="input-row">
        <CalendarDays size={18} color="var(--text-primary)" />
        <input id="taskDue" type="date" bind:value={taskForm.dueDate} />
      </div>
    </div>

    <div class="form-group">
      <fieldset>
        <legend>Estado</legend>
        <div class="status-grid">
          {#each Object.entries(statusConfig) as [key, cfg]}
            <button
              class="status-opt {taskForm.status === key ? 'sel' : ''}"
              style={taskForm.status === key
                ? `background:${cfg.bg}; border-color:${cfg.color}; color:${cfg.color}`
                : ""}
              onclick={() => (taskForm.status = key)}
            >
              {cfg.label}
            </button>
          {/each}
        </div>
      </fieldset>
    </div>

    {#if memberList.length > 0}
      <div class="form-group">
        <fieldset>
        <legend>Asignar a</legend>
        <div class="member-list">
          {#each memberList as member}
            <button
              class="member-item {taskForm.assignedTo.includes(member.id)
                ? 'checked'
                : ''}"
              onclick={() => toggleAssignedMember(member.id)}
            >
            {#if getMemberPhoto(member)}
            <img src={getMemberPhoto(member)} alt={member.name} class="m-avatar" width="32"/>
            {:else}
            <div class="m-avatar">{getMemberFallbackAvatar(member)}</div>
            {/if}
              <span class="m-name">{member.name || member.email}</span>
              {#if taskForm.assignedTo.includes(member.id)}
                <CheckCircle2 size={18} color="var(--accent-strong)" />
              {:else}
                <Circle size={18} color="var(--text-muted)" />
              {/if}
            </button>
          {/each}
        </div>
        </fieldset>
      </div>
    {/if}

    <button
      class="save-btn"
      onclick={handleSaveTask}
      disabled={isSavingTask || !taskForm.title.trim()}
    >
      {#if isSavingTask}
        <Loader size={20} />
        <span>Guardando...</span>
      {:else}
        <Save size={20} />
        <span>{editingTaskId ? "Actualizar Tarea" : "Crear Tarea"}</span>
      {/if}
    </button>
  </div>
</SliceContainer>

<style>
  .tasks-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-page);
    overflow: hidden;
    padding-top: var(--page-top-safe);
  }



  /* Filter pills */
  .filter-scroll {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 0 20px 16px;
    scrollbar-width: none;
    flex-shrink: 0;
  }

  .filter-scroll::-webkit-scrollbar {
    display: none;
  }

  .filter-pill {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 8px 14px;
    border-radius: 100px;
    border: none;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    background: var(--bg-input);
    color: var(--text-secondary);
    transition: all 0.2s;
  }

  .filter-pill.active {
    color: var(--bg-card);
    background: var(--accent-strong);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
  }

  .pill-count {
    background: var(--bg-accent-subtle);
    color: var(--text-primary);
    border-radius: 100px;
    padding: 0 5px;
    font-size: 11px;
    min-width: 16px;
    text-align: center;
  }

  .filter-pill:not(.active) .pill-count {
    background: var(--bg-input);
    color: var(--text-secondary);
  }

  /* Task list */
  .task-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 20px var(--bottom-nav-clearance);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Task card */
  .task-card {
    background: var(--bg-card);
    border-radius: 18px;
    padding: 16px 16px 14px;
    border-left: 5px solid var(--border-color);
    box-shadow: var(--shadow-card);
    transition:
      transform 0.15s,
      box-shadow 0.15s;
  }

  .task-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.09);
  }

  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .status-badge {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 100px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .due-date {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .card-actions {
    display: flex;
    gap: 4px;
  }

  .action-btn {
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 8px;
    background: var(--bg-input);
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn:hover {
    background: var(--bg-input);
    color: var(--text-primary);
  }
  .action-btn.danger:hover {
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
  }

  .task-title {
    margin: 0 0 6px;
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.3;
  }

  .task-desc {
    margin: 0 0 10px;
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Assignees */
  .assignees-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }

  .avatar-stack {
    display: flex;
  }

  .avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--accent-color);
    color: var(--accent-ink);
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--bg-card);
    margin-left: -5px;
    text-transform: uppercase;
  }

  .avatar:first-child {
    margin-left: 0;
  }

  .avatar.more {
    background: var(--bg-input);
    color: var(--text-secondary);
    font-size: 9px;
  }

  .assignees-label {
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .created-at {
    margin: 8px 0 0;
    font-size: 11px;
    color: var(--text-muted);
    font-weight: 500;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 80px 20px;
    text-align: center;
    color: var(--text-muted);
  }

  .empty-state p {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .empty-cta {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    background: var(--bg-accent-subtle);
    color: var(--text-primary);
    border: 2px dashed var(--accent-color);
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .empty-cta:hover {
    background: var(--bg-accent-subtle);
  }

  /* ── SliceContainer Form ── */
  .task-form {
    padding: 20px 24px 40px;
  }

  .task-form h3 {
    margin: 0 0 20px;
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .form-group {
    margin-bottom: 18px;
  }

  .form-group label {
    display: block;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-secondary);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .req {
    color: var(--danger-color);
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-input);
    padding: 12px 16px;
    border-radius: var(--radius-sm);
    transition: background 0.2s;
  }

  .input-row:focus-within {
    background: var(--bg-card);
    box-shadow: 0 0 0 2px var(--accent-color);
  }

  .input-row input {
    background: transparent;
    border: none;
    outline: none;
    width: 100%;
    font-size: 15px;
    font-weight: 500;
    color: var(--text-primary);
  }

  textarea {
    width: 100%;
    padding: 12px 16px;
    border: none;
    border-radius: 12px;
    background: var(--bg-input);
    font-size: 15px;
    font-family: inherit;
    resize: none;
    outline: none;
    box-sizing: border-box;
    color: var(--text-primary);
    transition:
      background 0.2s,
      box-shadow 0.2s;
  }

  textarea:focus {
    background: var(--bg-card);
    box-shadow: 0 0 0 2px var(--accent-color);
  }

  .status-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .status-opt {
    padding: 8px 14px;
    border-radius: 100px;
    border: 2px solid var(--border-color);
    background: var(--bg-input);
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .status-opt.sel {
    font-weight: 700;
  }

  fieldset {
    border-radius: 12px;
    border-color: var(--border-color);
    padding: 12px 16px;
  }

  legend {
    color: var(--text-secondary);
    padding: 0 6px;
    margin-left: -6px;
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Member checkboxes */
  .member-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .member-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 14px;
    border: 2px solid var(--border-color);
    background: var(--bg-card);
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
    width: 100%;
  }

  .member-item.checked {
    border-color: var(--accent-color);
    background: var(--bg-accent-subtle);
  }

  .m-avatar {
    width: 32px;
    height: 32px;
    background: var(--bg-input);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    flex-shrink: 0;
    object-fit: cover;
  }

  .m-name {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    text-align: left;
  }

  .save-btn {
    width: 100%;
    padding: 16px;
    background: var(--accent-strong);
    color: var(--bg-card);
    border: none;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    margin-top: 8px;
    box-shadow: var(--shadow-button);
    transition:
      transform 0.15s,
      box-shadow 0.15s;
  }

  .save-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: var(--shadow-button);
  }

  .save-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
