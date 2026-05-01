<script>
  import {
    ChevronLeft,
    ChevronRight,
    Clock,
    CheckCircle2,
    Circle,
    StickyNote,
    Plus,
    Send,
    Trash2,
  } from "lucide-svelte";
  import {
    tasksStore,
    notesStore,
    addNote,
    deleteNote,
  } from "../data/stores.js";
  import SliceContainer from "../components/SliceContainer.svelte";
  import { useSwipe } from "svelte-gestures";

  let currentDate = $state(new Date());
  let selectedDate = $state(new Date());
  let showAddNote = $state(false);
  let newNoteContent = $state("");
  let isSubmittingNote = $state(false);
  let swipedNoteId = $state(null);

  const daysOfWeek = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const months = [
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
  const monthShort = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];

  let calendarDays = $derived.by(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const prevMonthDays = new Date(year, month, 0).getDate();

    let days = [];

    // Previous month placeholders
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      days.push({
        day: prevMonthDays - i,
        month: month - 1,
        year: year,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        month: month,
        year: year,
        isCurrentMonth: true,
      });
    }

    // Next month placeholders
    const totalDays = 42; // 6 rows of 7 days
    const remainingDays = totalDays - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        day: i,
        month: month + 1,
        year: year,
        isCurrentMonth: false,
      });
    }

    return days;
  });

  let tasksForSelectedDate = $derived(
    $tasksStore.filter((task) => {
      if (!task.dueDate) return false;
      const taskDate = new Date(task.dueDate);
      return (
        taskDate.getDate() === selectedDate.getDate() &&
        taskDate.getMonth() === selectedDate.getMonth() &&
        taskDate.getFullYear() === selectedDate.getFullYear()
      );
    }),
  );

  let notesForSelectedDate = $derived(
    $notesStore.filter((note) => {
      if (!note.date) return false;
      const noteDate = new Date(note.date);
      return (
        noteDate.getDate() === selectedDate.getDate() &&
        noteDate.getMonth() === selectedDate.getMonth() &&
        noteDate.getFullYear() === selectedDate.getFullYear()
      );
    }),
  );

  function hasTasks(dateObj) {
    return $tasksStore.some((task) => {
      if (!task.dueDate) return false;
      const taskDate = new Date(task.dueDate);
      return (
        taskDate.getDate() === dateObj.day &&
        taskDate.getMonth() === dateObj.month &&
        taskDate.getFullYear() === dateObj.year
      );
    });
  }

  function hasNotes(dateObj) {
    return $notesStore.some((note) => {
      if (!note.date) return false;
      const noteDate = new Date(note.date);
      return (
        noteDate.getDate() === dateObj.day &&
        noteDate.getMonth() === dateObj.month &&
        noteDate.getFullYear() === dateObj.year
      );
    });
  }

  async function handleAddNote() {
    if (newNoteContent.trim() === "") return;
    isSubmittingNote = true;
    try {
      await addNote(newNoteContent, selectedDate);
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
    } else if (event.detail.direction === "right") {
      if (swipedNoteId === noteId) swipedNoteId = null;
    }
  }

  async function confirmDeleteNote(noteId) {
    try {
      await deleteNote(noteId);
      if (swipedNoteId === noteId) swipedNoteId = null;
    } catch (error) {
      alert("Error al eliminar la nota");
    }
  }

  function nextMonth() {
    currentDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      1,
    );
  }

  function prevMonth() {
    currentDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - 1,
      1,
    );
  }

  function selectDate(dateObj) {
    selectedDate = new Date(dateObj.year, dateObj.month, dateObj.day);
  }

  function isToday(dateObj) {
    const today = new Date();
    return (
      dateObj.day === today.getDate() &&
      dateObj.month === today.getMonth() &&
      dateObj.year === today.getFullYear()
    );
  }

  function isSelected(dateObj) {
    return (
      dateObj.day === selectedDate.getDate() &&
      dateObj.month === selectedDate.getMonth() &&
      dateObj.year === selectedDate.getFullYear()
    );
  }
</script>

