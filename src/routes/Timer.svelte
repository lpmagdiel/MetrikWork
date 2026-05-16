<script>
  import { onDestroy, onMount } from "svelte";
  import {
    BriefcaseBusiness,
    Check,
    Clock,
    Flag,
    Hourglass,
    Play,
    RotateCcw,
    Save,
    Square,
    TimerReset,
  } from "lucide-svelte";
  import Toast from "../components/Toast.svelte";
  import {
    registerWorkday,
    selectedTeamId,
    teamsStore,
    userStore,
    applyWorkdayOvertimeLimit,
    exceedsOvertimeLimit,
    getOvertimeLimitHours,
    getOvertimeLimitMessage,
    getTodayDateString,
    isNonWorkingDay,
    getNonWorkingDayMessage,
  } from "../data/stores.js";
  import { showErrorAlert, showSuccessAlert } from "../data/alerts.js";
  import TitleHeader from "../components/TitleHeader.svelte";

  const ACTIVE_TIMER_KEY = "metricwork.activeVariableTimer";

  let activeTeamId = $state("");
  let taskTitle = $state("");
  let note = $state("");
  let timerMode = $state("variable");
  let startedAt = $state(null);
  let endedAt = $state(null);
  let now = $state(Date.now());
  let intervalId = null;
  let isSaving = $state(false);
  let messageToast = $state("");
  let typeToast = $state("success");
  let showToast = $state(false);
  let lastEntry = $state(null);

  let selectedTeam = $derived(
    $teamsStore.find((team) => team.id === activeTeamId) || null,
  );
  let overtimeLimitHours = $derived(getOvertimeLimitHours(selectedTeam));
  let todayDate = $derived(getTodayDateString());
  let isTodayNonWorkingDay = $derived(isNonWorkingDay(selectedTeam, todayDate));
  let todayNonWorkingMessage = $derived(getNonWorkingDayMessage(selectedTeam, todayDate));
  let isRunning = $derived(Boolean(startedAt && !endedAt));
  let elapsedSeconds = $derived.by(() => {
    if (!startedAt) return 0;
    const end = endedAt || now;
    return Math.max(0, Math.floor((end - startedAt.getTime()) / 1000));
  });
  let canStart = $derived(Boolean(activeTeamId && taskTitle.trim() && !isRunning && !isTodayNonWorkingDay));
  let canFinish = $derived(Boolean(isRunning && elapsedSeconds > 0));

  $effect(() => {
    const preferredTeamId = $selectedTeamId || $teamsStore[0]?.id || "";
    if (!activeTeamId && preferredTeamId) {
      activeTeamId = preferredTeamId;
    }
  });

  $effect(() => {
    if (isRunning) {
      persistActiveTimer();
    }
  });

  onMount(() => {
    restoreActiveTimer();
  });

  function showNotification(message, type = "success") {
    messageToast = message;
    typeToast = type;
    showToast = true;
    setTimeout(() => {
      showToast = false;
    }, 3000);
  }

  function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function formatHour(date) {
    if (!date) return "--:--";
    return date.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatHours(seconds) {
    return (seconds / 3600).toFixed(2);
  }

  function startTicker() {
    stopTicker();
    now = Date.now();
    intervalId = setInterval(() => {
      now = Date.now();
    }, 1000);
  }

  function persistActiveTimer() {
    if (!startedAt || endedAt) return;
    try {
      localStorage.setItem(
        ACTIVE_TIMER_KEY,
        JSON.stringify({
          activeTeamId,
          taskTitle,
          note,
          timerMode,
          startedAt: startedAt.toISOString(),
        }),
      );
    } catch (error) {
      console.warn("No se pudo guardar el timer activo:", error);
    }
  }

  function clearActiveTimer() {
    try {
      localStorage.removeItem(ACTIVE_TIMER_KEY);
    } catch (error) {
      console.warn("No se pudo limpiar el timer activo:", error);
    }
  }

  function restoreActiveTimer() {
    try {
      const rawTimer = localStorage.getItem(ACTIVE_TIMER_KEY);
      if (!rawTimer) return;

      const savedTimer = JSON.parse(rawTimer);
      const savedStart = new Date(savedTimer.startedAt);
      if (Number.isNaN(savedStart.getTime())) {
        clearActiveTimer();
        return;
      }

      activeTeamId = savedTimer.activeTeamId || activeTeamId;
      taskTitle = savedTimer.taskTitle || "";
      note = savedTimer.note || "";
      timerMode = savedTimer.timerMode === "overtime" ? "overtime" : "variable";
      startedAt = savedStart;
      endedAt = null;
      startTicker();
      showNotification("Timer activo recuperado.");
    } catch (error) {
      console.warn("No se pudo recuperar el timer activo:", error);
      clearActiveTimer();
    }
  }

  function startTimer() {
    if (isTodayNonWorkingDay) {
      showNotification(todayNonWorkingMessage, "error");
      return;
    }

    if (!canStart) {
      showNotification("Selecciona un equipo y escribe la tarea antes de iniciar.", "error");
      return;
    }
    startedAt = new Date();
    endedAt = null;
    startTicker();
    persistActiveTimer();
  }

  function stopTicker() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function cancelTimer() {
    stopTicker();
    clearActiveTimer();
    startedAt = null;
    endedAt = null;
    now = Date.now();
  }

  async function finishTimer() {
    if (!canFinish || !selectedTeam || !$userStore?.uid) return;

    const finishDate = new Date();
    endedAt = finishDate;
    stopTicker();
    isSaving = true;

    const totalSeconds = Math.max(
      1,
      Math.floor((finishDate.getTime() - startedAt.getTime()) / 1000),
    );
    const totalHours = Number(formatHours(totalSeconds));

    try {
      if (isTodayNonWorkingDay) {
        endedAt = null;
        startTicker();
        persistActiveTimer();
        await showErrorAlert("Día no laborable", todayNonWorkingMessage);
        return;
      }

      if (timerMode === "overtime" && exceedsOvertimeLimit(totalHours, selectedTeam)) {
        endedAt = null;
        startTicker();
        persistActiveTimer();
        await showErrorAlert("Límite de horas extra", getOvertimeLimitMessage(selectedTeam));
        return;
      }

      const workDayToRegister = applyWorkdayOvertimeLimit(
        {
          type: "variable",
          overtimeHours: timerMode === "overtime" ? totalHours : 0,
          variableHours: totalHours,
          durationHours: totalHours,
          durationSeconds: totalSeconds,
          startedAt: startedAt.toISOString(),
          endedAt: finishDate.toISOString(),
          taskTitle: taskTitle.trim(),
          note: note.trim(),
          timerMode,
        },
        selectedTeam,
      );

      await registerWorkday(
        selectedTeam.id,
        $userStore.uid,
        $userStore.name || $userStore.email,
        workDayToRegister,
      );

      const savedSeconds = Number(workDayToRegister.durationSeconds) || totalSeconds;
      lastEntry = {
        teamName: selectedTeam.name || selectedTeam.team || "Equipo",
        taskTitle: taskTitle.trim(),
        duration: formatTime(savedSeconds),
        startedAt,
        endedAt: finishDate,
        timerMode,
      };
      taskTitle = "";
      note = "";
      startedAt = null;
      endedAt = null;
      now = Date.now();
      clearActiveTimer();
      await showSuccessAlert(
        timerMode === "overtime" ? "Horas extra registradas" : "Jornada registrada",
        overtimeLimitHours > 0 && totalHours > overtimeLimitHours && timerMode === "variable"
          ? `Jornada registrada con el máximo permitido: ${overtimeLimitHours}h.`
          : "Jornada variable registrada correctamente.",
      );
    } catch (error) {
      console.error("Error registering variable workday:", error);
      endedAt = null;
      startTicker();
      persistActiveTimer();
      await showErrorAlert(
        "Error al registrar jornada",
        error?.message || "No se pudo registrar la jornada variable.",
      );
    } finally {
      isSaving = false;
    }
  }

  onDestroy(() => {
    stopTicker();
  });
</script>

<div class="timer-page">
  <Toast message={messageToast} type={typeToast} show={showToast} />

  <header class="timer-header">
    <TitleHeader title="Jornada variable" icon={Clock} iconPosition="right" description="Registra tu tiempo trabajando."/>
    <div class="status-pill" class:active={isRunning}>
      {#if isRunning}
        <Hourglass size={18} />
        <span>En curso</span>
      {:else}
        <Clock size={18} />
        <span>Disponible</span>
      {/if}
    </div>
  </header>

  <main class="timer-layout">
    <section class="work-panel">
      <div class="section-heading">
        <BriefcaseBusiness size={20} />
        <h2>Datos de la jornada</h2>
      </div>

      <label for="team">Equipo de trabajo</label>
      <div class="select-shell">
        <select id="team" bind:value={activeTeamId} disabled={isRunning || isSaving}>
          <option value="" disabled>Selecciona un equipo</option>
          {#each $teamsStore as team (team.id)}
            <option value={team.id}>{team.name || team.team || "Equipo sin nombre"}</option>
          {/each}
        </select>
      </div>

      <label for="task">Tarea</label>
      <input
        id="task"
        type="text"
        bind:value={taskTitle}
        disabled={isRunning || isSaving}
        placeholder="Ej. Instalación, soporte, revisión..."
      />

      <div class="mode-tabs" aria-label="Tipo de registro">
        <button
          type="button"
          class:active={timerMode === "variable"}
          disabled={isRunning || isSaving}
          onclick={() => (timerMode = "variable")}
        >
          <Clock size={16} />
          Jornada
        </button>
        <button
          type="button"
          class:active={timerMode === "overtime"}
          disabled={isRunning || isSaving || isTodayNonWorkingDay}
          onclick={() => {
            if (!isTodayNonWorkingDay) timerMode = "overtime";
          }}
        >
          <TimerReset size={16} />
          Extra
        </button>
      </div>

      <label for="note">Nota opcional</label>
      <textarea
        id="note"
        bind:value={note}
        disabled={isSaving}
        placeholder="Detalle breve para el equipo"
      ></textarea>
    </section>

    <section class="clock-panel">
      <div class="timer-face" class:running={isRunning}>
        <div class="face-content">
          <span>Tipo de jornada: {timerMode === "overtime" ? "Horas extra" : "Variable"}</span>
          <strong>{formatTime(elapsedSeconds)}</strong>
          <small>{formatHours(elapsedSeconds)} h</small>
          {#if overtimeLimitHours > 0}
            <small>Máximo: {overtimeLimitHours} h</small>
          {/if}
        </div>
      </div>

      <div class="timeline">
        <div>
          <Flag size={16} />
          <span>Inicio</span>
          <strong>{formatHour(startedAt)}</strong>
        </div>
        <div>
          <Square size={16} />
          <span>Final</span>
          <strong>{formatHour(endedAt)}</strong>
        </div>
      </div>

      {#if isTodayNonWorkingDay}
        <p class="form-note error">{todayNonWorkingMessage}</p>
      {/if}

      <div class="actions">
        {#if isRunning}
          <button class="finish-btn" onclick={finishTimer} disabled={!canFinish || isSaving}>
            {#if isSaving}
              <Save size={18} />
              Guardando
            {:else}
              <Check size={18} />
              Finalizar
            {/if}
          </button>
          <button class="ghost-btn icon-only" onclick={cancelTimer} aria-label="Cancelar registro">
            <RotateCcw size={18} />
          </button>
        {:else}
          <button class="start-btn" onclick={startTimer} disabled={!canStart || isSaving}>
            <Play size={18} />
            Iniciar
          </button>
        {/if}
      </div>
    </section>
  </main>

  {#if lastEntry}
    <section class="last-entry">
      <div>
        <p>Ultimo registro</p>
        <h2>{lastEntry.taskTitle}</h2>
      </div>
      <div class="entry-meta">
        <span>{lastEntry.teamName}</span>
        <strong>{lastEntry.duration}</strong>
        <span>{formatHour(lastEntry.startedAt)} - {formatHour(lastEntry.endedAt)}</span>
      </div>
    </section>
  {/if}
</div>

<style>
  .timer-page {
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    padding: 24px 20px var(--bottom-nav-clearance);
    padding-top: var(--page-top-safe);
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: var(--bg-page);
    color: var(--text-primary);
  }

  .timer-header,
  .timer-layout,
  .last-entry {
    width: min(100%, 980px);
    margin: 0 auto;
  }

  .timer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 4px;
    flex-shrink: 0;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    font-size: 22px;
    font-weight: 800;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .status-pill {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 12px;
    border: none;
    border-radius: 999px;
    background: var(--bg-card);
    color: var(--text-secondary);
    box-shadow: var(--shadow-soft);
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
  }

  .status-pill.active {
    color: var(--success-color);
    background: var(--bg-success-subtle);
  }

  .timer-layout {
    display: grid;
    grid-template-columns: minmax(280px, 0.95fr) minmax(300px, 1.05fr);
    gap: 14px;
    align-items: start;
  }

  .work-panel,
  .clock-panel,
  .last-entry {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
  }

  .work-panel {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 2px;
    color: var(--text-primary);
  }

  .section-heading h2 {
    font-size: 17px;
    font-weight: 800;
  }

  label {
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 700;
  }

  input,
  select,
  textarea {
    width: 100%;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.18s ease, box-shadow 0.18s ease;
  }

  input,
  select {
    min-height: 46px;
    padding: 0 12px;
  }

  textarea {
    min-height: 88px;
    padding: 12px;
    resize: vertical;
    line-height: 1.45;
  }

  input:focus,
  select:focus,
  textarea:focus {
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 22%, transparent);
  }

  .select-shell {
    position: relative;
  }

  .form-note {
    margin: 0;
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    background: var(--bg-input);
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.35;
  }

  .form-note.error {
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
  }

  .mode-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 0 0 2px;
  }

  .mode-tabs button,
  .start-btn,
  .finish-btn,
  .ghost-btn {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    border-radius: var(--radius-sm);
    border: none;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    transition: transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
  }

  .mode-tabs button {
    background: var(--bg-input);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    box-shadow: none;
  }

  .mode-tabs button.active {
    border-color: var(--accent-color);
    background: var(--bg-accent-subtle);
    color: var(--accent-ink);
  }

  .clock-panel {
    padding: 16px;
    display: grid;
    grid-template-rows: 1fr auto auto;
    gap: 12px;
  }

  .timer-face {
    min-height: 246px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background: var(--bg-input);
    position: relative;
    overflow: hidden;
  }


  .timer-face.running {
    background: var(--bg-card);
  }

  .face-content {
    width: min(82%, 360px);
    min-height: 170px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 8px;
    z-index: 1;
  }

  .face-content span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .face-content strong {
    color: var(--text-primary);
    font-size: clamp(2.45rem, 6vw, 4.3rem);
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .face-content small {
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 700;
  }

  .timeline {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .timeline div,
  .last-entry {
    padding: 12px;
  }

  .timeline div {
    min-height: 70px;
    display: grid;
    gap: 5px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
  }

  .timeline span,
  .last-entry p,
  .entry-meta span {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
  }

  .timeline strong,
  .entry-meta strong {
    color: var(--text-primary);
    font-size: 17px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
  }

  .start-btn,
  .finish-btn {
    border: none;
    color: #fff;
    background: var(--accent-color);
    box-shadow: var(--shadow-button);
  }

  .finish-btn {
    color: white;
    background: var(--success-color);
  }

  .ghost-btn {
    width: 44px;
    background: var(--bg-input);
    color: var(--text-primary);
  }

  button:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  button:disabled,
  input:disabled,
  select:disabled,
  textarea:disabled {
    opacity: 0.58;
    cursor: not-allowed;
  }

  .last-entry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }

  .last-entry h2 {
    margin-top: 4px;
    color: var(--text-primary);
    font-size: 1.08rem;
  }

  .entry-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  @media (max-width: 860px) {
    .timer-layout {
      grid-template-columns: 1fr;
    }

    .clock-panel {
      order: -1;
    }

    .timer-face {
      min-height: 230px;
    }
  }

  @media (max-width: 560px) {
    .timer-page {
      padding: 20px 16px var(--bottom-nav-clearance);
      padding-top: var(--page-top-safe);
      gap: 14px;
    }

    .timer-header,
    .last-entry {
      align-items: flex-start;
      flex-direction: column;
    }

    .status-pill {
      width: 100%;
      justify-content: center;
    }

    .work-panel,
    .clock-panel {
      padding: 16px;
    }

    .timer-face {
      min-height: 214px;
    }

    .face-content strong {
      font-size: clamp(2.25rem, 12vw, 3.2rem);
    }

    .timeline,
    .mode-tabs {
      grid-template-columns: 1fr;
    }

    .entry-meta {
      justify-content: flex-start;
    }
  }
</style>
