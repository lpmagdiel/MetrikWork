<script>
  import { CheckCircle2, Clock, LoaderCircle, Users } from "lucide-svelte";
  import {
    getNonWorkingDayMessage,
    getTodayDateString,
    hasWorkdayForDate,
    isNonWorkingDay,
    registerWorkday,
    selectedTeamId,
    teamsStore,
    userStore,
  } from "../data/stores.js";
  import { captureCurrentUserLocation } from "../data/geolocation.js";
  import { navigateTo } from "../router.js";
  import Toast from "../components/Toast.svelte";

  let hasWorkdayToday = $state(false);
  let isCheckingWorkday = $state(false);
  let isSaving = $state(false);
  let messageToast = $state("");
  let typeToast = $state("success");
  let showToast = $state(false);

  let userTeams = $derived(
    ($teamsStore || []).filter((teamItem) =>
      !Array.isArray(teamItem?.members) || teamItem.members.includes($userStore?.uid),
    ),
  );
  let team = $derived(userTeams.length === 1 ? userTeams[0] : null);
  let todayDate = $derived(getTodayDateString());
  let isTodayNonWorkingDay = $derived(team ? isNonWorkingDay(team, todayDate) : false);
  let todayNonWorkingMessage = $derived(team ? getNonWorkingDayMessage(team, todayDate) : "");
  let canRegister = $derived(
    Boolean(team?.id && $userStore?.uid) &&
      !isCheckingWorkday &&
      !isSaving &&
      !hasWorkdayToday &&
      !isTodayNonWorkingDay,
  );
  let buttonLabel = $derived.by(() => {
    if (userTeams.length > 1) return "Elegir equipo";
    if (!team) return "Abrir equipos";
    if (isCheckingWorkday) return "Comprobando";
    if (isSaving) return "Registrando";
    if (hasWorkdayToday) return "Jornada registrada";
    if (isTodayNonWorkingDay) return "Dia no laborable";
    return "Registrar jornada";
  });
  let ButtonIcon = $derived(
    isSaving || isCheckingWorkday ? LoaderCircle : hasWorkdayToday ? CheckCircle2 : userTeams.length !== 1 ? Users : Clock,
  );

  $effect(() => {
    selectedTeamId.set(team?.id || null);
  });

  $effect(() => {
    const teamId = team?.id;
    const userId = $userStore?.uid;
    const date = todayDate;

    if (!teamId || !userId) {
      hasWorkdayToday = false;
      isCheckingWorkday = false;
      return;
    }

    let cancelled = false;
    isCheckingWorkday = true;

    hasWorkdayForDate(teamId, userId, date)
      .then((exists) => {
        if (!cancelled) hasWorkdayToday = exists;
      })
      .catch((error) => {
        if (!cancelled) {
          hasWorkdayToday = false;
          showNotification(error?.message || "No se pudo comprobar la jornada.", "error");
        }
      })
      .finally(() => {
        if (!cancelled) isCheckingWorkday = false;
      });

    return () => {
      cancelled = true;
    };
  });

  function showNotification(message, type = "success") {
    messageToast = message;
    typeToast = type;
    showToast = true;
    setTimeout(() => {
      showToast = false;
    }, 2600);
  }

  async function handleMainAction() {
    if (userTeams.length !== 1 || !team) {
      navigateTo("/teams");
      return;
    }

    if (hasWorkdayToday) {
      showNotification("Tu jornada de hoy ya esta registrada.");
      return;
    }

    if (isTodayNonWorkingDay) {
      showNotification(todayNonWorkingMessage || "Hoy no es dia laborable.", "error");
      return;
    }

    if (!canRegister) return;

    isSaving = true;
    try {
      await captureCurrentUserLocation({ silent: true, prompt: true });
      await registerWorkday(
        team.id,
        $userStore.uid,
        $userStore.name || $userStore.email,
        {
          type: "full-day",
          overtimeHours: 0,
          date: todayDate,
          timerMode: "basic",
        },
      );

      hasWorkdayToday = true;
      showNotification("Jornada registrada.");
    } catch (error) {
      const message = error?.message || "No se pudo registrar la jornada.";
      if (message.toLowerCase().includes("ya existe")) {
        hasWorkdayToday = true;
      }
      showNotification(message, "error");
    } finally {
      isSaving = false;
    }
  }
</script>

<section class="basic-page">
  <Toast message={messageToast} type={typeToast} show={showToast} />

  <button
    class="register-button"
    class:success={hasWorkdayToday}
    class:loading={isSaving || isCheckingWorkday}
    type="button"
    onclick={handleMainAction}
    disabled={userTeams.length === 1 && !canRegister}
    aria-busy={isSaving || isCheckingWorkday}
  >
    <ButtonIcon size={28} strokeWidth={2.4} />
    <span>{buttonLabel}</span>
  </button>
</section>

<style>
  .basic-page {
    min-height: 100%;
    display: grid;
    place-items: center;
    padding: 1.25rem;
    padding-bottom: calc(var(--bottom-nav-height) + var(--bottom-nav-gap) + env(safe-area-inset-bottom, 0px) + 1.25rem);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--bg-page) 88%, #ffffff), var(--bg-page)),
      var(--bg-page);
  }

  .register-button {
    width: min(100%, 320px);
    min-height: 116px;
    border: 1px solid color-mix(in srgb, var(--accent-color, #e3654e) 34%, transparent);
    border-radius: 8px;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 0.7rem;
    padding: 1.15rem;
    color: var(--accent-ink, #ffffff);
    background: var(--accent-color, #e3654e);
    box-shadow: 0 18px 42px color-mix(in srgb, var(--accent-color, #e3654e) 24%, transparent);
    font: inherit;
    font-weight: 800;
    font-size: 1.08rem;
    letter-spacing: 0;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      background-color 0.18s ease,
      opacity 0.18s ease;
  }

  .register-button:active:not(:disabled) {
    transform: translateY(1px) scale(0.99);
    box-shadow: 0 12px 30px color-mix(in srgb, var(--accent-color, #e3654e) 22%, transparent);
  }

  .register-button:disabled {
    cursor: default;
    opacity: 0.72;
    box-shadow: none;
  }

  .register-button.success {
    background: var(--success-color);
    border-color: color-mix(in srgb, var(--success-color) 48%, transparent);
    box-shadow: 0 18px 42px color-mix(in srgb, var(--success-color) 22%, transparent);
  }

  .register-button.loading :global(svg) {
    animation: spin 0.9s linear infinite;
  }

  .register-button span {
    display: block;
    max-width: 100%;
    overflow-wrap: anywhere;
    text-align: center;
    line-height: 1.2;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 420px) {
    .register-button {
      width: min(100%, 280px);
      min-height: 104px;
      font-size: 1rem;
    }
  }
</style>