<div class="calendar-page">
  <header>
    <h1>Calendario</h1>
    <div class="month-nav">
      <button onclick={prevMonth} class="nav-btn"
        ><ChevronLeft size={20} /></button
      >
      <h2>{months[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
      <button onclick={nextMonth} class="nav-btn"
        ><ChevronRight size={20} /></button
      >
    </div>
  </header>

  <div class="calendar-card">
    <div class="weekdays">
      {#each daysOfWeek as day}
        <div class="weekday">{day}</div>
      {/each}
    </div>
    <div class="days-grid">
      {#each calendarDays as dateObj}
        <button
          class="day-btn"
          class:current-month={dateObj.isCurrentMonth}
          class:today={isToday(dateObj)}
          class:selected={isSelected(dateObj)}
          onclick={() => selectDate(dateObj)}
        >
          <span class="day-number">{dateObj.day}</span>
          <div class="dots-container">
            {#if hasTasks(dateObj)}
              <div class="task-dot"></div>
            {/if}
            {#if hasNotes(dateObj)}
              <div class="note-dot"></div>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  </div>

  <section class="tasks-section">
    <div class="section-header">
      <h3>Día {selectedDate.getDate()} de {monthShort[selectedDate.getMonth()]}</h3>
      <button class="add-note-btn" onclick={() => (showAddNote = true)}>
        <Plus size={16} />
        <span>Agregar Nota</span>
      </button>
    </div>

    <div class="daily-content">
      <div class="content-group">
        <h4>Tareas</h4>
        <div class="tasks-list">
          {#if tasksForSelectedDate.length > 0}
            {#each tasksForSelectedDate as task}
              <div class="task-item">
                <div class="task-status">
                  {#if task.completed}
                    <CheckCircle2 size={20} color="#4CAF50" />
                  {:else}
                    <Circle size={20} color="#878787" />
                  {/if}
                </div>
                <div class="task-info">
                  <h5>{task.title}</h5>
                  <div class="task-meta">
                    <Clock size={12} />
                    <span>{task.time || "Todo el día"}</span>
                  </div>
                </div>
              </div>
            {/each}
          {:else}
            <p class="empty-msg">No hay tareas.</p>
          {/if}
        </div>
      </div>

      <div class="content-group">
        <h4>Notas</h4>
        <div class="notes-list">
          {#if notesForSelectedDate.length > 0}
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
                  <Trash2 size={24} color="white" />
                </button>
                <div class="note-item" class:swiped={swipedNoteId === note.id}>
                  <StickyNote size={18} color="#FF9800" />
                  <p>{note.content}</p>
                </div>
              </div>
            {/each}
          {:else}
            <p class="empty-msg">No hay notas.</p>
          {/if}
        </div>
      </div>
    </div>
  </section>

  <SliceContainer bind:show={showAddNote}>
    <div class="add-note-form">
      <h2>Nueva Nota</h2>
      <p>
        Agrega un recordatorio personal para el {selectedDate.getDate()} de {months[
          selectedDate.getMonth()
        ]}.
      </p>

      <div class="note-input-container">
        <textarea
          placeholder="Escribe tu nota aquí..."
          bind:value={newNoteContent}
          rows="4"
        ></textarea>
      </div>

      <button
        class="submit-note-btn"
        onclick={handleAddNote}
        disabled={isSubmittingNote || !newNoteContent.trim()}
      >
        {#if isSubmittingNote}
          <span>Guardando...</span>
        {:else}
          <Send size={20} />
          <span>Guardar Nota</span>
        {/if}
      </button>
    </div>
  </SliceContainer>
</div>

<style>
  .calendar-page {
    padding: 22px 18px var(--bottom-nav-clearance);
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(circle at 18% 2%, rgba(255, 223, 118, 0.18), transparent 34%),
      var(--bg-page);
    overflow-y: auto;
  }

  header {
    margin-bottom: 24px;
  }

  h1 {
    margin: 0 0 16px;
    font-size: 32px;
    font-weight: 700;
  }

  .month-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-card-raised);
    padding: 9px 12px;
    border: 1px solid var(--border-color);
    border-radius: 22px;
    box-shadow: var(--shadow-card);
    backdrop-filter: blur(14px);
  }

  .month-nav h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .nav-btn {
    width: 42px;
    height: 42px;
    justify-content: center;
    background: var(--bg-accent-subtle);
    border: none;
    color: var(--accent-color);
    border-radius: 15px;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
  }

  .calendar-card {
    background: var(--bg-card-raised);
    border: 1px solid var(--border-color);
    border-radius: 28px;
    padding: 18px;
    box-shadow: var(--shadow-card);
    backdrop-filter: blur(14px);
    margin-bottom: 26px;
  }

  .weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    margin-bottom: 12px;
  }

  .weekday {
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .days-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
  }

  .day-btn {
    aspect-ratio: 1;
    background: none;
    border: none;
    border-radius: 15px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    position: relative;
    color: var(--text-muted);
    font-size: 15px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .day-btn.current-month {
    color: var(--text-primary);
  }

  .day-btn.today {
    color: var(--accent-color);
    font-weight: 700;
  }

  .day-btn.selected {
    background:
      linear-gradient(135deg, #ffdf76, var(--accent-color)),
      var(--accent-color);
    color: #24110e;
    box-shadow: 0 10px 20px var(--shadow-button);
  }

  .dots-container {
    display: flex;
    gap: 2px;
    position: absolute;
    bottom: 6px;
  }

  .task-dot {
    width: 4px;
    height: 4px;
    background: currentColor;
    border-radius: 50%;
  }

  .note-dot {
    width: 4px;
    height: 4px;
    background: var(--warning-color);
    border-radius: 50%;
  }


  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .section-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .add-note-btn {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
    border: none;
    padding: 8px 12px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .daily-content {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .content-group h4 {
    margin: 0 0 12px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
  }

  .tasks-list,
  .notes-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .task-item,
  .note-item {
    background: var(--bg-card-raised);
    border: 1px solid var(--border-color);
    padding: 16px;
    border-radius: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: var(--shadow-card);
    backdrop-filter: blur(14px);
    position: relative;
    z-index: 2;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .note-swipe-wrapper {
    position: relative;
    overflow: hidden;
    border-radius: 16px;
  }

  .note-item.swiped {
    transform: translateX(-70px);
  }

  .delete-action-bg {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 70px;
    background: var(--bg-danger-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
    border-radius: 0 16px 16px 0;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .note-item p {
    margin: 0;
    font-size: 15px;
    color: var(--text-primary);
  }

  .task-info h5 {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 600;
  }

  .task-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .empty-msg {
    margin: 0;
    font-size: 14px;
    color: var(--text-muted);
    font-style: italic;
  }

  .add-note-form {
    padding: 20px;
  }

  .add-note-form h2 {
    margin: 0 0 8px;
    font-size: 22px;
  }

  .add-note-form p {
    color: var(--text-secondary);
    font-size: 14px;
    margin-bottom: 24px;
  }

  .note-input-container {
    background: var(--bg-input);
    padding: 16px;
    border-radius: 16px;
    margin-bottom: 24px;
  }

  textarea {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    font-size: 16px;
    font-family: inherit;
    resize: none;
    color: var(--text-primary);
  }

  .submit-note-btn {
    width: 100%;
    padding: 16px;
    background:
      linear-gradient(135deg, #ffdf76, var(--accent-color)),
      var(--accent-color);
    color: #24110e;
    border: none;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
  }

  .submit-note-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
