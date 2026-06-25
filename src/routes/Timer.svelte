<script>
  import { onDestroy, onMount } from "svelte";
  import {
    Bookmark,
    Check,
    Clock,
    Coffee,
    Flag,
    Hourglass,
    Play,
    RotateCcw,
    Save,
    SlidersHorizontal,
    Square,
    Trash2,
    TimerReset,
    Briefcase,
    CalendarDays,
  } from "lucide-svelte";
  import Toast from "../components/Toast.svelte";
  import {
    registerWorkday,
    hasWorkdayForDate,
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
  import SelectiveButton from "../components/SelectiveButton.svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import TitleHeader from "../components/TitleHeader.svelte";

  const ACTIVE_TIMER_KEY = "metricwork.activeVariableTimer";
  const POMODORO_FOCUS_SECONDS = 25 * 60;
  const POMODORO_SHORT_BREAK_SECONDS = 5 * 60;
  const POMODORO_LONG_BREAK_SECONDS = 15 * 60;
  const TIMER_MODE_LABELS = {
    "full-day": "Jornada completa",
    variable: "Tiempo parcial",
    overtime: "Horas extra",
  };

  let activeTeamId = $state("");
  let taskTitle = $state("");
  let note = $state("");
  let timerMode = $state("full-day");
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
  let hasRegularWorkdayToday = $state(false);
  let isCheckingWorkday = $state(false);
  let workdayTemplateName = $state("");
  let isSavingTemplate = $state(false);
  let deletingTemplateId = $state("");
  let showTimerDetails = $state(false);

  let selectedTeam = $derived(
    $teamsStore.find((team) => team.id === activeTeamId) || null,
  );
  let memberSettings = $derived(selectedTeam?.memberSettings?.[$userStore?.uid] || {});
  let dailyRate = $derived(Number(memberSettings.dailyRate) || 0);
  let overtimeLimitHours = $derived(getOvertimeLimitHours(selectedTeam));
  let overtimeEnabled = $derived(hasOvertimeEnabled(selectedTeam));
  let todayDate = $derived(getTodayDateString());
  let isTodayNonWorkingDay = $derived(isNonWorkingDay(selectedTeam, todayDate));
  let todayNonWorkingMessage = $derived(getNonWorkingDayMessage(selectedTeam, todayDate));
  let isRunning = $derived(Boolean(startedAt && !endedAt));
  let hasRequiredTask = $derived(timerMode === "full-day" || taskTitle.trim().length > 0);
  let fullDayStartBlocked = $derived(timerMode === "full-day" && (hasRegularWorkdayToday || isCheckingWorkday));
  let selectedTeamName = $derived(selectedTeam?.name || selectedTeam?.team || "Selecciona equipo");
  let teamOptions = $derived(
    $teamsStore.map((team) => ({
      label: team.name || team.team || "Equipo sin nombre",
      value: team.id,
      description: `${team.members?.length || 0} miembros`,
      icon: Briefcase,
    })),
  );
  let timerModeOptions = $derived([
    {
      label: "Completa",
      value: "full-day",
      description: hasRegularWorkdayToday ? "Ya marcada" : dailyRate > 0 ? formatMoney(dailyRate) : "Precio jornada",
      icon: CalendarDays,
      disabled: isTodayNonWorkingDay || hasRegularWorkdayToday || isCheckingWorkday,
    },
    {
      label: "Parcial",
      value: "variable",
      description: "Tiempo parcial",
      icon: Clock,
      disabled: isTodayNonWorkingDay,
    },
    {
      label: "Extra",
      value: "overtime",
      description: overtimeEnabled ? "Horas extra" : "Desactivado",
      icon: TimerReset,
      disabled: isTodayNonWorkingDay || !overtimeEnabled,
    },
  ]);
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
  let canStart = $derived(Boolean(
    selectedTeam &&
    hasRequiredTask &&
    !isRunning &&
    !isTodayNonWorkingDay &&
    !isCapturingLocation &&
    !fullDayStartBlocked &&
    (timerMode !== "overtime" || overtimeEnabled),
  ));
  let canFinish = $derived(Boolean(isRunning && getDurationSecondsForMode(now) > 0));

  $effect(() => {
    const teams = $teamsStore || [];
    const preferredTeamId = teams.some((team) => team.id === $selectedTeamId)
      ? $selectedTeamId
      : teams[0]?.id || "";

    if (!activeTeamId && preferredTeamId) {
      activeTeamId = preferredTeamId;
      return;
    }

    if (
      activeTeamId &&
      !isRunning &&
      teams.length > 0 &&
      !teams.some((team) => team.id === activeTeamId)
    ) {
      activeTeamId = preferredTeamId;
    }
  });

  $effect(() => {
    if (isRunning) {
      persistActiveTimer();
    }
  });

  $effect(() => {
    if (!startedAt && !overtimeEnabled && timerMode === "overtime") {
      timerMode = "variable";
    }
  });

  $effect(() => {
    if (!startedAt && timerMode === "full-day" && hasRegularWorkdayToday) {
      timerMode = "variable";
    }
  });

  $effect(() => {
    if (!startedAt && timerMode === "full-day" && pomodoroEnabled) {
      pomodoroEnabled = false;
      resetPomodoroProgress();
    }
  });

  $effect(() => {
    const teamId = selectedTeam?.id;
    const userId = $userStore?.uid;
    const date = todayDate;

    if (!teamId || !userId) {
      hasRegularWorkdayToday = false;
      isCheckingWorkday = false;
      return;
    }

    let cancelled = false;
    isCheckingWorkday = true;

    hasWorkdayForDate(teamId, userId, date)
      .then((exists) => {
        if (!cancelled) hasRegularWorkdayToday = exists;
      })
      .catch((error) => {
        if (!cancelled) {
          hasRegularWorkdayToday = false;
          console.warn("No se pudo comprobar la jornada de hoy:", error);
        }
      })
      .finally(() => {
        if (!cancelled) isCheckingWorkday = false;
      });

    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (selectedTeam?.id) {
      return subscribeToTeamTemplates(selectedTeam.id, "workday");
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

  function formatMoney(amount) {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: selectedTeam?.projectBudgetCurrency || "MXN",
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);
  }

  function normalizeTimerMode(value) {
    if (value === "full-day" || value === "overtime") return value;
    return "variable";
  }

  function getTimerModeLabel(value) {
    return TIMER_MODE_LABELS[normalizeTimerMode(value)] || TIMER_MODE_LABELS.variable;
  }

  function getEntryTitle(title, mode) {
    return title.trim() || getTimerModeLabel(mode);
  }

  function getDurationSecondsForMode(timestamp = Date.now()) {
    if (!startedAt) return 0;
    if (timerMode === "full-day") {
      const end = endedAt?.getTime() || timestamp;
      return Math.max(0, Math.floor((end - startedAt.getTime()) / 1000));
    }
    return getTrackedWorkSeconds(timestamp);
  }

  function createTimedWorkday(totalSeconds, totalHours, finishDate, finishLocation) {
    const primaryLocation = checkInLocation || finishLocation;
    const cleanTaskTitle = taskTitle.trim();
    const cleanNote = note.trim();
    const workDay = {
      type: timerMode === "full-day" ? "full-day" : "variable",
      overtimeHours: timerMode === "overtime" ? totalHours : 0,
      durationHours: totalHours,
      durationSeconds: totalSeconds,
      startedAt: startedAt.toISOString(),
      endedAt: finishDate.toISOString(),
      timerMode,
      pomodoroEnabled: timerMode !== "full-day" && pomodoroEnabled,
      completedPomodoros: timerMode !== "full-day" ? completedPomodoros : 0,
      memberGps: primaryLocation?.gps || null,
      memberLocationCapturedAt: primaryLocation?.capturedAt || null,
      checkInGps: checkInLocation?.gps || null,
      checkInLocationCapturedAt: checkInLocation?.capturedAt || null,
      checkOutGps: finishLocation?.gps || null,
      checkOutLocationCapturedAt: finishLocation?.capturedAt || null,
    };

    if (timerMode !== "full-day") {
      workDay.variableHours = totalHours;
    }

    if (cleanTaskTitle) {
      workDay.taskTitle = cleanTaskTitle;
    }

    if (cleanNote) {
      workDay.note = cleanNote;
    }

    return workDay;
  }

  async function checkRegularWorkdayNow(teamId = selectedTeam?.id, userId = $userStore?.uid, date = todayDate) {
    if (!teamId || !userId) {
      hasRegularWorkdayToday = false;
      return false;
    }

    isCheckingWorkday = true;
    try {
      const exists = await hasWorkdayForDate(teamId, userId, date);
      if (teamId === selectedTeam?.id && userId === $userStore?.uid && date === todayDate) {
        hasRegularWorkdayToday = exists;
      }
      return exists;
    } catch (error) {
      console.error("Error checking today's workday:", error);
      showNotification("No se pudo comprobar la jornada de hoy.", "warning");
      return false;
    } finally {
      if (teamId === selectedTeam?.id && userId === $userStore?.uid && date === todayDate) {
        isCheckingWorkday = false;
      }
    }
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
    if (timerMode === "full-day") {
      event.currentTarget.checked = false;
      pomodoroEnabled = false;
      resetPomodoroProgress();
      return;
    }

    pomodoroEnabled = event.currentTarget.checked;
    resetPomodoroProgress();
  }

  function applyWorkdayTemplate(template) {
    if (isRunning || isSaving) return;
    const payload = template?.payload || {};
    taskTitle = payload.taskTitle || "";
    note = payload.note || "";
    const nextMode = normalizeTimerMode(payload.timerMode);
    timerMode =
      nextMode === "overtime" && !overtimeEnabled
        ? "variable"
        : nextMode === "full-day" && hasRegularWorkdayToday
        ? "variable"
        : nextMode;
    pomodoroEnabled = timerMode !== "full-day" && Boolean(payload.pomodoroEnabled);
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
      timerMode = normalizeTimerMode(savedTimer.timerMode);
      pomodoroEnabled = timerMode !== "full-day" && Boolean(savedTimer.pomodoroEnabled);
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

    if (!selectedTeam) {
      showNotification("Selecciona un equipo antes de iniciar.", "error");
      return;
    }

    if (timerMode === "overtime" && !overtimeEnabled) {
      await showErrorAlert("Horas extra desactivadas", getOvertimeLimitMessage(selectedTeam));
      return;
    }

    if (timerMode !== "full-day" && !taskTitle.trim()) {
      showNotification("Selecciona un equipo y escribe la tarea antes de iniciar.", "error");
      return;
    }

    if (timerMode === "full-day") {
      const alreadyHasWorkday = await checkRegularWorkdayNow();
      if (alreadyHasWorkday) {
        await showErrorAlert(
          "Jornada ya registrada",
          "Hoy ya tienes una jornada completa o media jornada. Usa tiempo parcial u horas extra para registrar otra entrada.",
        );
        return;
      }
    }

    if (!canStart) {
      showNotification("No se pudo iniciar el registro.", "error");
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
    const totalSeconds = Math.max(1, getDurationSecondsForMode(finishDate.getTime()));
    const totalHours = Number(formatHours(totalSeconds));
    const finishedTimerMode = timerMode;
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

      if (timerMode === "full-day") {
        const alreadyHasWorkday = await checkRegularWorkdayNow();
        if (alreadyHasWorkday) {
          endedAt = null;
          startTicker();
          persistActiveTimer();
          await showErrorAlert(
            "Jornada ya registrada",
            "Hoy ya tienes una jornada completa o media jornada. Usa tiempo parcial u horas extra para registrar otra entrada.",
          );
          return;
        }
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
      const workDayToRegister = applyWorkdayOvertimeLimit(
        createTimedWorkday(totalSeconds, totalHours, finishDate, finishLocation),
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
        taskTitle: getEntryTitle(taskTitle, finishedTimerMode),
        duration: formatTime(savedSeconds),
        startedAt,
        endedAt: finishDate,
        timerMode: finishedTimerMode,
        pomodoroEnabled: finishedTimerMode !== "full-day" && pomodoroEnabled,
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
      if (finishedTimerMode === "full-day") {
        hasRegularWorkdayToday = true;
      }
      await showSuccessAlert(
        result?.queued
          ? "Guardado sin conexión"
          : finishedTimerMode === "full-day"
          ? "Jornada completa registrada"
          : finishedTimerMode === "overtime" ? "Horas extra registradas" : "Jornada parcial registrada",
        result?.queued
          ? "El registro quedó en el dispositivo y se sincronizará al volver la conexión."
          : finishedTimerMode === "full-day"
          ? "La jornada completa se guardó con entrada, salida y GPS."
          : pomodoroEnabled
          ? "Tiempo de enfoque registrado correctamente."
          : overtimeLimitHours > 0 && totalHours > overtimeLimitHours && finishedTimerMode === "variable"
          ? `Jornada registrada con el máximo permitido: ${overtimeLimitHours}h.`
          : "Tiempo parcial registrado correctamente.",
      );
    } catch (error) {
      console.error("Error registering timed workday:", error);
      endedAt = null;
      checkOutLocation = null;
      startTicker();
      persistActiveTimer();
      await showErrorAlert(
        "Error al registrar jornada",
        error?.message || "No se pudo registrar la jornada.",
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
    <TitleHeader title="Timer" description="Fichaje de jornada" icon={Clock} iconPosition="right" />
  </header>

  <main class="timer-content">
    <section class="timer-hero" class:running={isRunning}>
      <div class="hero-status">
        <div class="status-pill" class:active={isRunning}>
          {#if isRunning}
            <Hourglass size={18} />
            <span>En curso</span>
          {:else}
            <Clock size={18} />
            <span>Disponible</span>
          {/if}
        </div>
      </div>

      <div class="hero-selectors">
        <SelectiveButton
          options={teamOptions}
          bind:value={activeTeamId}
          icon={Briefcase}
          label="Equipo"
          disabled={isRunning || isSaving || teamOptions.length === 0}
          ariaLabel="Cambiar equipo"
        />
        <SelectiveButton
          options={timerModeOptions}
          bind:value={timerMode}
          label="Tipo"
          compact={true}
          disabled={isRunning || isSaving}
          ariaLabel="Cambiar tipo de jornada"
        />
      </div>

      {#if teamOptions.length === 0}
        <p class="notice">Necesitas un equipo para registrar una jornada.</p>
      {/if}

      <div class="timer-mark" aria-hidden="true">
        <span></span>
      </div>

      <div class="time-block">
        {#if pomodoroEnabled}
          <span>{pomodoroPhaseLabel} · bloque {pomodoroCycle}</span>
          <strong>{formatTime(pomodoroRemainingSeconds)}</strong>
          <p>{formatTime(trackedWorkSeconds)} de enfoque acumulado</p>
        {:else}
          <span>{getTimerModeLabel(timerMode)}</span>
          <strong>{formatTime(elapsedSeconds)}</strong>
          <p>{formatHours(elapsedSeconds)} h registradas</p>
        {/if}
      </div>

      {#if pomodoroEnabled}
        <div class="pomodoro-progress" aria-hidden="true">
          <span style={`width: ${pomodoroProgress}%`}></span>
        </div>
      {/if}

      <div class="timer-meta">
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
        <div>
          <Clock size={16} />
          <span>{timerMode === "full-day" ? "Pago" : "Máximo"}</span>
          <strong>{timerMode === "full-day" ? (dailyRate > 0 ? formatMoney(dailyRate) : "Jornada") : overtimeEnabled ? `${overtimeLimitHours} h` : "Sin extra"}</strong>
        </div>
      </div>

      {#if pomodoroEnabled}
        <div class="pomodoro-stats">
          <div>
            <Coffee size={16} />
            <span>Bloques</span>
            <strong>{completedPomodoros}</strong>
          </div>
          <div>
            <Clock size={16} />
            <span>Enfoque</span>
            <strong>{formatHours(trackedWorkSeconds)} h</strong>
          </div>
        </div>
      {/if}

      {#if isTodayNonWorkingDay}
        <p class="notice error">{todayNonWorkingMessage}</p>
      {/if}

      {#if timerMode === "full-day" && hasRegularWorkdayToday}
        <p class="notice error">Hoy ya tienes una jornada completa o media jornada registrada.</p>
      {/if}

      <label class="field quick-task" for="task">
        <span>{timerMode === "full-day" ? "Tarea opcional" : "Tarea"}</span>
        <input
          id="task"
          type="text"
          bind:value={taskTitle}
          disabled={isRunning || isSaving}
          placeholder={timerMode === "full-day" ? "Turno, obra, cliente..." : "Instalación, soporte, revisión..."}
        />
      </label>

      <div class="actions">
        {#if isRunning || isSaving}
          <button class="main-action stop" onclick={finishTimer} disabled={!canFinish || isSaving || isCapturingLocation}>
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
          <button class="icon-action" onclick={cancelTimer} disabled={isSaving || isCapturingLocation} aria-label="Cancelar registro">
            <RotateCcw size={18} />
          </button>
        {:else}
          <button class="main-action" onclick={startTimer} disabled={!canStart || isSaving || isCapturingLocation}>
            {#if isCapturingLocation}
              <Save size={18} />
              Iniciando
            {:else}
              <Play size={18} />
              Registrar entrada
            {/if}
          </button>
        {/if}
        <button
          class="icon-action"
          type="button"
          onclick={() => (showTimerDetails = true)}
          aria-label="Opciones de jornada"
        >
          <SlidersHorizontal size={18} />
        </button>
      </div>
    </section>
  </main>

  <SliceContainer bind:show={showTimerDetails}>
    <section class="timer-details-panel">
      <div class="panel-heading">
        <span>Detalles de jornada</span>
        <strong>{selectedTeamName}</strong>
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
                  <small>{getTimerModeLabel(template.payload?.timerMode)}</small>
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

      <div class="field-stack">
        <label class="field" for="timer-note">
          <span>Nota opcional</span>
          <textarea
            id="timer-note"
            bind:value={note}
            disabled={isSaving}
            placeholder="Detalle breve para el equipo"
          ></textarea>
        </label>
      </div>

      <label class="pomodoro-toggle">
        <input
          type="checkbox"
          checked={pomodoroEnabled}
          disabled={timerMode === "full-day" || isRunning || isSaving}
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
            aria-label="Guardar plantilla"
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
  </SliceContainer>

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
    --timer-bg: var(--bg-page);
    --timer-panel: var(--bg-card);
    --timer-panel-solid: var(--bg-card);
    --timer-control: var(--bg-input);
    --timer-border: var(--border-color);
    --timer-shadow: var(--shadow-card);
    --timer-accent: var(--accent-color);
    --timer-accent-ink: var(--accent-ink);
    --timer-ring: var(--accent-color);
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
    background: var(--timer-bg);
    color: var(--text-primary);
  }

  :global(:root.dark) .timer-page {
    --timer-bg: var(--bg-page);
    --timer-panel: var(--bg-card);
    --timer-panel-solid: var(--bg-card);
    --timer-control: var(--bg-input);
    --timer-border: var(--border-color);
    --timer-shadow: var(--shadow-card);
    --timer-accent: var(--accent-color);
    --timer-accent-ink: var(--accent-ink);
    --timer-ring: var(--accent-color);
    background: var(--timer-bg);
  }

  .timer-header,
  .timer-content,
  .last-entry {
    width: min(100%, 720px);
    margin: 0 auto;
  }

  .timer-header {
    margin-bottom: 8px;
  }

  .hero-status {
    display: flex;
    justify-content: flex-end;
  }

  .status-pill {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid var(--timer-border);
    border-radius: 999px;
    background: var(--timer-control);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .status-pill.active {
    color: var(--success-color);
    background: var(--bg-success-subtle);
  }

  .timer-content {
    display: block;
  }

  .timer-hero,
  .last-entry {
    border: 1px solid var(--timer-border);
    border-radius: 28px;
    background: var(--timer-panel);
    box-shadow: var(--timer-shadow);
    backdrop-filter: blur(18px);
  }

  .timer-hero {
    min-height: 640px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    overflow: hidden;
    position: relative;
    border-radius: var(--radius-lg);
  }

  .timer-hero::before {
    display: none;
  }

  .timer-hero > * {
    position: relative;
    z-index: 1;
  }

  .hero-selectors {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .timer-hero :global(.selective-button) {
    background: var(--timer-control);
    border-color: var(--timer-border);
    box-shadow: none;
    border-radius: var(--radius-md);
  }

  .timer-hero :global(.selective-button:focus),
  .timer-hero :global(.selective-button:focus-visible),
  .timer-hero :global(.selective-button:active) {
    border-color: var(--accent-color);
    box-shadow: none;
    outline: none;
  }

  .timer-mark {
    width: min(140px, 35vw);
    aspect-ratio: 1;
    margin: 32px auto 0;
    display: grid;
    place-items: center;
  }

  .timer-mark span {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: 50%;
    border: 2px solid var(--timer-accent);
    background: transparent;
    position: relative;
    transition: border-color 0.25s ease, box-shadow 0.25s ease;
  }

  .timer-mark span::before {
    content: "";
    position: absolute;
    left: 50%;
    top: 12%;
    width: 2px;
    height: 38%;
    border-radius: 999px;
    background: var(--timer-accent);
    opacity: 0.36;
    transform: translateX(-50%) rotate(0deg);
    transform-origin: 50% 100%;
  }

  .timer-mark span::after {
    content: "";
    position: absolute;
    inset: -8px;
    border-radius: 50%;
    border: 1px solid var(--timer-accent);
    opacity: 0.2;
  }

  .timer-hero.running .timer-mark span {
    border-color: var(--success-color);
    box-shadow: inset 0 0 0 8px rgba(5, 150, 105, 0.08);
  }

  .timer-hero.running .timer-mark span::before {
    background: var(--success-color);
    opacity: 1;
    animation: timer-sweep 6s linear infinite;
  }

  .timer-hero.running .timer-mark span::after {
    border-color: var(--success-color);
    animation: timer-ring-pulse 2.4s ease-in-out infinite;
  }

  @keyframes timer-sweep {
    to {
      transform: translateX(-50%) rotate(360deg);
    }
  }

  @keyframes timer-ring-pulse {
    0%,
    100% {
      opacity: 0.18;
      transform: scale(1);
    }

    50% {
      opacity: 0.34;
      transform: scale(1.06);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .timer-hero.running .timer-mark span::before,
    .timer-hero.running .timer-mark span::after {
      animation: none;
    }
  }

  .time-block {
    display: grid;
    justify-items: center;
    gap: 8px;
    margin-top: 8px;
    text-align: center;
  }

  .time-block span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 850;
    text-transform: uppercase;
  }

  .time-block strong {
    color: var(--text-primary);
    font-size: clamp(3.5rem, 10vw, 6rem);
    line-height: 1;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }

  .time-block p {
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 600;
  }

  .pomodoro-progress {
    width: min(100%, 300px);
    height: 6px;
    margin: 0 auto;
    overflow: hidden;
    border-radius: 999px;
    background: var(--timer-control);
  }

  .pomodoro-progress span {
    height: 100%;
    display: block;
    border-radius: inherit;
    background: var(--timer-accent);
    transition: width 0.25s linear;
  }

  .timer-meta,
  .pomodoro-stats {
    display: grid;
    gap: 12px;
  }

  .timer-meta {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: auto;
  }

  .pomodoro-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .timer-meta div,
  .pomodoro-stats div {
    min-height: 64px;
    padding: 12px;
    display: grid;
    align-content: center;
    gap: 2px;
    border: 1px solid var(--timer-border);
    border-radius: var(--radius-md);
    background: var(--timer-control);
  }

  .timer-meta span,
  .pomodoro-stats span,
  .last-entry p,
  .entry-meta span {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .timer-meta strong,
  .pomodoro-stats strong,
  .entry-meta strong {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: flex;
    gap: 12px;
  }

  .main-action,
  .icon-action,
  .template-save-row button,
  .template-delete {
    min-height: 52px;
    border: none;
    border-radius: var(--radius-md);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    transition: all 0.3s ease;
  }

  .main-action {
    flex: 1;
    min-width: 0;
    color: var(--accent-ink);
    background: var(--accent-color);
    box-shadow: none;
  }

  .main-action.stop {
    color: #ffffff;
    background: var(--success-color);
    box-shadow: none;
  }

  .icon-action {
    width: 52px;
    background: var(--timer-control);
    color: var(--text-primary);
    border: 1px solid var(--timer-border);
  }

  .timer-details-panel {
    width: min(100%, 640px);
    margin: 0 auto;
    padding: 2px 8px 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .panel-heading {
    display: grid;
    gap: 4px;
  }

  .panel-heading span,
  .template-heading {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .template-heading {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .panel-heading strong {
    color: var(--text-primary);
    font-size: 20px;
    font-weight: 800;
    overflow-wrap: anywhere;
  }

  .field-stack,
  .field,
  .template-strip,
  .template-save-box {
    display: grid;
    gap: 12px;
  }

  .field span,
  .template-save-box > label {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
  }

  input,
  textarea {
    width: 100%;
    border: 1px solid var(--timer-border);
    border-radius: var(--radius-md);
    background: var(--timer-control);
    color: var(--text-primary);
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    outline: none;
    box-sizing: border-box;
    transition: all 0.3s ease;
  }

  input {
    min-height: 52px;
    padding: 0 16px;
  }

  textarea {
    min-height: 100px;
    padding: 16px;
    resize: vertical;
    line-height: 1.5;
  }

  input:focus,
  input:focus-visible,
  input:active,
  textarea:focus,
  textarea:focus-visible,
  textarea:active {
    border-color: var(--accent-color);
    background: var(--timer-control);
    box-shadow: none;
    outline: none;
  }

  .template-chip {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
    border: 1px solid var(--timer-border);
    border-radius: var(--radius-md);
    background: var(--timer-control);
    overflow: hidden;
  }

  .template-list {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
  }

  .template-list::-webkit-scrollbar {
    display: none;
  }

  .template-chip > button:first-child {
    min-width: 120px;
    border: 0;
    background: transparent;
    color: var(--text-primary);
    text-align: left;
    padding: 10px 14px;
    display: grid;
    gap: 2px;
    cursor: pointer;
  }

  .template-chip strong {
    font-size: 13px;
    font-weight: 700;
  }

  .template-chip small {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 500;
  }

  .template-delete {
    width: 40px;
    min-height: 100%;
    border-radius: 0;
    border-left: 1px solid var(--timer-border);
    background: transparent;
    color: var(--text-muted);
  }

  .template-save-row button {
    min-height: 52px;
    border-radius: var(--radius-md);
    background: var(--accent-color);
    color: var(--accent-ink);
  }

  .template-save-row {
    display: grid;
    grid-template-columns: 1fr 52px;
    gap: 10px;
  }

  .template-save-row input {
    min-width: 0;
  }

  .notice {
    border-radius: var(--radius-md);
    padding: 12px 16px;
    background: var(--timer-control);
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    border: 1px solid var(--timer-border);
  }

  .notice.error {
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
    border-color: transparent;
  }

  .pomodoro-toggle {
    min-height: 56px;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 14px;
    padding: 0 16px;
    border: 1px solid var(--timer-border);
    border-radius: var(--radius-md);
    background: var(--timer-control);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .pomodoro-toggle:focus-within,
  .pomodoro-toggle:active {
    border-color: var(--accent-color);
  }

  .pomodoro-toggle input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .switch-track {
    width: 40px;
    height: 22px;
    padding: 2px;
    border-radius: 999px;
    background: var(--border-color);
    box-sizing: border-box;
    transition: all 0.2s ease;
  }

  .switch-track span {
    width: 18px;
    height: 18px;
    display: block;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .pomodoro-toggle input:checked + .switch-track {
    background: var(--success-color);
  }

  .pomodoro-toggle input:checked + .switch-track span {
    transform: translateX(18px);
  }

  .toggle-copy {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .toggle-copy strong {
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 700;
  }

  .toggle-copy small {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
  }

  .last-entry {
    padding: 16px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-radius: var(--radius-lg);
  }

  .last-entry h2 {
    margin-top: 2px;
    color: var(--text-primary);
    font-size: 1rem;
    font-weight: 700;
  }

  .entry-meta {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  button:hover:not(:disabled) {
    opacity: 0.9;
  }

  button:active:not(:disabled) {
    transform: scale(0.98);
  }

  button:disabled,
  input:disabled,
  textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pomodoro-toggle:has(input:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 860px) {
    .timer-hero {
      min-height: auto;
    }
  }

  @media (max-width: 560px) {
    .timer-page {
      padding: 18px 14px var(--bottom-nav-clearance);
      padding-top: var(--page-top-safe);
      gap: 14px;
    }

    .last-entry {
      align-items: flex-start;
      flex-direction: column;
    }

    .timer-hero {
      border-radius: 24px;
      padding: 14px;
    }

    .timer-details-panel {
      padding: 0 6px 20px;
    }


    .timer-mark {
      width: 118px;
      margin-top: 22px;
    }

    .time-block strong {
      font-size: clamp(2.7rem, 15vw, 4.25rem);
    }
  }
</style>
