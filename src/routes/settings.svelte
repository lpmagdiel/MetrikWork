<script>
  // @ts-nocheck

  import { onMount } from "svelte";
  import {
    User,
    Mail,
    Phone,
    MapPin,
    Landmark,
    LogOut,
    Bell,
    AlarmClock,
    Moon,
    ChevronRight,
    Save,
    Info,
    Album,
    Settings,
    ShieldCheck,
    CalendarDays,
    Cookie,
    FileText,
    Scale
  } from "lucide-svelte";
  import {
    userStore,
    logout,
    updateUserProfile,
    getUserProfile,
    getUserPrivateProfile,
    MINIMUM_USER_AGE,
    normalizeBirthDate,
    getAgeFromBirthDate,
    getLatestAllowedBirthDate,
    isAtLeastMinimumAge,
    settingsStore,
    notificationPreferencesStore,
    teamsStore,
    updateSettings,
    updateNotificationPreferences,
    normalizeNotificationPreferences,
    normalizeReminderSettings,
    DEFAULT_REMINDER_TIME,
    DEFAULT_REMINDER_MESSAGE,
    getLocalReminderTimeZone,
    pushNotificationState,
    requestPushNotifications,
    systemAdminStore,
  } from "../data/stores.js";
  import { navigateTo } from "../router.js";

  import AvatarCircle from "../components/AvatarCircle.svelte";
  import Toast from "../components/Toast.svelte";
  import UpdateFeaturesModal from "../components/UpdateFeaturesModal.svelte";
  import {updateData} from "../data/updateFeatures.js";
  import { showErrorAlert } from "../data/alerts.js";
  import TitleHeader from "../components/TitleHeader.svelte";
  import {
    clearCurrentUserLocation,
    getCurrentGpsPosition,
    getLocationPermissionState,
    normalizeLocationSettings,
  } from "../data/geolocation.js";
  import { openCookiePreferences } from "../data/cookieConsent.js";
  import { getBankName } from "../helpers/banks.js";

  let name = $state("");
  let email = $state("");
  let birthDate = $state("");
  let phone = $state("");
  let address = $state("");
  let iban = $state("");
  let bankName = $state("");
  let isSaving = $state(false);
  let showToast = $state(false);
  let toastMessage = $state("");
  let toastType = $state("success");
  let showUpdateModal = $state(false);
  let canUsePush = $state(false);
  let pushButtonLoading = $state(false);
  let locationButtonLoading = $state(false);
  let locationPermissionState = $state("unknown");
  let notificationPreferenceSavingKey = $state("");
  let reminderSaving = $state(false);
  let pushState = $derived($pushNotificationState);
  let pushEnabled = $derived(pushState.status === "enabled" && Boolean(pushState.token));
  let notificationPreferences = $derived(normalizeNotificationPreferences($notificationPreferencesStore));
  let reminder = $derived(normalizeReminderSettings($settingsStore || {}));
  let locationSettings = $derived(normalizeLocationSettings($settingsStore || {}));
  let birthDateAge = $derived(getAgeFromBirthDate(birthDate));
  let birthDateMeetsAge = $derived(isAtLeastMinimumAge(birthDate));
  const latestAllowedBirthDate = getLatestAllowedBirthDate();

  const notificationPreferenceOptions = [
    {
      key: "privateChats",
      label: "Chats privados",
      description: "Mensajes directos entre miembros.",
    },
    {
      key: "groupChats",
      label: "Chats de equipo",
      description: "Mensajes enviados en chats grupales.",
    },
    {
      key: "calls",
      label: "Llamadas privadas",
      description: "Avisos de llamadas entrantes.",
    },
    {
      key: "events",
      label: "Eventos y jornadas",
      description: "Jornadas asignadas desde planning.",
    },
    {
      key: "tasks",
      label: "Tareas",
      description: "Nuevas tareas asignadas a ti.",
    },
    {
      key: "requests",
      label: "Solicitudes",
      description: "Ausencias, invitaciones y respuestas.",
    },
    {
      key: "inventory",
      label: "Inventario",
      description: "Problemas reportados en productos.",
    },
    {
      key: "payments",
      label: "Pagos",
      description: "Pagos registrados a tu favor.",
    },
  ];

  onMount(async () => {
    canUsePush = "Notification" in window && "serviceWorker" in navigator;
    await refreshLocationPermissionState();

    if ($userStore) {
      email = $userStore.email;
      name = $userStore.name || "";

      const profile = await getUserProfile($userStore.uid);
      if (profile) {
        if (profile.name) name = profile.name;
        // Actualizamos el store para que AvatarCircle reaccione
        userStore.update((u) => ({ ...u, ...profile }));
      }

      const privateProfile = await getUserPrivateProfile($userStore.uid);
      if (privateProfile) {
        birthDate = privateProfile.birthDate || "";
        if (birthDate) userStore.update((u) => ({ ...u, birthDate }));
        phone = privateProfile.phone || "";
        address = privateProfile.address || "";
        iban = privateProfile.iban || "";
        bankName = privateProfile.bankName || getBankName(privateProfile.iban);
      }
    }
  });

  async function handleSave() {
    if (!$userStore) return;
    const normalizedBirthDate = normalizeBirthDate(birthDate);

    if (!normalizedBirthDate) {
      toastMessage = "Indica tu fecha de nacimiento";
      toastType = "warning";
      showToast = true;
      return;
    }

    if (!isAtLeastMinimumAge(normalizedBirthDate)) {
      toastMessage = `Debes tener al menos ${MINIMUM_USER_AGE} años para usar MetricWork`;
      toastType = "error";
      showToast = true;
      return;
    }

    isSaving = true;
    try {
      const success = await updateUserProfile($userStore.uid, {
        name: name.trim(),
        birthDate: normalizedBirthDate,
        phone: phone.trim(),
        address: address.trim(),
        iban: iban.trim().toUpperCase(),
        bankName: bankName.trim() || getBankName(iban),
      }, {
        teamIds: ($teamsStore || []).map((team) => team.id),
      });
      if (success) {
        toastMessage = "Perfil actualizado correctamente";
        toastType = "success";
        showToast = true;
      }
    } catch (error) {
      toastMessage = error?.message || "Error al guardar los cambios";
      toastType = "error";
      showToast = true;
    } finally {
      isSaving = false;
    }
  }

  async function handleLogout() {
    try {
      await logout();
      navigateTo("/hello");
    } catch (error) {
      showErrorAlert("Error", "Error al cerrar sesión");
    }
  }

  async function toggleDarkMode() {
    if (!$userStore) return;
    const currentSettings = $settingsStore || {};
    const newDarkMode = !currentSettings.darkMode;

    try {
      await updateSettings($userStore.uid, {
        darkMode: newDarkMode,
      });
    } catch (error) {
      console.error("Error toggling dark mode:", error);
    }
  }

  function getPushDescription() {
    if (!canUsePush || pushState.status === "unsupported") return "No disponible en este navegador";
    if (pushState.permission === "denied") return "Permiso bloqueado en el navegador";
    if (pushEnabled) return "Avisos activos aunque la app esté cerrada";
    if (pushState.status === "local-enabled") return pushState.error || "Falta configuración push";
    if (pushState.status === "checking") return "Comprobando el dispositivo";
    if (pushState.status === "error") return pushState.error || "Revisar configuración";
    return "Activar avisos de tareas y equipos";
  }

  async function refreshLocationPermissionState() {
    locationPermissionState = (await getLocationPermissionState()) || "unknown";
  }

  function getLocationDescription() {
    if (!locationSettings.enabled) return "La app no capturará GPS al fichar o guardar ubicaciones";
    if (locationPermissionState === "granted") return "GPS disponible para fichajes y ubicaciones";
    if (locationPermissionState === "denied") return "Permiso bloqueado en el navegador";
    return "Permiso pendiente del navegador";
  }

  async function toggleLocationPermission(event) {
    if (!$userStore?.uid || locationButtonLoading) return;
    const enabled = event.currentTarget.checked;
    locationButtonLoading = true;

    try {
      await updateSettings($userStore.uid, {
        locationEnabled: enabled,
      });

      if (!enabled) {
        clearCurrentUserLocation();
      }

      await refreshLocationPermissionState();
      toastMessage = enabled ? "Ubicación permitida en la app" : "Ubicación desactivada";
      toastType = "success";
      showToast = true;
    } catch (error) {
      console.error("Error updating location permission setting:", error);
      toastMessage = "No se pudo guardar la preferencia de ubicación";
      toastType = "error";
      showToast = true;
    } finally {
      locationButtonLoading = false;
    }
  }

  async function requestLocationPermission() {
    if (!$userStore?.uid || locationButtonLoading || !locationSettings.enabled) return;
    locationButtonLoading = true;

    try {
      await getCurrentGpsPosition({
        prompt: true,
        settings: { locationEnabled: true },
      });
      locationPermissionState = (await getLocationPermissionState()) || "granted";
      toastMessage = "Permiso de ubicación activado";
      toastType = "success";
      showToast = true;
    } catch (error) {
      await refreshLocationPermissionState();
      toastMessage = error?.message || "No se pudo activar la ubicación";
      toastType = locationPermissionState === "denied" ? "error" : "warning";
      showToast = true;
    } finally {
      locationButtonLoading = false;
    }
  }

  async function handleEnablePush() {
    if (!$userStore?.uid || pushButtonLoading || pushEnabled) return;
    pushButtonLoading = true;

    try {
      const result = await requestPushNotifications($userStore.uid);
      if (result.ok && result.token) {
        toastMessage = "Notificaciones push activadas";
        toastType = "success";
      } else if (result.reason === "denied") {
        toastMessage = "Permiso bloqueado en el navegador";
        toastType = "error";
      } else {
        toastMessage = "No se pudieron activar las notificaciones push";
        toastType = "error";
      }
      showToast = true;
    } finally {
      pushButtonLoading = false;
    }
  }

  async function toggleNotificationPreference(key) {
    if (!$userStore?.uid || notificationPreferenceSavingKey) return;

    const nextPreferences = {
      ...notificationPreferences,
      [key]: !notificationPreferences[key],
    };

    notificationPreferenceSavingKey = key;
    try {
      await updateNotificationPreferences($userStore.uid, nextPreferences);
      toastMessage = "Preferencias de notificación actualizadas";
      toastType = "success";
      showToast = true;
    } catch (error) {
      console.error("Error updating notification preferences:", error);
      toastMessage = "No se pudieron guardar las preferencias";
      toastType = "error";
      showToast = true;
    } finally {
      notificationPreferenceSavingKey = "";
    }
  }

  function getReminderDescription() {
    if (!reminder.enabled) return "Sin recordatorio configurado";
    if (!canUsePush || pushState.status === "unsupported") return `Guardado a las ${reminder.time}; avisos no disponibles`;
    if (pushState.permission === "denied") return `Guardado a las ${reminder.time}; permiso bloqueado`;
    if (pushState.permission !== "granted") return `Guardado a las ${reminder.time}; activa notificaciones`;
    return `Todos los días a las ${reminder.time}`;
  }

  async function saveReminderSettings(nextReminder) {
    if (!$userStore?.uid || reminderSaving) return;
    const wasEnabled = reminder.enabled;

    const normalizedReminder = normalizeReminderSettings({
      reminderEnabled: nextReminder.enabled,
      reminderTime: nextReminder.time || DEFAULT_REMINDER_TIME,
      reminderMessage: nextReminder.message || DEFAULT_REMINDER_MESSAGE,
      reminderTimeZone: getLocalReminderTimeZone(),
    });

    reminderSaving = true;

    try {
      await updateSettings($userStore.uid, {
        reminderEnabled: normalizedReminder.enabled,
        reminderTime: normalizedReminder.time,
        reminderMessage: normalizedReminder.message,
        reminderTimeZone: normalizedReminder.timeZone,
        workdayReminderEnabled: normalizedReminder.enabled,
        workdayReminderTime: normalizedReminder.time,
      });

      const permissionDenied = normalizedReminder.enabled &&
        pushState.permission === "denied";
      const unsupported = normalizedReminder.enabled && (!canUsePush || pushState.status === "unsupported");
      const needsPushPermission = normalizedReminder.enabled &&
        canUsePush &&
        pushState.permission !== "granted";

      if (permissionDenied) {
        toastMessage = "Hora guardada, pero el permiso de notificaciones está bloqueado";
        toastType = "error";
      } else if (unsupported) {
        toastMessage = "Hora guardada, pero este navegador no permite avisos";
        toastType = "error";
      } else if (needsPushPermission) {
        toastMessage = "Recordatorio guardado. Activa notificaciones para recibir avisos.";
        toastType = "warning";
      } else {
        toastMessage = normalizedReminder.enabled
          ? "Recordatorio activado"
          : wasEnabled
            ? "Recordatorio desactivado"
            : "Recordatorio guardado";
        toastType = "success";
      }
      showToast = true;
    } catch (error) {
      console.error("Error updating reminder:", error);
      toastMessage = "No se pudo guardar el recordatorio";
      toastType = "error";
      showToast = true;
    } finally {
      reminderSaving = false;
    }
  }

  function toggleReminder() {
    saveReminderSettings({
      enabled: !reminder.enabled,
      time: reminder.time,
      message: reminder.message,
    });
  }

  function handleReminderTimeChange(event) {
    const selectedTime = event.currentTarget.value;
    if (!selectedTime) return;

    saveReminderSettings({
      enabled: true,
      time: selectedTime,
      message: reminder.message,
    });
  }

  function handleReminderMessageChange(event) {
    saveReminderSettings({
      enabled: reminder.enabled,
      time: reminder.time,
      message: event.currentTarget.value,
    });
  }
