<script>
  import {
    ChevronLeft,
    Users,
    Shield,
    UserPlus,
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
    User,
    Calendar1,
    MapPinned,
  } from "lucide-svelte";
  import {
    selectedTeam,
    userStore,
    updateMemberSettings,
    getUserProfile,
    addMemberByEmail,
    registerWorkday,
    hasWorkdayForDate,
    teamTasksStore,
    subscribeToTeamTasks,
    addTeamTask,
    updateTeamTask,
    deleteTeamTask,
    updateMemberPermissions,
    createDefaultMemberPermissions,
    normalizeTeamPermissions,
    hasTeamPermission,
    TEAM_PERMISSION_LABELS,
    TEAM_PERMISSION_ACTION_LABELS,
    applyWorkdayOvertimeLimit,
    exceedsOvertimeLimit,
    getOvertimeLimitHours,
    getOvertimeLimitMessage,
    getTodayDateString,
    isNonWorkingDay,
    getNonWorkingDayMessage,
    getProfileImage,
    isProfileImage,
    userPresenceStore,
    subscribeToUsersPresence,
    isUserPresenceActive,
  } from "../data/stores.js";
  import { navigateTo } from "../router.js";
  import SliceContainer from "../components/SliceContainer.svelte";
  import Toast from "../components/Toast.svelte";
  import AvatarCircle from "../components/AvatarCircle.svelte";
  import { showErrorAlert, showSuccessAlert } from "../data/alerts.js";
  import TitleHeader from "../components/TitleHeader.svelte";

  let team = $derived($selectedTeam);
  let isAdmin = $derived(team?.admin === $userStore?.uid);
  let canViewTasks = $derived(hasTeamPermission(team, $userStore?.uid, "tasks", "view"));
  let canViewInventory = $derived(hasTeamPermission(team, $userStore?.uid, "inventory", "view"));
  let canViewPayments = $derived(hasTeamPermission(team, $userStore?.uid, "payments", "view"));
  let canViewStats = $derived(hasTeamPermission(team, $userStore?.uid, "stats", "view"));
  let canViewSettings = $derived(hasTeamPermission(team, $userStore?.uid, "settings", "view"));
  let canCreateSettings = $derived(hasTeamPermission(team, $userStore?.uid, "settings", "create"));
  let canEditSettings = $derived(hasTeamPermission(team, $userStore?.uid, "settings", "edit"));
  let canViewLocations = $derived(
    hasTeamPermission(team, $userStore?.uid, "locations", "view") ||
      canViewInventory ||
      canViewStats ||
      canViewSettings,
  );
  let overtimeLimitHours = $derived(getOvertimeLimitHours(team));
  let todayDate = $derived(getTodayDateString());
  let isTodayNonWorkingDay = $derived(isNonWorkingDay(team, todayDate));
  let todayNonWorkingMessage = $derived(getNonWorkingDayMessage(team, todayDate));
  const permissionModules = Object.entries(TEAM_PERMISSION_LABELS);
  const permissionActions = Object.entries(TEAM_PERMISSION_ACTION_LABELS);

  let showMemberSettings = $state(false);
  let memberList = $state([]);
  let showAddMember = $state(false);
  let selectedMemberId = $state(null);
  let selectedMemberEmail = $state("");
  let newMemberEmail = $state("");
  let newMemberPermissions = $state(createDefaultMemberPermissions());
  let memberPermissions = $state(createDefaultMemberPermissions());
  let dailyRate = $state(0);
  let extraHourRate = $state(0);
  let isSaving = $state(false);
  let isAddingMember = $state(false);
  let messageToast = $state("");
  let typeToast = $state("");
  let showToast = $state(false);
  let showWorkdayForm = $state(false);
  let presenceNow = $state(Date.now());
  let hasWorkdayToday = $state(false);
  let isCheckingWorkday = $state(false);
  let workDay = $state({
    type: "full-day", // "full-day" | "half-day" | "overtime"
    overtimeHours: 0,
  });
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
    if (team?.id && canViewTasks) {
      return subscribeToTeamTasks(team.id);
    }
    return subscribeToTeamTasks(null);
  });

  $effect(() => {
    const interval = setInterval(() => {
      presenceNow = Date.now();
    }, 30000);

    return () => clearInterval(interval);
  });

  $effect(() => {
    return subscribeToUsersPresence(team?.members || []);
  });

  $effect(() => {
    if (isTodayNonWorkingDay && workDay.overtimeHours !== 0) {
      workDay.overtimeHours = 0;
    }
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

  function getMemberPhoto(member) {
    return getProfileImage(member);
  }

  function getMemberFallbackAvatar(member) {
    if (member?.avatar && !isProfileImage(member.avatar)) return member.avatar;
    return "";
  }

  function isMemberActive(memberId) {
    return isUserPresenceActive($userPresenceStore[memberId], presenceNow);
  }

  function getMemberPresenceLabel(memberId) {
    return isMemberActive(memberId) ? "Activo" : "Inactivo";
  }

  $effect(() => {
    let active = true;
    if (team?.members) {
      const userPromises = team.members.map(async (memberId) =>
        getUserProfile(memberId),
      );
      Promise.all(userPromises).then((users) => {
        if (active) {
          memberList = users.filter(Boolean);
        }
      });
    }
    return () => {
      active = false;
    };
  });
  async function openMemberSettings(memberId, email) {
    selectedMemberId = memberId;
    selectedMemberEmail = email;
    const settings = team.memberSettings?.[memberId] || {};
    dailyRate = settings.dailyRate || 0;
    extraHourRate = settings.extraHourRate || 0;
    memberPermissions = normalizeTeamPermissions(team.memberPermissions?.[memberId]);
    showMemberSettings = true;
  }

  function resetNewMemberForm() {
    newMemberEmail = "";
    newMemberPermissions = createDefaultMemberPermissions();
  }

  function togglePermission(target, module, action) {
    target[module][action] = !target[module][action];
  }

  function showNotification(msg, type = "success") {
    messageToast = msg;
    typeToast = type;
    showToast = true;
    setTimeout(() => {
      showToast = false;
    }, 3000);
  }

  async function checkTodayWorkday() {
    if (!team?.id || !$userStore?.uid) {
      hasWorkdayToday = false;
      return false;
    }

    isCheckingWorkday = true;
    try {
      hasWorkdayToday = await hasWorkdayForDate(team.id, $userStore.uid);
      if (hasWorkdayToday) {
        workDay.type = "overtime";
      } else if (workDay.type === "overtime") {
        workDay.type = "full-day";
      }
      return hasWorkdayToday;
    } catch (error) {
      console.error("Error checking today's workday:", error);
      showNotification("No se pudo comprobar la jornada de hoy", "error");
      return false;
    } finally {
      isCheckingWorkday = false;
    }
  }

  async function openWorkdayForm() {
    workDay = {
      type: "full-day",
      overtimeHours: 0,
    };
    showWorkdayForm = true;
    await checkTodayWorkday();
  }

  async function handleRegisterWorkday() {
    if (!team?.id || !$userStore?.uid) return;
    try {
      if (isTodayNonWorkingDay) {
        await showErrorAlert("Día no laborable", todayNonWorkingMessage);
        return;
      }

      const alreadyHasWorkday = await checkTodayWorkday();
      const workDayToRegister = {
        ...workDay,
        type: alreadyHasWorkday ? "overtime" : workDay.type,
      };

      if (exceedsOvertimeLimit(workDayToRegister.overtimeHours, team)) {
        await showErrorAlert("Límite de horas extra", getOvertimeLimitMessage(team));
        return;
      }

      if (alreadyHasWorkday && workDayToRegister.overtimeHours <= 0) {
        await showErrorAlert(
          "Jornada ya registrada",
          "Hoy ya ingresaste una jornada. Añade horas extra para registrar otra entrada.",
        );
        return;
      }

      const limitedWorkDay = applyWorkdayOvertimeLimit(workDayToRegister, team);
      await registerWorkday(
        team.id,
        $userStore.uid,
        $userStore.name || $userStore.email,
        limitedWorkDay,
      );
      showWorkdayForm = false;
      hasWorkdayToday = true;
      await showSuccessAlert(
        limitedWorkDay.type === "overtime"
          ? "Horas extra registradas"
          : "Jornada registrada",
        limitedWorkDay.type === "overtime"
          ? "Las horas extra se guardaron correctamente."
          : "La jornada se guardó correctamente.",
      );
    } catch (error) {
      await showErrorAlert(
        "Error al registrar jornada",
        error?.message || "No se pudo guardar la jornada.",
      );
    }
  }

  async function handleAddMember() {
    if (!newMemberEmail || !team?.id) return;
    isAddingMember = true;
    try {
      await addMemberByEmail(team.id, newMemberEmail, newMemberPermissions);
      resetNewMemberForm();
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
      if (selectedMemberId !== team.admin) {
        await updateMemberPermissions(team.id, selectedMemberId, memberPermissions);
      }
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
  <TitleHeader title="Detalles del Equipo" description={team?.name || ""} action={() => navigateTo("/teams")} />
  </header>

  {#if team}
    <div class="content">
      <div class="team-header-card">
        {#if team.photoURL}
        <div class="team-icon">
            <img src={team.photoURL} alt={team.name} />
          </div>
        {:else}
          <div class="team-icon">
            <Users size={40} />
          </div>
        {/if}
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
            onclick={() => (navigateTo(`/teams/${team.id}/chat`))}
          >
            <div class="menu-icon chat">
              <MessageSquare size={24} />
            </div>
            <span>Chat</span>
          </button>
          {#if canViewTasks}
            <button
              class="menu-card"
              onclick={() => (navigateTo(`/teams/${team.id}/tasks`))}
            >
              <div class="menu-icon tasks">
                <CheckSquare size={24} />
              </div>
              <span>Tareas</span>
            </button>
          {/if}
          <button class="menu-card" onclick={openWorkdayForm}>
            <div class="menu-icon workday">
              <Clock size={24} />
            </div>
            <span>Ingresar jornada</span>
          </button>
          <button
            class="menu-card"
            onclick={() => navigateTo(`/teams/${team.id}/my-stats`)}
          >
            <div class="menu-icon user-stats">
              <UserCheck size={24} />
            </div>
            <span>Mis estadísticas</span>
          </button>
          {#if canViewStats}
            <button
              class="menu-card"
              onclick={() => navigateTo(`/teams/${team.id}/stats`)}
            >
              <div class="menu-icon stats">
                <BarChart2 size={24} />
              </div>
              <span>Avanzadas</span>
            </button>
          {/if}
          {#if canViewInventory}
            <button
              class="menu-card"
              onclick={() => (navigateTo(`/teams/${team.id}/inventory`))}
            >
              <div class="menu-icon inventory">
                <Package size={24} />
              </div>
              <span>Inventario</span>
            </button>
          {/if}
          {#if canViewSettings}
            <button
              class="menu-card"
              onclick={() => (navigateTo(`/teams/${team.id}/settings`))}
            >
              <div class="menu-icon settings">
                <Settings size={24} />
              </div>
              <span>Ajustes</span>
            </button>
          {/if}
          {#if canViewPayments}
            <button
              class="menu-card"
              onclick={() => (navigateTo(`/teams/${team.id}/payments`))}
            >
              <div class="menu-icon payments">
                <DollarSign size={24} />
              </div>
              <span>Pagos</span>
            </button>
          {/if}
          {#if canViewLocations}
            <button
              class="menu-card"
              onclick={() => (navigateTo(`/teams/${team.id}/locations`))}
            >
              <div class="menu-icon locations">
                <MapPinned size={24} />
              </div>
              <span>Ubicaciones</span>
            </button>
          {/if}
          {#if isAdmin}
            <button
              class="menu-card"
              onclick={() => (navigateTo(`/teams/${team.id}/planning`))}
            >
              <div class="menu-icon planning">
                <Calendar1 size={24} />
              </div>
              <span>Planning</span>
            </button>
          {/if}
        </div>
      </section>

      <section class="members-section">
        <div class="section-header">
          <h3>Miembros ({team.members?.length || 0})</h3>
          {#if canCreateSettings}
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
              <div class="member-avatar-wrap">
                <div class="member-avatar">
                  {#if getMemberPhoto(member)}
                    <img
                      src={getMemberPhoto(member)}
                      alt={member?.name || member?.email}
                      width="40px"
                      height="40px"
                    />
                  {:else if getMemberFallbackAvatar(member)}
                    <span>{getMemberFallbackAvatar(member)}</span>
                  {:else}
                    <User size={24} color="#94a3b8" />
                  {/if}
                </div>
                <span
                  class="presence-dot"
                  class:active={isMemberActive(member.id)}
                  title={getMemberPresenceLabel(member.id)}
                  aria-label={getMemberPresenceLabel(member.id)}
                ></span>
              </div>
              <div class="member-info">
                <p class="member-id">
                  {member?.name || member?.email || "Usuario"}
                </p>
                <small class:active={isMemberActive(member.id)}>
                  {getMemberPresenceLabel(member.id)}
                </small>
              </div>
              <div class="member-actions">
                {#if member.id !== $userStore?.uid}
                  <button
                    class="member-action-btn"
                    onclick={() => navigateTo(`/teams/${team.id}/chat?mode=private&member=${member.id}`)}
                    aria-label="Enviar mensaje directo"
                  >
                    <MessageSquare size={18} />
                  </button>
                {/if}
                {#if canEditSettings}
                  <button
                    class="member-action-btn"
                    onclick={() => openMemberSettings(member.id, member.email)}
                    aria-label="Ajustes de miembro"
                  >
                    <Settings size={18} />
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>

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

        <div class="permissions-editor">
          <h4>Permisos del miembro</h4>
          {#each permissionModules as [module, moduleLabel]}
            <div class="permission-row">
              <span class="permission-module">{moduleLabel}</span>
              <div class="permission-actions">
                {#each permissionActions as [action, actionLabel]}
                  <label class="permission-toggle">
                    <input
                      type="checkbox"
                      checked={newMemberPermissions[module][action]}
                      onchange={() =>
                        togglePermission(newMemberPermissions, module, action)}
                    />
                    <span>{actionLabel}</span>
                  </label>
                {/each}
              </div>
            </div>
          {/each}
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

        {#if selectedMemberId !== team.admin}
          <div class="permissions-editor">
            <h4>Permisos del miembro</h4>
            {#each permissionModules as [module, moduleLabel]}
              <div class="permission-row">
                <span class="permission-module">{moduleLabel}</span>
                <div class="permission-actions">
                  {#each permissionActions as [action, actionLabel]}
                    <label class="permission-toggle">
                      <input
                        type="checkbox"
                        checked={memberPermissions[module][action]}
                        onchange={() =>
                          togglePermission(memberPermissions, module, action)}
                      />
                      <span>{actionLabel}</span>
                    </label>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}

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
          {isTodayNonWorkingDay
            ? todayNonWorkingMessage
            : hasWorkdayToday
              ? "Ya ingresaste una jornada hoy. Solo puedes añadir horas extra."
              : "Selecciona el tipo de jornada que deseas registrar para hoy."}
          {#if overtimeLimitHours > 0}
            Límite de horas extra: {overtimeLimitHours}h.
          {/if}
        </p>

        <div class="workday-options">
          <button
            class="workday-option {workDay.type === 'full-day'
              ? 'work-option-active'
              : ''} {hasWorkdayToday || isTodayNonWorkingDay ? 'work-option-disabled' : ''}"
            onclick={() => {
              if (!hasWorkdayToday && !isTodayNonWorkingDay) workDay.type = "full-day";
            }}
            disabled={hasWorkdayToday || isCheckingWorkday || isTodayNonWorkingDay}
            aria-disabled={hasWorkdayToday || isCheckingWorkday || isTodayNonWorkingDay}
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
              : ''} {hasWorkdayToday || isTodayNonWorkingDay ? 'work-option-disabled' : ''}"
            onclick={() => {
              if (!hasWorkdayToday && !isTodayNonWorkingDay) workDay.type = "half-day";
            }}
            disabled={hasWorkdayToday || isCheckingWorkday || isTodayNonWorkingDay}
            aria-disabled={hasWorkdayToday || isCheckingWorkday || isTodayNonWorkingDay}
          >
            <div class="option-icon half-day">
              <Clock size={24} />
            </div>
            <div class="option-text">
              <span class="option-title">Media Jornada</span>
              <p class="option-desc">Medio día de trabajo</p>
            </div>
          </button>

          <div class="workday-option overtime" class:work-option-disabled={isTodayNonWorkingDay}>
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
                  disabled={isTodayNonWorkingDay || workDay.overtimeHours === 0}
                >
                  <Minus size={18} />
                </button>
                <span class="counter-value">{workDay.overtimeHours}h</span>
                <button
                  class="counter-btn"
                  onclick={() =>
                    (workDay.overtimeHours = Math.min(
                      overtimeLimitHours || 12,
                      workDay.overtimeHours + 1,
                    ))}
                  disabled={isTodayNonWorkingDay || (overtimeLimitHours > 0 && workDay.overtimeHours >= overtimeLimitHours)}
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <button
          class="register-workday-btn"
          onclick={handleRegisterWorkday}
          disabled={isCheckingWorkday || isTodayNonWorkingDay || (hasWorkdayToday && workDay.overtimeHours <= 0)}
        >
          <Save size={20} />
          <span>{hasWorkdayToday ? "Registrar Horas Extra" : "Registrar Jornada"}</span>
        </button>
      </div>
    </SliceContainer>

  {:else}
    <div class="empty-state">
      <p>No se seleccionó ningún equipo.</p>
      <button onclick={() => navigateTo("/teams")}>Volver</button>
    </div>
  {/if}
</div>

<style>
  .team-detail {
    padding: 24px 20px var(--bottom-nav-clearance);
    padding-top: var(--page-top-safe);
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
  .team-icon img {
    width: 72px;
    height: 72px;
    object-fit: cover;
    border-radius: 16px;
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
  .menu-icon.user-stats {
    background: var(--bg-purple-subtle);
    color: var(--purple-color);
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
  .menu-icon.locations {
    background: var(--bg-info-subtle);
    color: var(--info-color);
  }
  .menu-icon.planning {
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
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

  .member-avatar-wrap {
    position: relative;
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
  }

  .member-avatar {
    width: 100%;
    height: 100%;
    background: var(--bg-accent-subtle);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    color: var(--accent-color);
    overflow: hidden;
    object-fit: cover;
  }

  .presence-dot {
    position: absolute;
    right: -3px;
    bottom: -3px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #9ca3af;
    border: 2px solid var(--bg-card);
    box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08);
  }

  .presence-dot.active {
    background: #22c55e;
  }

  .member-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .member-info p {
    margin: 0;
    font-size: 15px;
    font-weight: 500;
  }

  .member-info small {
    display: block;
    margin-top: 3px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
  }

  .member-info small.active {
    color: #15803d;
  }

  .member-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .member-action-btn {
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

  .member-action-btn:hover {
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

  .permissions-editor {
    margin: 8px 0 22px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .permissions-editor h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .permission-row {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 12px;
    background: var(--bg-input);
  }

  .permission-module {
    display: block;
    margin-bottom: 10px;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .permission-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .permission-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
  }

  .permission-toggle input {
    accent-color: var(--accent-color);
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

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 16px;
    color: var(--text-secondary);
  }

  /* Workday Form Styles - Premium Alignment */
  .workday-form {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .workday-form h3 {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    color: var(--text-primary);
  }

  .workday-form .form-instruction {
    margin: 0;
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .workday-options {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 8px 0 20px;
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
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    text-align: left;
    width: 100%;
    position: relative;
    overflow: hidden;
  }

  .workday-option:hover:not(.overtime) {
    transform: translateY(-3px);
    border-color: var(--accent-color);
    box-shadow: var(--shadow-card);
  }

  .workday-option:disabled,
  .workday-option.work-option-disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .workday-option:disabled:hover {
    border-color: var(--border-color);
  }

  .workday-option:active:not(.overtime) {
    transform: scale(0.98);
  }

  .work-option-active {
    border-color: var(--accent-color) !important;
    background: var(--bg-accent-subtle) !important;
    box-shadow: 0 0 0 1px var(--accent-color), var(--shadow-card);
  }

  .option-icon {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: transform 0.2s;
  }

  .workday-option:hover .option-icon {
    transform: scale(1.1) rotate(-3deg);
  }

  .option-icon.full-day {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }

  .option-icon.half-day {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .option-icon.overtime-icon {
    background: var(--bg-purple-subtle);
    color: var(--purple-color);
  }

  .option-text {
    flex: 1;
  }

  .option-title {
    display: block;
    font-size: 17px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 2px;
  }

  .option-desc {
    margin: 0;
    font-size: 13px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .overtime-counter {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
    background: var(--bg-input);
    padding: 8px 12px;
    border-radius: 100px;
    width: fit-content;
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
  }

  .counter-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: var(--bg-card);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: var(--shadow-sm);
  }

  .counter-btn:hover:not(:disabled) {
    background: var(--accent-color);
    color: white;
    transform: scale(1.1);
  }

  .counter-btn:active:not(:disabled) {
    transform: scale(0.9);
  }

  .counter-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .counter-value {
    font-size: 18px;
    font-weight: 800;
    color: var(--text-primary);
    min-width: 40px;
    text-align: center;
  }

  .register-workday-btn {
    width: 100%;
    padding: 18px;
    background: var(--accent-color);
    color: white;
    border: none;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    font-size: 17px;
    font-weight: 700;
    cursor: pointer;
    margin-top: 8px;
    box-shadow: var(--shadow-button);
    transition: all 0.2s ease;
  }

  .register-workday-btn:hover {
    background: var(--accent-strong);
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
  }

  .register-workday-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .register-workday-btn:disabled:hover {
    background: var(--accent-color);
    transform: none;
    box-shadow: none;
  }

  .register-workday-btn:active {
    transform: translateY(0);
  }

</style>
