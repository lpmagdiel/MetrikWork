<script>
  import Toast from "../components/Toast.svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import CircleAddButton from "../components/CircleAddButton.svelte";
  import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Clock,
    Filter,
    Save,
    StickyNote,
    User,
  } from "lucide-svelte";
  import { navigateTo } from "../router.js";
  import {
    selectedTeamId,
    userStore,
    selectedTeam,
    getUserProfile,
    getTeamWorks,
    assignWorkdayToMember,
    createNotification,
    applyWorkdayOvertimeLimit,
    exceedsOvertimeLimit,
    hasOvertimeEnabled,
    getOvertimeLimitHours,
    getOvertimeLimitMessage,
    isNonWorkingDay,
    getNonWorkingDayMessage,
  } from "../data/stores.js";
  import TitleHeader from "../components/TitleHeader.svelte";

  let messageToast = $state("");
  let typeToast = $state("success");
  let showToast = $state(false);
  let openAddEvent = $state(false);
  let memberList = $state([]);
  let works = $state([]);
  let isLoadingWorks = $state(false);
  let selectedMemberFilter = $state("all");
  let selectedDateFilter = $state("");
  let currentMonth = $state(new Date().getMonth());
  let currentYear = $state(new Date().getFullYear());
  let selectedCalendarDate = $state(toDateInputValue(new Date()));
  let assignmentForm = $state({
    userId: "",
    date: toDateInputValue(new Date()),
    type: "full-day",
    overtimeHours: 0,
    note: "",
  });
  let isSavingAssignment = $state(false);

  let team = $derived($selectedTeam);
  let isAdmin = $derived(
    $userStore?.uid && team?.admin && $userStore.uid === team.admin,
  );
  let overtimeLimitHours = $derived(getOvertimeLimitHours(team));
  let overtimeEnabled = $derived(hasOvertimeEnabled(team));
  let isAssignmentNonWorkingDay = $derived(isNonWorkingDay(team, assignmentForm.date));
  let assignmentNonWorkingMessage = $derived(getNonWorkingDayMessage(team, assignmentForm.date));

  const monthNames = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const weekDays = ["L", "M", "X", "J", "V", "S", "D"];
  const workTypeLabels = {
    "full-day": "Jornada completa",
    "half-day": "Media jornada",
    overtime: "Horas extra",
    variable: "Jornada variable",
  };
  const workTypeColors = {
    "full-day": "#16a34a",
    "half-day": "#f59e0b",
    overtime: "#0284c7",
    variable: "#7c3aed",
  };

  $effect(() => {
    if (!overtimeEnabled) {
      if (assignmentForm.type === "overtime") assignmentForm.type = "full-day";
      if (assignmentForm.overtimeHours !== 0) assignmentForm.overtimeHours = 0;
    }
  });

  let calendarDays = $derived.by(() => {
    const days = [];
    const firstDay = new Date(currentYear, currentMonth, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let i = 0; i < startOffset; i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dateKey = toDateInputValue(date);
      days.push({
        day,
        dateKey,
        assignments: works.filter((work) => work.date === dateKey),
      });
    }
    return days;
  });

  let filteredWorks = $derived.by(() => {
    return works.filter((work) => {
      const memberMatches =
        selectedMemberFilter === "all" || work.userId === selectedMemberFilter;
      const dateMatches = !selectedDateFilter || work.date === selectedDateFilter;
      return memberMatches && dateMatches;
    });
  });

  let selectedDayAssignments = $derived(
    works.filter((work) => work.date === selectedCalendarDate),
  );

  $effect(() => {
    let active = true;
    if (team?.members?.length) {
      Promise.all(team.members.map((memberId) => getUserProfile(memberId))).then(
        (users) => {
          if (active) {
            memberList = users.filter(Boolean);
            if (
              memberList[0]?.id &&
              !memberList.some((member) => member.id === assignmentForm.userId)
            ) {
              assignmentForm.userId = memberList[0].id;
            }
          }
        },
      );
    } else {
      memberList = [];
    }
    return () => {
      active = false;
    };
  });

  $effect(() => {
    if (team?.id) loadWorks();
  });

  $effect(() => {
    if (!isAssignmentNonWorkingDay) return;
    if (assignmentForm.overtimeHours !== 0) {
      assignmentForm.overtimeHours = 0;
    }
    if (assignmentForm.type === "overtime") {
      assignmentForm.type = "full-day";
    }
  });

  function showNotification(message, type = "success") {
    messageToast = message;
    typeToast = type;
    showToast = true;
    setTimeout(() => {
      showToast = false;
    }, 3000);
  }

  async function loadWorks() {
    if (!team?.id) return;
    isLoadingWorks = true;
    try {
      works = await getTeamWorks(team.id);
    } catch (error) {
      console.error("Error loading planning works:", error);
      showNotification("Error al cargar las jornadas", "error");
    } finally {
      isLoadingWorks = false;
    }
  }

  function toDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDisplayDate(dateString) {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function getMemberName(memberId) {
    const member = memberList.find((item) => item.id === memberId);
    return member?.name || member?.email || "Usuario";
  }

  function getMemberInitials(memberId) {
    const name = getMemberName(memberId);
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  function getWorkType(work) {
    if (work?.type === "full-day") return "full-day";
    if (work?.type === "half-day") return "half-day";
    if (work?.type === "variable") return "variable";
    if (work?.type === "overtime" || Number(work?.overtimeHours) > 0) return "overtime";
    return "full-day";
  }

  function getWorkColor(work) {
    return workTypeColors[getWorkType(work)] || workTypeColors["full-day"];
  }

  function getDayTypes(assignments = []) {
    return [...new Set(assignments.map(getWorkType))];
  }

  function getDayStyle(day) {
    const types = getDayTypes(day?.assignments || []);
    if (!types.length) return "";
    const colors = types.map((type) => workTypeColors[type]);

    if (colors.length === 1) {
      return `--work-color: ${colors[0]}; --work-bg: ${colors[0]}18; --work-border: ${colors[0]};`;
    }

    const step = 100 / colors.length;
    const gradientStops = colors
      .map((color, index) => `${color} ${index * step}% ${(index + 1) * step}%`)
      .join(", ");
    return `--work-color: ${colors[0]}; --work-bg: linear-gradient(135deg, ${gradientStops}); --work-border: ${colors[0]};`;
  }

  function prevMonth() {
    if (currentMonth === 0) {
      currentMonth = 11;
      currentYear -= 1;
    } else {
      currentMonth -= 1;
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      currentMonth = 0;
      currentYear += 1;
    } else {
      currentMonth += 1;
    }
  }

  function selectCalendarDay(day) {
    if (!day) return;
    selectedCalendarDate = day.dateKey;
    assignmentForm.date = day.dateKey;
    selectedDateFilter = day.dateKey;
  }

  function openAssignment(date = selectedCalendarDate) {
    assignmentForm = {
      userId: assignmentForm.userId || memberList[0]?.id || "",
      date,
      type: "full-day",
      overtimeHours: 0,
      note: "",
    };
    openAddEvent = true;
  }

  async function handleSaveAssignment() {
    if (!team?.id || !assignmentForm.userId || !assignmentForm.date) return;
    if (isAssignmentNonWorkingDay) {
      showNotification(assignmentNonWorkingMessage, "error");
      return;
    }

    if (
      !overtimeEnabled &&
      (assignmentForm.type === "overtime" || Number(assignmentForm.overtimeHours) > 0)
    ) {
      showNotification(getOvertimeLimitMessage(team), "error");
      return;
    }

    if (exceedsOvertimeLimit(assignmentForm.overtimeHours, team)) {
      showNotification(getOvertimeLimitMessage(team), "error");
      return;
    }

    isSavingAssignment = true;
    try {
      const limitedAssignment = applyWorkdayOvertimeLimit(assignmentForm, team);
      await assignWorkdayToMember(
        team.id,
        limitedAssignment.userId,
        getMemberName(limitedAssignment.userId),
        limitedAssignment,
        $userStore?.uid || null,
      );
      await createNotification(
        limitedAssignment.userId,
        "Nueva jornada asignada",
        buildAssignmentNotificationMessage(limitedAssignment),
        {
          url: `/teams/${team.id}/planning`,
          type: "event_assigned",
          teamId: team.id,
        },
      );
      await loadWorks();
      openAddEvent = false;
      selectedCalendarDate = limitedAssignment.date;
      selectedDateFilter = limitedAssignment.date;
      showNotification("Jornada asignada correctamente");
    } catch (error) {
      console.error("Error saving assignment:", error);
      showNotification("Error al asignar la jornada", "error");
    } finally {
      isSavingAssignment = false;
    }
  }

  function clearFilters() {
    selectedMemberFilter = "all";
    selectedDateFilter = "";
  }

  function buildAssignmentNotificationMessage(workDay = assignmentForm) {
    const teamName = team?.name || team?.team || "tu equipo";
    const typeLabel = workTypeLabels[workDay.type] || "Jornada";
    const noteText = workDay.note?.trim()
      ? ` Nota: ${workDay.note.trim()}.`
      : "";
    return `${typeLabel} asignada para el ${formatDisplayDate(workDay.date)} en ${teamName}.${noteText}`;
  }

  function goToTeamHome() {
    const teamId = team?.id || $selectedTeamId;
    navigateTo(teamId ? `/teams/${teamId}` : "/teams");
  }
</script>

<div class="tasks-page">
  <Toast message={messageToast} type={typeToast} show={showToast} />

  {#if team}
    <header>
    <TitleHeader title="Planning" description={`${works.length} jornadas`} action={goToTeamHome} />
      {#if isAdmin}
        <CircleAddButton onClick={() => openAssignment()} floating={true}/>
      {/if}
    </header>

    <main class="planning-content">
      <section class="calendar-panel">
        <div class="section-heading">
          <div>
            <p>Calendario del equipo</p>
            <h2>{monthNames[currentMonth]} {currentYear}</h2>
          </div>
          <div class="calendar-actions">
            <button class="icon-btn" onclick={prevMonth} aria-label="Mes anterior">
              <ChevronLeft size={20} />
            </button>
            <button class="icon-btn" onclick={nextMonth} aria-label="Mes siguiente">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div class="weekdays">
          {#each weekDays as day}
            <span>{day}</span>
          {/each}
        </div>

        <div class="work-legend">
          {#each Object.entries(workTypeLabels) as [type, label]}
            <span style={`--legend-color: ${workTypeColors[type]};`}>
              <i></i>{label}
            </span>
          {/each}
        </div>

        <div class="calendar-grid">
          {#each calendarDays as day}
            <button
              class="calendar-day"
              class:empty={!day}
              class:selected={day?.dateKey === selectedCalendarDate}
              class:marked={day?.assignments?.length > 0}
              class:non-working={day && isNonWorkingDay(team, day.dateKey)}
              style={getDayStyle(day)}
              disabled={!day}
              onclick={() => selectCalendarDay(day)}
            >
              {#if day}
                <span class="day-number">{day.day}</span>
                {#if day.assignments.length > 0}
                  <span class="assignment-count">{day.assignments.length}</span>
                  <span class="assignment-dots">
                    {#each day.assignments.slice(0, 3) as work}
                      <i
                        style={`--dot-color: ${getWorkColor(work)};`}
                        title={`${getMemberName(work.userId)} · ${workTypeLabels[getWorkType(work)]}`}
                      ></i>
                    {/each}
                  </span>
                {/if}
              {/if}
            </button>
          {/each}
        </div>
      </section>

      <section class="day-panel">
        <div class="section-heading compact">
          <div>
            <p>Día seleccionado</p>
            <h2>{formatDisplayDate(selectedCalendarDate)}</h2>
          </div>
          {#if isAdmin}
            <button class="assign-btn" onclick={() => openAssignment(selectedCalendarDate)}>
              <CalendarDays size={18} />
              <span>Asignar</span>
            </button>
          {/if}
        </div>

        <div class="day-assignments">
          {#if selectedDayAssignments.length > 0}
            {#each selectedDayAssignments as work (work.id)}
              <article class="assignment-card" style={`--work-color: ${getWorkColor(work)};`}>
                <div class="avatar">{getMemberInitials(work.userId)}</div>
                <div>
                  <h3>{getMemberName(work.userId)}</h3>
                  <p>{workTypeLabels[getWorkType(work)] || "Jornada"}</p>
                  {#if work.note}
                    <small><StickyNote size={13} /> {work.note}</small>
                  {/if}
                </div>
              </article>
            {/each}
          {:else}
            <div class="empty-state small">
              <CalendarDays size={24} />
              <p>Sin jornadas asignadas para este día.</p>
            </div>
          {/if}
        </div>
      </section>

      <section class="records-panel">
        <div class="section-heading">
          <div>
            <p>Registros</p>
            <h2>Jornadas del equipo</h2>
          </div>
          <span class="filter-icon">
            <Filter size={20} />
          </span>
        </div>

        <div class="filters-row">
          <label>
            <span>Miembro</span>
            <select bind:value={selectedMemberFilter}>
              <option value="all">Todos</option>
              {#each memberList as member}
                <option value={member.id}>{member.name || member.email}</option>
              {/each}
            </select>
          </label>
          <label>
            <span>Fecha</span>
            <input type="date" bind:value={selectedDateFilter} />
          </label>
          <button class="clear-btn" onclick={clearFilters}>Limpiar</button>
        </div>

        {#if isLoadingWorks}
          <div class="loading-inline">
            <LoadingSpinner show={true} />
            <span>Cargando jornadas...</span>
          </div>
        {:else if filteredWorks.length > 0}
          <div class="records-list">
            {#each filteredWorks as work (work.id)}
              <article class="record-item" style={`--work-color: ${getWorkColor(work)};`}>
                <div class="record-date">
                  <CalendarDays size={18} />
                  <span>{formatDisplayDate(work.date)}</span>
                </div>
                <div class="record-main">
                  <h3>{getMemberName(work.userId)}</h3>
                  <p>{workTypeLabels[getWorkType(work)] || "Jornada"}</p>
                  {#if work.note}
                    <small>{work.note}</small>
                  {/if}
                </div>
                <div class="record-meta">
                  <Clock size={16} />
                  <span>{work.overtimeHours || 0}h extra</span>
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <div class="empty-state">
            <User size={28} />
            <p>No hay jornadas con los filtros actuales.</p>
          </div>
        {/if}
      </section>
    </main>
  {:else}
    <div class="loading-container">
      <LoadingSpinner show={true} />
      <p>Cargando información del equipo...</p>
    </div>
  {/if}

  <SliceContainer bind:show={openAddEvent}>
    <div class="assignment-form">
      <h3>Asignar jornada</h3>
      <p>Marca un día de trabajo para un miembro del equipo.</p>
      {#if overtimeEnabled}
        <p class="form-instruction">Límite de horas extra del equipo: {overtimeLimitHours}h.</p>
      {:else}
        <p class="form-instruction">Las horas extra están desactivadas para este equipo.</p>
      {/if}
      {#if isAssignmentNonWorkingDay}
        <p class="form-instruction error">{assignmentNonWorkingMessage}</p>
      {/if}

      <label>
        <span>Miembro</span>
        <select bind:value={assignmentForm.userId}>
          {#each memberList as member}
            <option value={member.id}>{member.name || member.email}</option>
          {/each}
        </select>
      </label>

      <label>
        <span>Fecha</span>
        <input type="date" bind:value={assignmentForm.date} />
      </label>

      <label>
        <span>Tipo de jornada</span>
        <select bind:value={assignmentForm.type} disabled={isAssignmentNonWorkingDay}>
          <option value="full-day">Jornada completa</option>
          <option value="half-day">Media jornada</option>
          <option value="overtime" disabled={!overtimeEnabled}>Horas extra</option>
          <option value="variable">Jornada variable</option>
        </select>
      </label>

      <label>
        <span>Horas extra</span>
        <input
          type="number"
          min="0"
          max={overtimeEnabled ? overtimeLimitHours : 0}
          step="0.5"
          bind:value={assignmentForm.overtimeHours}
          disabled={isAssignmentNonWorkingDay || !overtimeEnabled}
        />
      </label>

      <label>
        <span>Nota</span>
        <textarea
          rows="4"
          bind:value={assignmentForm.note}
          placeholder="Ej. distribucion de medicamentos"
        ></textarea>
      </label>

      <button
        class="save-btn"
        onclick={handleSaveAssignment}
        disabled={isSavingAssignment || !assignmentForm.userId || !assignmentForm.date || isAssignmentNonWorkingDay}
      >
        <Save size={18} />
        <span>{isSavingAssignment ? "Guardando..." : "Guardar jornada"}</span>
      </button>
    </div>
  </SliceContainer>
</div>

<style>
  .tasks-page {
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

  .icon-btn {
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

  .section-heading p,
  label span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
  }

  .loading-container,
  .loading-inline,
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text-secondary);
  }

  .loading-container {
    flex-direction: column;
    height: 100%;
  }

  .planning-content {
    flex: 1;
    min-height: 0;
    padding: 8px 20px var(--bottom-nav-clearance);
    overflow-y: auto;
    overflow-x: hidden;
    display: grid;
    gap: 16px;
    align-content: start;
    -webkit-overflow-scrolling: touch;
  }

  .calendar-panel,
  .day-panel,
  .records-panel {
    background: var(--bg-card);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
    padding: 16px;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  .section-heading.compact {
    margin-bottom: 12px;
  }

  .section-heading h2 {
    font-size: 18px;
    font-weight: 800;
    margin-top: 3px;
  }

  .calendar-actions {
    display: flex;
    gap: 8px;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    background: var(--bg-input);
    box-shadow: none;
  }

  .weekdays,
  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
  }

  .weekdays {
    margin-bottom: 8px;
  }

  .weekdays span {
    text-align: center;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 800;
  }

  .work-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    margin: 0 0 12px;
  }

  .work-legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 800;
  }

  .work-legend i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--legend-color);
    flex-shrink: 0;
  }

  .calendar-day {
    min-width: 0;
    aspect-ratio: 1;
    border: 1px solid transparent;
    border-radius: 10px;
    background: var(--bg-input);
    color: var(--text-primary);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    position: relative;
  }

  .calendar-day.empty {
    background: transparent;
    cursor: default;
  }

  .calendar-day.marked {
    background: var(--work-bg);
    border-color: var(--work-border);
    color: var(--text-primary);
  }

  .calendar-day.selected {
    background: var(--text-primary);
    color: var(--bg-card);
    border-color: var(--text-primary);
  }

  .calendar-day.selected.marked {
    box-shadow: inset 0 -4px 0 var(--work-color);
  }

  .calendar-day.non-working:not(.selected) {
    border-color: color-mix(in srgb, var(--danger-color) 38%, transparent);
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
  }

  .day-number {
    font-size: 13px;
    font-weight: 800;
  }

  .assignment-count {
    font-size: 10px;
    font-weight: 800;
  }

  .assignment-dots {
    display: flex;
    gap: 2px;
    min-height: 4px;
  }

  .assignment-dots i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--dot-color, currentColor);
  }

  .assign-btn,
  .clear-btn,
  .save-btn {
    border: none;
    border-radius: 12px;
    cursor: pointer;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .assign-btn {
    background: var(--text-primary);
    color: var(--bg-card);
    padding: 10px 12px;
  }

  .day-assignments,
  .records-list {
    display: grid;
    gap: 10px;
  }

  .assignment-card,
  .record-item {
    border: 1px solid var(--border-color);
    border-left: 5px solid var(--work-color, var(--accent-color));
    border-radius: 12px;
    padding: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--work-color, var(--accent-color)) 12%, transparent), transparent 52%),
      var(--bg-card);
  }

  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--bg-accent-subtle);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 900;
    flex-shrink: 0;
  }

  .assignment-card h3,
  .record-main h3 {
    font-size: 14px;
    margin: 0 0 2px;
  }

  .assignment-card p,
  .record-main p,
  .record-main small,
  .assignment-card small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .assignment-card small {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
  }

  .filters-row {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 10px;
    align-items: end;
    margin-bottom: 14px;
  }

  label {
    display: grid;
    gap: 7px;
  }

  select,
  input,
  textarea {
    width: 100%;
    border: 1px solid var(--border-color);
    background: var(--bg-input);
    color: var(--text-primary);
    border-radius: 12px;
    padding: 12px;
    font-size: 14px;
  }

  textarea {
    resize: vertical;
  }

  .clear-btn {
    min-height: 44px;
    padding: 0 14px;
    color: var(--text-primary);
    background: var(--bg-input);
  }

  .record-item {
    align-items: flex-start;
  }

  .record-date,
  .record-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .record-main {
    flex: 1;
    min-width: 0;
  }

  .record-main small {
    display: block;
    margin-top: 4px;
  }

  .empty-state {
    min-height: 112px;
    flex-direction: column;
    text-align: center;
    border: 1px dashed var(--border-color);
    border-radius: 12px;
    padding: 18px;
  }

  .empty-state.small {
    min-height: 96px;
  }

  .filter-icon {
    color: var(--text-secondary);
    display: flex;
  }

  .assignment-form {
    display: grid;
    gap: 14px;
  }

  .assignment-form h3 {
    font-size: 20px;
  }

  .assignment-form > p {
    color: var(--text-secondary);
    font-size: 14px;
    margin-top: -8px;
  }

  .assignment-form > p.error {
    color: var(--danger-color);
    background: var(--bg-danger-subtle);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    margin-top: -4px;
  }

  .save-btn {
    background: var(--text-primary);
    color: var(--bg-card);
    min-height: 48px;
    margin-top: 4px;
  }

  .save-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  @media (min-width: 920px) {
    .planning-content {
      grid-template-columns: minmax(0, 1.1fr) minmax(340px, 0.9fr);
      align-items: start;
    }

    .records-panel {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 640px) {
    header {
      padding-inline: 16px;
    }

    .planning-content {
      padding-inline: 16px;
    }

    .filters-row {
      grid-template-columns: 1fr;
    }

    .record-item {
      display: grid;
    }

    .record-meta {
      white-space: normal;
    }
  }
</style>