</script>

<div class="settings-page">
  <Toast message={toastMessage} type={toastType} bind:show={showToast} />
  <UpdateFeaturesModal open={showUpdateModal} onClose={() => (showUpdateModal = false)} />
  <header>
    <TitleHeader title="Configuración" description={$userStore?.email || ""} icon={Settings} iconPosition="right"/>
  </header>

  <div class="content">
    <section class="profile-card">
      <AvatarCircle />

      <div class="profile-form">
        {#if !birthDate}
          <div class="profile-notice">
            <CalendarDays size={19} />
            <p>Completa tu fecha de nacimiento para confirmar que tienes al menos {MINIMUM_USER_AGE} años.</p>
          </div>
        {/if}

        <div class="input-group">
          <label for="name">Nombre Completo</label>
          <div class="input-wrapper">
            <User size={18} />
            <input
              type="text"
              id="name"
              bind:value={name}
              placeholder="Tu nombre"
            />
          </div>
        </div>

        <div class="input-group">
          <label for="birthDate">Fecha de nacimiento</label>
          <div class="input-wrapper">
            <CalendarDays size={18} />
            <input
              type="date"
              id="birthDate"
              bind:value={birthDate}
              max={latestAllowedBirthDate}
              autocomplete="bday"
              required
            />
          </div>
          <p class={`input-help ${birthDate && !birthDateMeetsAge ? "warning" : ""}`}>
            {#if birthDateAge !== null && birthDateMeetsAge}
              {birthDateAge} años
            {:else if birthDate}
              Debes tener al menos {MINIMUM_USER_AGE} años.
            {:else}
              Necesaria para validar la edad mínima.
            {/if}
          </p>
        </div>

        <div class="input-group">
          <label for="phone">Teléfono</label>
          <div class="input-wrapper">
            <Phone size={18} />
            <input
              type="tel"
              id="phone"
              bind:value={phone}
              placeholder="Tu teléfono"
              autocomplete="tel"
            />
          </div>
        </div>

        <div class="input-group">
          <label for="address">Dirección</label>
          <div class="input-wrapper">
            <MapPin size={18} />
            <input
              type="text"
              id="address"
              bind:value={address}
              placeholder="Tu dirección"
              autocomplete="street-address"
            />
          </div>
        </div>

        <div class="input-group">
          <label for="iban">IBAN</label>
          <div class="input-wrapper">
            <Landmark size={18} />
            <input
              type="text"
              id="iban"
              bind:value={iban}
              placeholder="ES00 0000 0000 0000 0000 0000"
              autocomplete="off"
              inputmode="text"
            />
          </div>
        </div>

        <div class="input-group">
          <label for="bankName">Banco</label>
          <div class="input-wrapper">
            <Landmark size={18} />
            <input
              type="text"
              id="bankName"
              bind:value={bankName}
              placeholder="Nombre del banco"
              autocomplete="organization"
            />
          </div>
        </div>

        <div class="input-group">
          <label for="email">Correo Electrónico</label>
          <div class="input-wrapper disabled">
            <Mail size={18} />
            <input type="email" id="email" value={email} disabled />
          </div>
        </div>

        <button class="save-btn" onclick={handleSave} disabled={isSaving}>
          {#if isSaving}
            <span>Guardando...</span>
          {:else}
            <Save size={18} />
            <span>Guardar Cambios</span>
          {/if}
        </button>
      </div>
    </section>

    <section class="settings-group">
      <h3>Preferencias</h3>
      <div class="settings-list">
        <div class="settings-item">
          <div class="item-icon location">
            <MapPin size={18} />
          </div>
          <div class="item-info">
            <span>Permitir ubicación</span>
            <p>{getLocationDescription()}</p>
          </div>
          <div class="setting-actions">
            {#if locationSettings.enabled && locationPermissionState !== "granted"}
              <button
                type="button"
                class="permission-btn"
                disabled={locationButtonLoading || locationPermissionState === "denied"}
                onclick={requestLocationPermission}
              >
                {locationButtonLoading ? "..." : locationPermissionState === "denied" ? "Bloqueado" : "Permitir"}
              </button>
            {/if}
            <label class="switch">
              <input
                type="checkbox"
                checked={locationSettings.enabled}
                disabled={locationButtonLoading}
                onchange={toggleLocationPermission}
              />
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <div class="settings-item">
          <div class="item-icon bell">
            <Bell size={18} />
          </div>
          <div class="item-info">
            <span>Notificaciones</span>
            <p>{getPushDescription()}</p>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              checked={pushEnabled}
              disabled={!canUsePush || pushButtonLoading || pushEnabled || pushState.permission === "denied" || pushState.status === "local-enabled"}
              onchange={handleEnablePush}
            />
            <span class="slider"></span>
          </label>
        </div>

        <div class="notification-preferences">
          <div class="notification-preferences-heading">
            <span>Personalizar notificaciones</span>
            <p>Elige qué avisos quieres recibir en la app y por push.</p>
          </div>

          {#each notificationPreferenceOptions as option}
            <div class="settings-item notification-option">
              <div class="item-info">
                <span>{option.label}</span>
                <p>{option.description}</p>
              </div>
              <label class="switch">
                <input
                  type="checkbox"
                  checked={notificationPreferences[option.key]}
                  disabled={Boolean(notificationPreferenceSavingKey)}
                  onchange={() => toggleNotificationPreference(option.key)}
                />
                <span class="slider"></span>
              </label>
            </div>
          {/each}
        </div>

        <div class="settings-item reminder-option">
          <div class="item-icon reminder">
            <AlarmClock size={18} />
          </div>
          <div class="item-info">
            <span>Recordatorio</span>
            <p>{getReminderDescription()}</p>
            <input
              id="reminder-message"
              class="reminder-message-input"
              type="text"
              value={reminder.message}
              maxlength="180"
              disabled={reminderSaving}
              placeholder="Qué quieres recordar"
              aria-label="Qué quieres recordar"
              onchange={handleReminderMessageChange}
            />
          </div>
          <div class="reminder-controls">
            <input
              id="reminder-time"
              class="reminder-time-input"
              type="time"
              value={reminder.time}
              step="300"
              disabled={reminderSaving}
              aria-label="Hora del recordatorio"
              onchange={handleReminderTimeChange}
            />
            <label class="switch" aria-label="Activar recordatorio">
              <input
                type="checkbox"
                checked={reminder.enabled}
                disabled={reminderSaving}
                onchange={toggleReminder}
              />
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <div class="settings-item">
          <div class="item-icon moon">
            <Moon size={18} />
          </div>
          <div class="item-info">
            <span>Modo Oscuro</span>
            <p>Usar tema oscuro en la interfaz</p>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              checked={$settingsStore?.darkMode || false}
              onchange={toggleDarkMode}
            />
            <span class="slider"></span>
          </label>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h3>Aplicación</h3>
      <div class="settings-list">
        <button class="settings-item actionable" onclick={()=>(showUpdateModal=true)}>
          <div class="item-icon info">
            <Info size={18} />
          </div>
          <div class="item-info">
            <span>Sobre MetricWork</span>
            <p>{updateData.version}</p>
          </div>
          <ChevronRight size={18} class="chevron" />
        </button>
        {#if $systemAdminStore.isAdmin}
          <a href="/system-admin">
            <button class="settings-item actionable">
              <div class="item-icon shield">
                <ShieldCheck size={18} />
              </div>
              <div class="item-info">
                <span>Panel admin</span>
                <p>Códigos y fechas de cobro</p>
              </div>
              <ChevronRight size={18} class="chevron" />
            </button>
          </a>
        {/if}
        <a href="/tour">
          <button class="settings-item actionable">
            <div class="item-icon album">
              <Album size={18} />
            </div>
            <div class="item-info">
              <span>Tutorial</span>
              <p>Aprende a usar MetricWork</p>
            </div>
            <ChevronRight size={18} class="chevron" />
          </button>
        </a>
      </div>
    </section>

    <section class="settings-group">
      <h3>Legal</h3>
      <div class="settings-list">
        <button class="settings-item actionable" type="button" onclick={openCookiePreferences}>
          <div class="item-icon cookie">
            <Cookie size={18} />
          </div>
          <div class="item-info">
            <span>Preferencias de cookies</span>
            <p>Gestionar analitica y almacenamiento.</p>
          </div>
          <ChevronRight size={18} class="chevron" />
        </button>

        <a href="/terms" class="settings-item actionable">
          <div class="item-icon legal">
            <FileText size={18} />
          </div>
          <div class="item-info">
            <span>Terminos y condiciones</span>
            <p>Reglas de uso de MetricWork.</p>
          </div>
          <ChevronRight size={18} class="chevron" />
        </a>

        <a href="/privacy" class="settings-item actionable">
          <div class="item-icon privacy">
            <ShieldCheck size={18} />
          </div>
          <div class="item-info">
            <span>Politica de privacidad</span>
            <p>Datos, finalidades y derechos.</p>
          </div>
          <ChevronRight size={18} class="chevron" />
        </a>

        <a href="/cookies" class="settings-item actionable">
          <div class="item-icon cookie">
            <Cookie size={18} />
          </div>
          <div class="item-info">
            <span>Politica de cookies</span>
            <p>Cookies, localStorage y analitica.</p>
          </div>
          <ChevronRight size={18} class="chevron" />
        </a>

        <a href="/legal" class="settings-item actionable">
          <div class="item-icon legal">
            <Scale size={18} />
          </div>
          <div class="item-info">
            <span>Aviso legal</span>
            <p>Datos del titular y contacto.</p>
          </div>
          <ChevronRight size={18} class="chevron" />
        </a>
      </div>
    </section>

    <button class="logout-btn" onclick={handleLogout}>
      <LogOut size={20} />
      <span>Cerrar Sesión</span>
    </button>
  </div>
</div>

<style>
  .settings-page {
    padding: 22px 18px var(--bottom-nav-clearance);
    padding-top: var(--page-top-safe);
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background: var(--bg-page);
    overflow-y: auto;
  }

  header {
    margin-bottom: 24px;
  }


  .content {
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  .profile-card {
    background: var(--bg-card);
    padding: 24px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    backdrop-filter: blur(14px);
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .profile-form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .profile-notice {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--accent-color) 32%, var(--border-color));
    border-radius: var(--radius-md);
    background: var(--bg-accent-subtle);
    color: var(--text-primary);
  }

  .profile-notice p {
    margin: 0;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 750;
    line-height: 1.35;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .input-group label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-left: 4px;
  }

  .input-wrapper {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-input);
    padding: 12px 16px;
    border: 1px solid var(--border-color);
    border-radius: 18px;
    color: var(--text-secondary);
  }

  .input-wrapper input {
    background: transparent;
    border: none;
    outline: none;
    width: 100%;
    font-size: 16px;
    color: var(--text-primary);
    font-weight: 500;
  }

  .input-wrapper.disabled {
    opacity: 0.6;
  }

  .input-help {
    margin: 0 4px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 650;
    line-height: 1.35;
  }

  .input-help.warning {
    color: var(--danger-color);
  }

  .save-btn {
    margin-top: 8px;
    background: var(--accent-strong);
    color: var(--bg-card);
    border: none;
    padding: 16px;
    border-radius: var(--radius-md);
    font-size: 16px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    cursor: pointer;
    box-shadow: var(--shadow-button);
  }

  .save-btn:disabled {
    opacity: 0.7;
  }

  .settings-group h3 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
    margin: 0 0 16px 4px;
  }

  .settings-list {
    background: var(--bg-card-raised);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    overflow: hidden;
    box-shadow: var(--shadow-card);
    backdrop-filter: blur(14px);
  }

  .settings-item {
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    border-bottom: 1px solid var(--border-color);
  }

  .settings-item.actionable {
    width: 100%;
    background: none;
    border: none;
    border-bottom: 1px solid var(--border-color);
    text-align: left;
    cursor: pointer;
    color: var(--text-primary);
  }

  .settings-item.actionable:active {
    background: var(--bg-input);
  }

  .settings-item:last-child {
    border-bottom: none;
  }

  .notification-preferences {
    border-bottom: 1px solid var(--border-color);
  }

  .notification-preferences-heading {
    padding: 16px 20px 10px;
  }

  .notification-preferences-heading span {
    display: block;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 800;
  }

  .notification-preferences-heading p {
    margin: 3px 0 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.35;
  }

  .notification-option {
    padding-top: 12px;
    padding-bottom: 12px;
  }

  .reminder-option {
    align-items: center;
  }

  .reminder-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .reminder-time-input {
    width: 98px;
    min-height: 38px;
    padding: 0 10px;
    border: 1px solid var(--border-color);
    border-radius: 14px;
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 700;
    outline: none;
  }

  .reminder-time-input:focus {
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px var(--bg-accent-subtle);
  }

  .reminder-time-input:disabled {
    opacity: 0.6;
  }

  .reminder-message-input {
    width: min(100%, 360px);
    min-height: 38px;
    margin-top: 10px;
    padding: 0 12px;
    border: 1px solid var(--border-color);
    border-radius: 14px;
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 600;
    outline: none;
    box-sizing: border-box;
  }

  .reminder-message-input:focus {
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px var(--bg-accent-subtle);
  }

  .reminder-message-input:disabled {
    opacity: 0.6;
  }

  .item-icon {
    width: 40px;
    height: 40px;
    border-radius: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .item-icon.bell {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }
  .item-icon.location {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }
  .item-icon.reminder {
    background: var(--bg-info-subtle);
    color: var(--info-color);
  }
  .item-icon.moon {
    background: var(--bg-purple-subtle);
    color: var(--purple-color);
  }
  .item-icon.info {
    background: var(--bg-info-subtle);
    color: var(--info-color);
  }
  .item-icon.album {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }
  .item-icon.shield {
    background: var(--bg-accent-subtle);
    color: var(--accent-ink);
  }
  .item-icon.cookie {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }
  .item-icon.legal {
    background: var(--bg-input);
    color: var(--text-primary);
  }
  .item-icon.privacy {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }

  .item-info {
    flex: 1;
    min-width: 0;
  }
  a {
    text-decoration: none;
  }

  .item-info span {
    display: block;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .item-info p {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.35;
  }

  .setting-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .permission-btn {
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .permission-btn:disabled {
    cursor: default;
    opacity: 0.58;
  }

  /* Switch Toggle Styles */
  .switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--bg-input);
    transition: 0.4s;
    border-radius: 24px;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: var(--bg-card);
    transition: 0.4s;
    border-radius: 50%;
  }

  input:checked + .slider {
    background-color: var(--accent-color);
  }

  input:checked + .slider:before {
    transform: translateX(20px);
  }

  .logout-btn {
    width: 100%;
    padding: 16px;
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
    border: none;
    border-radius: 22px;
    font-size: 16px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    cursor: pointer;
    margin-top: 16px;
    margin-bottom: 0;
    transition: background 0.2s;
  }

  .logout-btn:active {
    background: var(--bg-danger-subtle);
  }

  @media (max-width: 520px) {
    .settings-item {
      padding: 14px 16px;
      gap: 12px;
    }

    .reminder-option {
      align-items: flex-start;
    }

    .reminder-controls {
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
    }

    .setting-actions {
      flex-direction: column-reverse;
      align-items: flex-end;
      gap: 8px;
    }

    .reminder-time-input {
      width: 92px;
      font-size: 13px;
    }
  }
</style>
