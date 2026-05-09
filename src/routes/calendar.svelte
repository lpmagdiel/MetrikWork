<script>
  import {
    CalendarDays,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Circle,
    Clock,
    Plus,
    Send,
    StickyNote,
    Trash2,
    Users,
  } from "lucide-svelte";
  import {
    notesStore,
    addNote,
    deleteNote,
    userStore,
    teamsStore,
    getAssignedTasksFromTeams,
  } from "../data/stores.js";
  import SliceContainer from "../components/SliceContainer.svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import { useSwipe } from "svelte-gestures";

  let currentMonth = $state(new Date().getMonth());
  let currentYear = $state(new Date().getFullYear());
  let selectedDate = $state(toDateKey(new Date()));
  let showAddNote = $state(false);
  let newNoteContent = $state("");
  let isSubmittingNote = $state(false);
  let swipedNoteId = $state(null);
  let assignedTasks = $state([]);
  let isLoadingTasks = $state(false);

  const weekDays = ["L", "M", "X", "J", "V", "S", "D"];
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
  const statusConfig = {
    pending: { label: "Pendiente", tone: "warning" },
    "in-progress": { label: "En proceso", tone: "info" },
    completed: { label: "Completada", tone: "success" },
    unassigned: { label: "Sin asignar", tone: "muted" },
  };

  let calendarDays = $derived.by(() => {
    const days = [];
    const firstDay = new Date(currentYear, currentMonth, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let i = 0; i < startOffset; i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dateKey = toDateKey(date);
      days.push({
        day,
        dateKey,
        tasks: tasksForDate(dateKey),
        notes: notesForDate(dateKey),
      });
    }
    return days;
  });

  let tasksForSelectedDate = $derived(tasksForDate(selectedDate));
  let notesForSelectedDate = $derived(notesForDate(selectedDate));
  let selectedDateLabel = $derived(formatDisplayDate(selectedDate));
  let pendingTasksCount = $derived(
    assignedTasks.filter((task) => task.status !== "completed").length,
  );

  $effect(() => {
    const uid = $userStore?.uid;
    const teams = $teamsStore;
    if (uid) {
      loadAssignedTasks(teams, uid);
    } else {
      assignedTasks = [];
    }
  });

  async function loadAssignedTasks(teams = $teamsStore, uid = $userStore?.uid) {
    if (!uid) return;
    isLoadingTasks = true;
    try {
      assignedTasks = await getAssignedTasksFromTeams(teams, uid);
    } catch (error) {
      console.error("Error loading assigned calendar tasks:", error);
    } finally {
      isLoadingTasks = false;
    }
  }

  function tasksForDate(dateKey) {
    return assignedTasks.filter((task) => getTaskDateKey(task) === dateKey);
  }

  function notesForDate(dateKey) {
    return $notesStore.filter((note) => getNoteDateKey(note) === dateKey);
  }

  function getTaskDateKey(task) {
    if (!task?.dueDate) return "";
    return task.dueDate.slice(0, 10);
  }

  function getNoteDateKey(note) {
    if (!note?.date) return "";
    const date = new Date(note.date);
    if (Number.isNaN(date.getTime())) return "";
    return toDateKey(date);
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDisplayDate(dateKey) {
    if (!dateKey) return "";
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatTaskDateTime(task) {
    if (!task?.dueDate) return "Todo el día";
    const date = new Date(task.dueDate);
    if (Number.isNaN(date.getTime())) return "Todo el día";
    const hasTime = !task.dueDate.endsWith("T00:00:00.000Z");
    return hasTime
      ? date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
      : "Todo el día";
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

  function selectDate(day) {
    if (!day) return;
    selectedDate = day.dateKey;
  }

  function isToday(day) {
    return day?.dateKey === toDateKey(new Date());
  }

  async function handleAddNote() {
    if (!newNoteContent.trim()) return;
    if (!$userStore?.uid) {
      alert("No se pudo identificar el usuario para guardar la nota");
      return;
    }
    const [year, month, day] = selectedDate.split("-").map(Number);
    isSubmittingNote = true;
    try {
      await addNote($userStore.uid, newNoteContent.trim(), new Date(year, month - 1, day));
      newNoteContent = "";
      showAddNote = false;
    } catch (error) {
      alert("Error al guardar la nota");
    } finally {
      isSubmittingNote = false;
    }
  }

  function handleNoteSwipe(event, noteId) {
    if (event.detail.direction === "left") {
      swipedNoteId = noteId;
    } else if (event.detail.direction === "right" && swipedNoteId === noteId) {
      swipedNoteId = null;
    }
  }

  async function confirmDeleteNote(noteId) {
    if (!$userStore?.uid) return;
    try {
      await deleteNote($userStore.uid, noteId);
      if (swipedNoteId === noteId) swipedNoteId = null;
    } catch (error) {
      alert("Error al eliminar la nota");
    }
  }
</script>

<div class="calendar-page">
  <header>
    <div class="header-title">
      <h1>Agenda</h1>
      <span>{pendingTasksCount} tareas pendientes</span>
    </div>
    <button class="refresh-btn" onclick={loadAssignedTasks} disabled={isLoadingTasks}>
      <CalendarDays size={18} />
    </button>
  </header>

  <main class="calendar-content">
    <section class="calendar-panel">
      <div class="section-heading">
        <div>
          <p>Calendario personal</p>
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

      <div class="calendar-grid">
        {#each calendarDays as day}
          <button
            class="calendar-day"
            class:empty={!day}
            class:selected={day?.dateKey === selectedDate}
            class:today={isToday(day)}
            class:marked={day && (day.tasks.length > 0 || day.notes.length > 0)}
            disabled={!day}
            onclick={() => selectDate(day)}
          >
            {#if day}
              <span class="day-number">{day.day}</span>
              {#if day.tasks.length > 0 || day.notes.length > 0}
                <span class="assignment-count">{day.tasks.length + day.notes.length}</span>
                <span class="assignment-dots">
                  {#if day.tasks.length > 0}<i class="task-dot"></i>{/if}
                  {#if day.notes.length > 0}<i class="note-dot"></i>{/if}
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
          <h2>{selectedDateLabel}</h2>
        </div>
        <button class="add-note-btn" onclick={() => (showAddNote = true)}>
          <Plus size={18} />
          <span>Nota</span>
        </button>
      </div>

      <div class="daily-summary">
        <div>
          <strong>{tasksForSelectedDate.length}</strong>
          <span>Tareas</span>
        </div>
        <div>
          <strong>{notesForSelectedDate.length}</strong>
          <span>Notas</span>
        </div>
      </div>
    </section>

    <section class="records-panel">
      <div class="section-heading">
        <div>
          <p>Trabajo asignado</p>
          <h2>Tareas del día</h2>
        </div>
        {#if isLoadingTasks}
          <LoadingSpinner show={true} />
        {/if}
      </div>

      {#if tasksForSelectedDate.length > 0}
        <div class="tasks-list">
          {#each tasksForSelectedDate as task (task.teamId + task.id)}
            <article class="task-item">
              <div class="task-status">
                {#if task.status === "completed"}
                  <CheckCircle2 size={22} />
                {:else}
                  <Circle size={22} />
                {/if}
              </div>
              <div class="task-info">
                <div class="task-header">
                  <h3>{task.title}</h3>
                  <span class="status-pill {statusConfig[task.status]?.tone || 'muted'}">
                    {statusConfig[task.status]?.label || "Pendiente"}
                  </span>
                </div>
                {#if task.description}
                  <p>{task.description}</p>
                {/if}
                <div class="task-meta">
                  <span><Users size={13} /> {task.teamName}</span>
                  <span><Clock size={13} /> {formatTaskDateTime(task)}</span>
                </div>
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <CalendarDays size={28} />
          <p>No tienes tareas asignadas para este día.</p>
        </div>
      {/if}
    </section>

    <section class="records-panel">
      <div class="section-heading">
        <div>
          <p>Recordatorios</p>
          <h2>Notas personales</h2>
        </div>
        <StickyNote size={20} class="muted-icon" />
      </div>

      {#if notesForSelectedDate.length > 0}
        <div class="notes-list">
          {#each notesForSelectedDate as note (note.id)}
            <div
              class="note-swipe-wrapper"
              {...useSwipe((e) => handleNoteSwipe(e, note.id))}
            >
              <button
                class="delete-action-bg"
                onclick={() => confirmDeleteNote(note.id)}
                aria-label="Eliminar nota"
              >
                <Trash2 size={22} color="white" />
              </button>
              <article class="note-item" class:swiped={swipedNoteId === note.id}>
                <StickyNote size={18} />
                <p>{note.content}</p>
              </article>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <StickyNote size={28} />
          <p>No hay notas para este día.</p>
        </div>
      {/if}
    </section>
  </main>

  <SliceContainer bind:show={showAddNote}>
    <div class="add-note-form">
      <h2>Nueva nota</h2>
      <p>Agrega un recordatorio personal para el {selectedDateLabel}.</p>

      <label>
        <span>Nota</span>
        <textarea
          placeholder="Escribe tu nota aquí..."
          bind:value={newNoteContent}
          rows="4"
        ></textarea>
      </label>

      <button
        class="submit-note-btn"
        onclick={handleAddNote}
        disabled={isSubmittingNote || !newNoteContent.trim()}
      >
        {#if isSubmittingNote}
          <span>Guardando...</span>
        {:else}
          <Send size={20} />
          <span>Guardar nota</span>
        {/if}
      </button>
    </div>
  </SliceContainer>
</div>

<style>
  .calendar-page {
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

  .header-title {
    flex: 1;
    min-width: 0;
  }

  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
  }

  .header-title span,
  .section-heading p,
  label span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
  }

  .refresh-btn,
  .icon-btn {
    border: none;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-primary);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .calendar-content {
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

  .calendar-day.today {
    border-color: var(--text-primary);
  }

  .calendar-day.marked {
    background: var(--bg-success-subtle);
    border-color: var(--accent-color);
  }

  .calendar-day.selected {
    background: var(--text-primary);
    color: var(--bg-card);
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
    gap: 3px;
    min-height: 5px;
  }

  .assignment-dots i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }

  .assignment-dots .note-dot {
    background: var(--warning-color);
  }

  .daily-summary {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .daily-summary div {
    background: var(--bg-input);
    border-radius: 12px;
    padding: 12px;
    display: grid;
    gap: 4px;
  }

  .daily-summary strong {
    font-size: 22px;
  }

  .daily-summary span,
  .task-meta,
  .task-info p {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .add-note-btn,
  .submit-note-btn {
    border: none;
    border-radius: 12px;
    cursor: pointer;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .add-note-btn {
    background: var(--text-primary);
    color: var(--bg-card);
    padding: 10px 12px;
  }

  .tasks-list,
  .notes-list {
    display: grid;
    gap: 10px;
  }

  .task-item,
  .note-item {
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: var(--bg-card);
  }

  .task-status {
    color: var(--success-color);
    flex-shrink: 0;
    margin-top: 2px;
  }

  .task-info {
    flex: 1;
    min-width: 0;
  }

  .task-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;
  }

  .task-header h3 {
    font-size: 14px;
    margin: 0;
  }

  .task-info p {
    margin-bottom: 8px;
  }

  .task-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .task-meta span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .status-pill {
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 800;
    white-space: nowrap;
  }

  .status-pill.warning {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .status-pill.info {
    background: var(--bg-info-subtle);
    color: var(--info-color);
  }

  .status-pill.success {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }

  .status-pill.muted {
    background: var(--bg-input);
    color: var(--text-secondary);
  }

  .note-swipe-wrapper {
    position: relative;
    overflow: hidden;
    border-radius: 12px;
  }

  .note-item {
    color: var(--warning-color);
    position: relative;
    z-index: 2;
    transition: transform 0.25s ease;
  }

  .note-item.swiped {
    transform: translateX(-70px);
  }

  .note-item p {
    margin: 0;
    color: var(--text-primary);
    font-size: 14px;
  }

  .delete-action-bg {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 70px;
    background: var(--danger-color);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .empty-state {
    min-height: 112px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text-secondary);
    text-align: center;
    border: 1px dashed var(--border-color);
    border-radius: 12px;
    padding: 18px;
  }

  .muted-icon {
    color: var(--text-secondary);
  }

  .add-note-form {
    display: grid;
    gap: 14px;
  }

  .add-note-form h2 {
    font-size: 20px;
  }

  .add-note-form > p {
    color: var(--text-secondary);
    font-size: 14px;
    margin-top: -8px;
  }

  label {
    display: grid;
    gap: 7px;
  }

  textarea {
    width: 100%;
    border: 1px solid var(--border-color);
    background: var(--bg-input);
    color: var(--text-primary);
    border-radius: 12px;
    padding: 12px;
    font-size: 14px;
    resize: vertical;
  }

  .submit-note-btn {
    background: var(--text-primary);
    color: var(--bg-card);
    min-height: 48px;
  }

  .submit-note-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  @media (min-width: 920px) {
    .calendar-content {
      grid-template-columns: minmax(0, 1.1fr) minmax(340px, 0.9fr);
      align-items: start;
    }

    .records-panel {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 640px) {
    header,
    .calendar-content {
      padding-inline: 16px;
    }

    .task-header {
      display: grid;
    }
  }
</style>
