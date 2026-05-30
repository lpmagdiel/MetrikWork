<script>
  import { onDestroy, onMount } from "svelte";
  import {
    BriefcaseBusiness,
    Bookmark,
    Check,
    Clock,
    Coffee,
    Flag,
    Hourglass,
    Play,
    RotateCcw,
    Save,
    Square,
    Trash2,
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
    hasOvertimeEnabled,
    getOvertimeLimitHours,
    getOvertimeLimitMessage,
    getTodayDateString,
    isNonWorkingDay,
    getNonWorkingDayMessage,
    teamTemplatesStore,
    subscribeToTeamTemplates,
    addTeamTemplate,
    deleteTeamTemplate,
  } from "../data/stores.js";
  import { getCurrentGpsPosition } from "../data/geolocation.js";
  import { showErrorAlert, showSuccessAlert } from "../data/alerts.js";
  import { normalizeCoordinates } from "../helpers/navigation.js";
  import TitleHeader from "../components/TitleHeader.svelte";

  const ACTIVE_TIMER_KEY = "metricwork.activeVariableTimer";
  const POMODORO_FOCUS_SECONDS = 25 * 60;
  const POMODORO_SHORT_BREAK_SECONDS = 5 * 60;
  const POMODORO_LONG_BREAK_SECONDS = 15 * 60;

  let activeTeamId = $state("");
  let taskTitle = $state("");
  let note = $state("");
  let timerMode = $state("variable");
  let pomodoroEnabled = $state(false);
  let pomodoroPhase = $state("focus");
  let pomodoroCycle = $state(1);
  let pomodoroPhaseStartedAt = $state(null);
  let accumulatedFocusSeconds = $state(0);
  let completedPomodoros = $state(0);
  let startedAt = $state(null);
  let endedAt = $state(null);
  let now = $state(Date.now());
  let intervalId = null;
  let isSaving = $state(false);
  let messageToast = $state("");
  let typeToast = $state("success");
  let showToast = $state(false);
  let lastEntry = $state(null);
  let checkInLocation = $state(null);
  let checkOutLocation = $state(null);
  let isCapturingLocation = $state(false);
  let workdayTemplateName = $state("");
  let isSavingTemplate = $state(false);
  let deletingTemplateId = $state("");

  let selectedTeam = $derived(
    $teamsStore.find((team) => team.id === activeTeamId) || null,
  );
  let overtimeLimitHours = $derived(getOvertimeLimitHours(selectedTeam));
  let overtimeEnabled = $derived(hasOvertimeEnabled(selectedTeam));
  let todayDate = $derived(getTodayDateString());
  let isTodayNonWorkingDay = $derived(isNonWorkingDay(selectedTeam, todayDate));
  let todayNonWorkingMessage = $derived(getNonWorkingDayMessage(selectedTeam, todayDate));
  let isRunning = $derived(Boolean(startedAt && !endedAt));
  let elapsedSeconds = $derived.by(() => {
    if (!startedAt) return 0;
    const end = endedAt || now;
    return Math.max(0, Math.floor((end - startedAt.getTime()) / 1000));
  });
  let pomodoroPhaseDurationSeconds = $derived(
    getPomodoroPhaseDurationSeconds(pomodoroPhase, completedPomodoros),
  );
  let pomodoroPhaseElapsedSeconds = $derived.by(() => {
    if (!pomodoroEnabled || !pomodoroPhaseStartedAt) return 0;
    return Math.max(0, Math.floor((now - pomodoroPhaseStartedAt.getTime()) / 1000));
  });
  let pomodoroRemainingSeconds = $derived(
    Math.max(0, pomodoroPhaseDurationSeconds - pomodoroPhaseElapsedSeconds),
  );
  let pomodoroProgress = $derived.by(() => {
    if (!pomodoroEnabled || pomodoroPhaseDurationSeconds <= 0) return 0;
    return Math.min(100, (pomodoroPhaseElapsedSeconds / pomodoroPhaseDurationSeconds) * 100);
  });
  let trackedWorkSeconds = $derived.by(() => getTrackedWorkSeconds(now));
  let pomodoroPhaseLabel = $derived(pomodoroPhase === "break" ? "Descanso" : "Enfoque");
  let canStart = $derived(Boolean(activeTeamId && taskTitle.trim() && !isRunning && !isTodayNonWorkingDay && !isCapturingLocation));
  let canFinish = $derived(Boolean(isRunning && trackedWorkSeconds > 0));

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

  $effect(() => {
    if (!isRunning && !overtimeEnabled && timerMode === "overtime") {
      timerMode = "variable";
    }
  });

  $effect(() => {
    if (activeTeamId) {
      return subscribeToTeamTemplates(activeTeamId, "workday");
    }
    return subscribeToTeamTemplates(null);
  });

  $effect(() => {
    if (isRunning && pomodoroEnabled) {
      syncPomodoro(now);
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

  function getPomodoroBreakSeconds(completedFocusSessions) {
    return completedFocusSessions > 0 && completedFocusSessions % 4 === 0
      ? POMODORO_LONG_BREAK_SECONDS
      : POMODORO_SHORT_BREAK_SECONDS;
  }

  function getPomodoroPhaseDurationSeconds(phase, completedFocusSessions) {
    return phase === "break"
      ? getPomodoroBreakSeconds(completedFocusSessions)
      : POMODORO_FOCUS_SECONDS;
  }

  function getTrackedWorkSeconds(timestamp = Date.now()) {
    if (!startedAt) return 0;

    if (!pomodoroEnabled) {
      const end = endedAt?.getTime() || timestamp;
      return Math.max(0, Math.floor((end - startedAt.getTime()) / 1000));
    }

    let seconds = accumulatedFocusSeconds;
    if (pomodoroPhase === "focus" && pomodoroPhaseStartedAt) {
      const currentFocusSeconds = Math.max(
        0,
        Math.floor((timestamp - pomodoroPhaseStartedAt.getTime()) / 1000),
      );
      seconds += Math.min(POMODORO_FOCUS_SECONDS, currentFocusSeconds);
    }

    return seconds;
  }

  function resetPomodoroProgress() {
    pomodoroPhase = "focus";
    pomodoroCycle = 1;
    pomodoroPhaseStartedAt = null;
    accumulatedFocusSeconds = 0;
    completedPomodoros = 0;
  }

  function handlePomodoroToggle(event) {
    pomodoroEnabled = event.currentTarget.checked;
    resetPomodoroProgress();
  }

  function applyWorkdayTemplate(template) {
    if (isRunning || isSaving) return;
    const payload = template?.payload || {};
    taskTitle = payload.taskTitle || "";
    note = payload.note || "";
    timerMode =
      payload.timerMode === "overtime" && overtimeEnabled
        ? "overtime"
        : "variable";
    pomodoroEnabled = Boolean(payload.pomodoroEnabled);
    resetPomodoroProgress();
    workdayTemplateName = template?.name || "";
  }

  async function handleSaveWorkdayTemplate() {
    if (!activeTeamId || !taskTitle.trim() || isSavingTemplate) return;
    isSavingTemplate = true;

    try {
      await addTeamTemplate(
        activeTeamId,
        {
          type: "workday",
          name: workdayTemplateName.trim() || taskTitle.trim(),
          payload: {
            taskTitle: taskTitle.trim(),
            note: note.trim(),
            timerMode,
            pomodoroEnabled,
          },
        },
        $userStore,
      );
      workdayTemplateName = "";
      showNotification("Plantilla de jornada guardada.");
    } catch (error) {
      console.error("Error saving workday template:", error);
      showNotification("No se pudo guardar la plantilla.", "error");
    } finally {
      isSavingTemplate = false;
    }
  }

  async function handleDeleteWorkdayTemplate(template) {
    if (!activeTeamId || !template?.id || deletingTemplateId) return;
    deletingTemplateId = template.id;

    try {
      await deleteTeamTemplate(activeTeamId, template.id);
      showNotification("Plantilla eliminada.");
    } catch (error) {
      console.error("Error deleting workday template:", error);
      showNotification("No se pudo eliminar la plantilla.", "error");
    } finally {
      deletingTemplateId = "";
    }
  }

  function canManageTemplate(template) {
    return selectedTeam?.admin === $userStore?.uid || template?.createdBy === $userStore?.uid;
  }

  function syncPomodoro(timestamp = Date.now()) {
    if (!pomodoroEnabled || !startedAt || endedAt || !pomodoroPhaseStartedAt) return;

    let phase = pomodoroPhase;
    let cycle = pomodoroCycle;
    let phaseStartMs = pomodoroPhaseStartedAt.getTime();
    let focusSeconds = accumulatedFocusSeconds;
    let completedFocusSessions = completedPomodoros;
    let switched = false;
    let guard = 0;

    while (guard < 256) {
      const phaseDurationMs =
        getPomodoroPhaseDurationSeconds(phase, completedFocusSessions) * 1000;

      if (timestamp - phaseStartMs < phaseDurationMs) break;

      phaseStartMs += phaseDurationMs;
      switched = true;

      if (phase === "focus") {
        focusSeconds += POMODORO_FOCUS_SECONDS;
        completedFocusSessions += 1;
        phase = "break";
      } else {
        phase = "focus";
        cycle += 1;
      }

      guard += 1;
    }

    if (!switched) return;

    pomodoroPhase = phase;
    pomodoroCycle = cycle;
    pomodoroPhaseStartedAt = new Date(phaseStartMs);
    accumulatedFocusSeconds = focusSeconds;
    completedPomodoros = completedFocusSessions;
    showNotification(
      phase === "break" ? "Bloque Pomodoro completado. Toca descanso." : "Descanso terminado. Nuevo bloque listo.",
    );
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
          pomodoroEnabled,
          pomodoroPhase,
          pomodoroCycle,
          pomodoroPhaseStartedAt: pomodoroPhaseStartedAt?.toISOString() || null,
          accumulatedFocusSeconds,
          completedPomodoros,
          startedAt: startedAt.toISOString(),
          checkInLocation,
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

  function normalizeLocationSnapshot(value) {
    const gps = normalizeCoordinates(value?.gps || value);
    if (!gps) return null;

    return {
      gps,
      capturedAt: value?.capturedAt || gps.updatedAt || new Date().toISOString(),
    };
  }

  function createLocationSnapshot(gps, capturedAt = new Date()) {
    const coordinates = normalizeCoordinates(gps);
    if (!coordinates) return null;

    const capturedAtIso = capturedAt.toISOString();
    return {
      gps: {
        ...coordinates,
        updatedAt: capturedAtIso,
      },
      capturedAt: capturedAtIso,
    };
  }

  async function captureLocationSnapshot(capturedAt = new Date()) {
    isCapturingLocation = true;
    try {
      const gps = await getCurrentGpsPosition();
      return createLocationSnapshot(gps, capturedAt);
    } catch (error) {
      showNotification(error?.message || "No se pudo obtener la ubicación.", "warning");
      return null;
    } finally {
      isCapturingLocation = false;
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
      pomodoroEnabled = Boolean(savedTimer.pomodoroEnabled);
      pomodoroPhase = savedTimer.pomodoroPhase === "break" ? "break" : "focus";
      pomodoroCycle = Math.max(1, Number(savedTimer.pomodoroCycle) || 1);
      pomodoroPhaseStartedAt = savedTimer.pomodoroPhaseStartedAt
        ? new Date(savedTimer.pomodoroPhaseStartedAt)
        : savedStart;
      if (Number.isNaN(pomodoroPhaseStartedAt.getTime())) {
        pomodoroPhaseStartedAt = savedStart;
      }
      accumulatedFocusSeconds = Math.max(0, Number(savedTimer.accumulatedFocusSeconds) || 0);
      completedPomodoros = Math.max(0, Number(savedTimer.completedPomodoros) || 0);
      checkInLocation = normalizeLocationSnapshot(savedTimer.checkInLocation);
      checkOutLocation = null;
      startedAt = savedStart;
      endedAt = null;
      startTicker();
      showNotification("Timer activo recuperado.");
    } catch (error) {
      console.warn("No se pudo recuperar el timer activo:", error);
      clearActiveTimer();
    }
  }

  async function startTimer() {
    if (isTodayNonWorkingDay) {
      showNotification(todayNonWorkingMessage, "error");
      return;
    }

    if (!canStart) {
      showNotification("Selecciona un equipo y escribe la tarea antes de iniciar.", "error");
      return;
    }
    const startDate = new Date();
    startedAt = startDate;
    endedAt = null;
    checkInLocation = null;
    checkOutLocation = null;
    if (pomodoroEnabled) {
      pomodoroPhase = "focus";
      pomodoroCycle = 1;
      pomodoroPhaseStartedAt = new Date(startedAt);
      accumulatedFocusSeconds = 0;
      completedPomodoros = 0;
    } else {
      resetPomodoroProgress();
    }
    startTicker();
    persistActiveTimer();

    const location = await captureLocationSnapshot(startDate);
    if (startedAt?.getTime() === startDate.getTime() && !endedAt) {
      checkInLocation = location;
      persistActiveTimer();
      showNotification(
        location ? "Entrada iniciada con GPS." : "Entrada iniciada sin GPS.",
        location ? "success" : "warning",
      );
    }
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
    checkInLocation = null;
    checkOutLocation = null;
    resetPomodoroProgress();
    now = Date.now();
  }

  async function finishTimer() {
    if (!canFinish || !selectedTeam || !$userStore?.uid) return;

    const finishDate = new Date();
    if (pomodoroEnabled) {
      syncPomodoro(finishDate.getTime());
    }
    const totalSeconds = Math.max(1, getTrackedWorkSeconds(finishDate.getTime()));
    const totalHours = Number(formatHours(totalSeconds));
    endedAt = finishDate;
    stopTicker();
    isSaving = true;

    try {
      if (isTodayNonWorkingDay) {
        endedAt = null;
        startTicker();
        persistActiveTimer();
        await showErrorAlert("Día no laborable", todayNonWorkingMessage);
        return;
      }

      if (timerMode === "overtime" && !overtimeEnabled) {
        endedAt = null;
        startTicker();
        persistActiveTimer();
        await showErrorAlert("Horas extra desactivadas", getOvertimeLimitMessage(selectedTeam));
        return;
      }

      if (timerMode === "overtime" && exceedsOvertimeLimit(totalHours, selectedTeam)) {
        endedAt = null;
        startTicker();
        persistActiveTimer();
        await showErrorAlert("Límite de horas extra", getOvertimeLimitMessage(selectedTeam));
        return;
      }

      const finishLocation = await captureLocationSnapshot(finishDate);
      checkOutLocation = finishLocation;
      const primaryLocation = checkInLocation || finishLocation;
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
          pomodoroEnabled,
          completedPomodoros,
          memberGps: primaryLocation?.gps || null,
          memberLocationCapturedAt: primaryLocation?.capturedAt || null,
          checkInGps: checkInLocation?.gps || null,
          checkInLocationCapturedAt: checkInLocation?.capturedAt || null,
          checkOutGps: finishLocation?.gps || null,
          checkOutLocationCapturedAt: finishLocation?.capturedAt || null,
        },
        selectedTeam,
      );

      const result = await registerWorkday(
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
        pomodoroEnabled,
        checkInLocation,
        checkOutLocation: finishLocation,
      };
      taskTitle = "";
      note = "";
      startedAt = null;
      endedAt = null;
      checkInLocation = null;
      checkOutLocation = null;
      resetPomodoroProgress();
      now = Date.now();
      clearActiveTimer();
      await showSuccessAlert(
        result?.queued
          ? "Guardado sin conexión"
          : timerMode === "overtime" ? "Horas extra registradas" : "Jornada registrada",
        result?.queued
          ? "El registro quedó en el dispositivo y se sincronizará al volver la conexión."
          : pomodoroEnabled
          ? "Tiempo de enfoque registrado correctamente."
          : overtimeLimitHours > 0 && totalHours > overtimeLimitHours && timerMode === "variable"
          ? `Jornada registrada con el máximo permitido: ${overtimeLimitHours}h.`
          : "Jornada variable registrada correctamente.",
      );
    } catch (error) {
      console.error("Error registering variable workday:", error);
      endedAt = null;
      checkOutLocation = null;
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

  <div class="timer-layout">
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

      {#if $teamTemplatesStore.length > 0}
        <div class="template-strip" aria-label="Plantillas de jornada">
          <div class="template-heading">
            <Bookmark size={16} />
            <span>Plantillas</span>
          </div>
          <div class="template-list">
            {#each $teamTemplatesStore as template (template.id)}
              <div class="template-chip">
                <button
                  type="button"
                  onclick={() => applyWorkdayTemplate(template)}
                  disabled={isRunning || isSaving}
                >
                  <strong>{template.name}</strong>
                  <small>{template.payload?.timerMode === "overtime" ? "Horas extra" : "Jornada"}</small>
                </button>
                {#if canManageTemplate(template)}
                  <button
                    type="button"
                    class="template-delete"
                    onclick={() => handleDeleteWorkdayTemplate(template)}
                    disabled={deletingTemplateId === template.id || isRunning || isSaving}
                    aria-label={`Eliminar plantilla ${template.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

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
          disabled={isRunning || isSaving || isTodayNonWorkingDay || !overtimeEnabled}
          onclick={() => {
            if (!isTodayNonWorkingDay && overtimeEnabled) timerMode = "overtime";
          }}
        >
          <TimerReset size={16} />
          Extra
        </button>
      </div>

      <label class="pomodoro-toggle">
        <input
          type="checkbox"
          checked={pomodoroEnabled}
          disabled={isRunning || isSaving}
          onchange={handlePomodoroToggle}
        />
        <span class="switch-track" aria-hidden="true">
          <span></span>
        </span>
        <span class="toggle-copy">
          <strong>Pomodoro</strong>
          <small>25 min / 5 min</small>
        </span>
      </label>

      <label for="note">Nota opcional</label>
      <textarea
        id="note"
        bind:value={note}
        disabled={isSaving}
        placeholder="Detalle breve para el equipo"
      ></textarea>

      <div class="template-save-box">
        <label for="workdayTemplateName">Guardar como plantilla</label>
        <div class="template-save-row">
          <input
            id="workdayTemplateName"
            type="text"
            bind:value={workdayTemplateName}
            disabled={isRunning || isSaving}
            placeholder={taskTitle || "Nombre de plantilla"}
          />
          <button
            type="button"
            onclick={handleSaveWorkdayTemplate}
            disabled={isSavingTemplate || isRunning || isSaving || !taskTitle.trim()}
          >
            {#if isSavingTemplate}
              <Save size={16} />
            {:else}
              <Bookmark size={16} />
            {/if}
          </button>
        </div>
      </div>
    </section>

    <section class="clock-panel">
      <div class="timer-face" class:running={isRunning}>
        <div class="face-content">
          {#if pomodoroEnabled}
            <span>Pomodoro · {pomodoroPhaseLabel} {pomodoroCycle}</span>
            <strong>{formatTime(pomodoroRemainingSeconds)}</strong>
            <small>{formatTime(trackedWorkSeconds)} de enfoque</small>
            <div class="pomodoro-progress" aria-hidden="true">
              <span style={`width: ${pomodoroProgress}%`}></span>
            </div>
          {:else}
            <span>Tipo de jornada: {timerMode === "overtime" ? "Horas extra" : "Variable"}</span>
            <strong>{formatTime(elapsedSeconds)}</strong>
            <small>{formatHours(elapsedSeconds)} h</small>
          {/if}
          {#if overtimeEnabled}
            <small>Máximo: {overtimeLimitHours} h</small>
          {:else}
            <small>Horas extra desactivadas</small>
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

      {#if pomodoroEnabled}
        <div class="pomodoro-stats">
          <div>
            <Clock size={16} />
            <span>Enfoque</span>
            <strong>{formatHours(trackedWorkSeconds)} h</strong>
          </div>
          <div>
            <Coffee size={16} />
            <span>Bloques</span>
            <strong>{completedPomodoros}</strong>
          </div>
        </div>
      {/if}

      {#if isTodayNonWorkingDay}
        <p class="form-note error">{todayNonWorkingMessage}</p>
      {/if}

      <div class="actions">
        {#if isRunning || isSaving}
          <button class="finish-btn" onclick={finishTimer} disabled={!canFinish || isSaving || isCapturingLocation}>
            {#if isCapturingLocation}
              <Save size={18} />
              Finalizando
            {:else if isSaving}
              <Save size={18} />
              Guardando
            {:else}
              <Check size={18} />
              Registrar salida
            {/if}
          </button>
          <button class="ghost-btn icon-only" onclick={cancelTimer} disabled={isSaving || isCapturingLocation} aria-label="Cancelar registro">
            <RotateCcw size={18} />
          </button>
        {:else}
          <button class="start-btn" onclick={startTimer} disabled={!canStart || isSaving || isCapturingLocation}>
            {#if isCapturingLocation}
              <Save size={18} />
              Iniciando
            {:else}
              <Play size={18} />
              Registrar entrada
            {/if}
          </button>
        {/if}
      </div>
    </section>
  </div>

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

  h2,
  p {
    margin: 0;
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

  .template-strip {
    display: grid;
    gap: 10px;
  }

  .template-heading {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .template-list {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }

  .template-list::-webkit-scrollbar {
    display: none;
  }

  .template-chip {
    flex: 0 0 min(220px, 72vw);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    overflow: hidden;
  }

  .template-chip > button:first-child {
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text-primary);
    text-align: left;
    padding: 10px 12px;
    display: grid;
    gap: 3px;
    cursor: pointer;
  }

  .template-chip strong,
  .template-chip small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .template-chip strong {
    font-size: 13px;
    font-weight: 800;
  }

  .template-chip small {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
  }

  .template-delete {
    width: 38px;
    border: 0;
    border-left: 1px solid var(--border-color);
    background: var(--bg-card);
    color: var(--danger-color);
    cursor: pointer;
  }

  .template-save-box {
    display: grid;
    gap: 8px;
  }

  .template-save-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 46px;
    gap: 8px;
  }

  .template-save-row input {
    min-width: 0;
  }

  .template-save-row button {
    min-height: 44px;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--bg-accent-subtle);
    color: var(--accent-ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
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

  .pomodoro-toggle {
    min-height: 56px;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    cursor: pointer;
  }

  .pomodoro-toggle input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .switch-track {
    width: 46px;
    height: 26px;
    padding: 3px;
    border-radius: 999px;
    background: var(--border-color);
    box-sizing: border-box;
    transition: background-color 0.18s ease;
  }

  .switch-track span {
    width: 20px;
    height: 20px;
    display: block;
    border-radius: 50%;
    background: var(--bg-card);
    box-shadow: var(--shadow-soft);
    transition: transform 0.18s ease;
  }

  .pomodoro-toggle input:checked + .switch-track {
    background: var(--accent-color);
  }

  .pomodoro-toggle input:checked + .switch-track span {
    transform: translateX(20px);
  }

  .pomodoro-toggle input:focus-visible + .switch-track {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 22%, transparent);
  }

  .toggle-copy {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .toggle-copy strong {
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 800;
  }

  .toggle-copy small {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
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

  .pomodoro-progress {
    width: min(100%, 250px);
    height: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--border-color);
  }

  .pomodoro-progress span {
    height: 100%;
    display: block;
    border-radius: inherit;
    background: var(--accent-color);
    transition: width 0.25s linear;
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

  .pomodoro-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .pomodoro-stats div {
    min-height: 64px;
    display: grid;
    gap: 5px;
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
  }

  .timeline span,
  .pomodoro-stats span,
  .last-entry p,
  .entry-meta span {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
  }

  .timeline strong,
  .pomodoro-stats strong,
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

  .pomodoro-toggle:has(input:disabled) {
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
    .pomodoro-stats,
    .mode-tabs {
      grid-template-columns: 1fr;
    }

    .entry-meta {
      justify-content: flex-start;
    }
  }
</style>
