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
    Moon,
    ChevronRight,
    Save,
    Info,
    Album,
    Settings
  } from "lucide-svelte";
  import {
    userStore,
    logout,
    updateUserProfile,
    getUserProfile,
    getUserPrivateProfile,
    settingsStore,
    teamsStore,
    updateSettings,
    pushNotificationState,
    requestPushNotifications,
  } from "../data/stores.js";
  import { navigateTo } from "../router.js";

  import AvatarCircle from "../components/AvatarCircle.svelte";
  import Toast from "../components/Toast.svelte";
  import UpdateFeaturesModal from "../components/UpdateFeaturesModal.svelte";
  import {updateData} from "../data/updateFeatures.js";
  import { showErrorAlert } from "../data/alerts.js";
  import TitleHeader from "../components/TitleHeader.svelte";

  let name = $state("");
  let email = $state("");
  let phone = $state("");
  let address = $state("");
  let iban = $state("");
  let isSaving = $state(false);
  let showToast = $state(false);
  let toastMessage = $state("");
  let toastType = $state("success");
  let showUpdateModal = $state(false);
  let canUsePush = $state(false);
  let pushButtonLoading = $state(false);
  let pushState = $derived($pushNotificationState);
  let pushEnabled = $derived(pushState.status === "enabled" && Boolean(pushState.token));

  onMount(async () => {
    canUsePush = "Notification" in window && "serviceWorker" in navigator;

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
        phone = privateProfile.phone || "";
        address = privateProfile.address || "";
        iban = privateProfile.iban || "";
      }
    }
  });

  async function handleSave() {
    if (!$userStore) return;
    isSaving = true;
    try {
      const success = await updateUserProfile($userStore.uid, {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        iban: iban.trim().toUpperCase(),
      }, {
        teamIds: ($teamsStore || []).map((team) => team.id),
      });
      if (success) {
        toastMessage = "Perfil actualizado correctamente";
        toastType = "success";
        showToast = true;
      }
    } catch (error) {
      toastMessage = "Error al guardar los cambios";
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

  .item-info {
    flex: 1;
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
</style>
