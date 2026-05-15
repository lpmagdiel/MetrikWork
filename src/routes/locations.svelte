<script>
  import { ArrowLeft, Crosshair, MapPinned, Plus, Trash2, X } from "lucide-svelte";
  import { addLocation, deleteLocation, locationsStore, userStore } from "../data/stores.js";
  import { navigateTo } from "../router.js";
  import LocationBox from "../components/LocationBox.svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import { confirmAlert, showErrorAlert } from "../data/alerts.js";

  let showForm = $state(false);
  let previousShowForm = $state(false);
  let isSaving = $state(false);
  let isLocating = $state(false);
  let errorMessage = $state("");

  let form = $state({
    name: "",
    description: "",
    lat: "",
    lon: "",
  });

  let sortedLocations = $derived(
    [...$locationsStore].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  );

  $effect(() => {
    if (previousShowForm && !showForm) {
      resetForm();
    }
    previousShowForm = showForm;
  });

  function resetForm() {
    form = {
      name: "",
      description: "",
      lat: "",
      lon: "",
    };
    errorMessage = "";
    isLocating = false;
  }

  function openForm() {
    resetForm();
    showForm = true;
  }

  function closeForm() {
    showForm = false;
    resetForm();
  }

  async function saveLocation() {
    if (!form.name.trim() || !$userStore?.uid) return;

    const hasLat = form.lat.trim() !== "";
    const hasLon = form.lon.trim() !== "";
    let gps = null;

    if (hasLat || hasLon) {
      const lat = Number(form.lat);
      const lon = Number(form.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        errorMessage = "Introduce coordenadas GPS válidas.";
        return;
      }

      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        errorMessage = "La latitud debe estar entre -90 y 90, y la longitud entre -180 y 180.";
        return;
      }

      gps = { lat, lon };
    }

    isSaving = true;
    errorMessage = "";

    try {
      await addLocation($userStore.uid, {
        name: form.name.trim(),
        description: form.description.trim(),
        gps,
      });
      closeForm();
    } catch (error) {
      console.error("Error saving location:", error);
      errorMessage = "No se pudo guardar la ubicación.";
    } finally {
      isSaving = false;
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      errorMessage = "Tu navegador no permite obtener la ubicación GPS.";
      return;
    }

    isLocating = true;
    errorMessage = "";

    navigator.geolocation.getCurrentPosition(
      (position) => {
        form.lat = position.coords.latitude.toFixed(6);
        form.lon = position.coords.longitude.toFixed(6);
        isLocating = false;
      },
      (error) => {
        const messages = {
          1: "Permiso de ubicación denegado.",
          2: "No se pudo obtener tu ubicación actual.",
          3: "La solicitud de ubicación tardó demasiado.",
        };

        errorMessage = messages[error.code] || "No se pudo obtener tu ubicación actual.";
        isLocating = false;
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }

  async function removeLocation(location) {
    if (!$userStore?.uid || !location?.id) return;
    const confirmed = await confirmAlert({
      title: "Eliminar ubicación",
      text: `¿Eliminar "${location.name}"?`,
      confirmButtonText: "Eliminar",
      danger: true,
    });
    if (!confirmed) return;

    try {
      await deleteLocation($userStore.uid, location.id);
    } catch (error) {
      console.error("Error deleting location:", error);
      showErrorAlert("Error", "No se pudo eliminar la ubicación");
    }
  }
</script>

<div class="locations-page">
  <header>
    <button class="icon-btn" onclick={() => navigateTo("/")}>
      <ArrowLeft size={22} />
    </button>
    <div class="title-block">
      <MapPinned size={22} />
      <h1>Ubicaciones</h1>
    </div>
    <button class="add-btn" onclick={openForm}>
      <Plus size={20} />
    </button>
  </header>

  <main class="locations-content">
    {#if sortedLocations.length === 0}
      <div class="empty-state">
        <MapPinned size={54} />
        <h2>No tienes ubicaciones</h2>
        <p>Guarda lugares con nombre, descripción y coordenadas GPS opcionales.</p>
        <button onclick={openForm}>
          <Plus size={18} />
          Nueva ubicación
        </button>
      </div>
    {:else}
      <div class="locations-list">
        {#each sortedLocations as location (location.id)}
          <article class="location-item">
            <LocationBox
              gps={location.gps}
              name={location.name}
              description={location.description || "Sin descripción"}
            />
            <button class="delete-btn" onclick={() => removeLocation(location)} aria-label="Eliminar ubicación">
              <Trash2 size={18} />
            </button>
          </article>
        {/each}
      </div>
    {/if}
  </main>

  <SliceContainer bind:show={showForm}>
    <div class="location-form" role="dialog" aria-modal="true" aria-labelledby="location-form-title" tabindex="-1">
      <div class="form-header">
        <h2 id="location-form-title">Nueva ubicación</h2>
        <button class="icon-btn" onclick={closeForm} aria-label="Cerrar">
          <X size={20} />
        </button>
      </div>

      <label>
        Nombre
        <input type="text" bind:value={form.name} placeholder="Oficina, cliente, almacén..." />
      </label>

      <label>
        Descripción
        <textarea bind:value={form.description} rows="4" placeholder="Notas sobre esta ubicación"></textarea>
      </label>

      <div class="coords-grid">
        <label>
          Latitud
          <input type="number" step="any" bind:value={form.lat} placeholder="40.4168" />
        </label>
        <label>
          Longitud
          <input type="number" step="any" bind:value={form.lon} placeholder="-3.7038" />
        </label>
      </div>

      <button class="gps-btn" onclick={useCurrentLocation} disabled={isLocating}>
        <Crosshair size={18} />
        {isLocating ? "Obteniendo ubicación..." : "Usar mi ubicación actual"}
      </button>

      {#if errorMessage}
        <p class="form-error">{errorMessage}</p>
      {/if}

      <button class="save-btn" onclick={saveLocation} disabled={!form.name.trim() || isSaving}>
        {isSaving ? "Guardando..." : "Guardar ubicación"}
      </button>
    </div>
  </SliceContainer>
</div>

<style>
  .locations-page {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background: var(--bg-page);
    padding: calc(var(--page-top-safe) + 14px) 18px var(--bottom-nav-clearance);
  }

  header {
    display: grid;
    grid-template-columns: 40px 1fr 40px;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
  }

  .title-block {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  h1 {
    font-size: 22px;
    line-height: 1.2;
  }

  button {
    border: 0;
    cursor: pointer;
  }

  .icon-btn,
  .add-btn,
  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--bg-card);
    color: var(--text-primary);
    box-shadow: var(--shadow-card);
  }

  .add-btn {
    background: var(--accent-strong);
    color: var(--bg-card);
  }

  .locations-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .locations-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .location-item {
    position: relative;
  }

  .location-item :global(.location-box) {
    margin: 0;
  }

  .delete-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 36px;
    height: 36px;
    color: var(--danger-color);
  }

  .empty-state {
    min-height: 58vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    text-align: center;
    color: var(--text-secondary);
  }

  .empty-state h2 {
    font-size: 20px;
  }

  .empty-state p {
    max-width: 310px;
    line-height: 1.45;
  }

  .empty-state button,
  .gps-btn,
  .save-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 999px;
    background: var(--accent-strong);
    color: var(--bg-card);
    font-weight: 700;
  }

  .gps-btn {
    width: 100%;
    border-radius: 12px;
    background: var(--bg-input);
    color: var(--text-primary);
  }

  .location-form {
    width: min(100%, 520px);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
    border-radius: var(--radius-md);
    background: var(--bg-card);
    box-shadow: var(--shadow-soft);
  }

  .form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .form-header h2 {
    font-size: 20px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 7px;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 700;
  }

  input,
  textarea {
    width: 100%;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--bg-input);
    color: var(--text-primary);
    padding: 12px;
    font-size: 15px;
  }

  textarea {
    resize: vertical;
  }

  .coords-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .form-error {
    color: var(--danger-color);
    font-size: 13px;
    font-weight: 700;
  }

  .save-btn {
    width: 100%;
    border-radius: 12px;
  }

  .gps-btn:disabled,
  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 420px) {
    .coords-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
