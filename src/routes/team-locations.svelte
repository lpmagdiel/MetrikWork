<script>
  import {
    Crosshair,
    DollarSign,
    Edit2,
    MapPinned,
    Navigation,
    Plus,
    Save,
    Trash2,
  } from "lucide-svelte";
  import {
    selectedTeam,
    selectedTeamId,
    userStore,
    teamLocationsStore,
    subscribeToTeamLocations,
    addTeamLocation,
    updateTeamLocation,
    deleteTeamLocation,
    getUserProfile,
    hasTeamPermission,
  } from "../data/stores.js";
  import { navigateTo } from "../router.js";
  import SliceContainer from "../components/SliceContainer.svelte";
  import Toast from "../components/Toast.svelte";
  import CircleAddButton from "../components/CircleAddButton.svelte";
  import TitleHeader from "../components/TitleHeader.svelte";
  import { confirmAlert } from "../data/alerts.js";
  import { currentUserLocation, getCurrentGpsPosition } from "../data/geolocation.js";
  import { distanceInfo } from "../helpers/navigation.js";

  let team = $derived($selectedTeam);
  let teamId = $derived(team?.id || $selectedTeamId);
  let isAdmin = $derived(team?.admin === $userStore?.uid);
  let canViewPayments = $derived(hasTeamPermission(team, $userStore?.uid, "payments", "view"));
  let canViewLocationBudget = $derived(isAdmin || canViewPayments);
  let canViewInventory = $derived(hasTeamPermission(team, $userStore?.uid, "inventory", "view"));
  let canViewStats = $derived(hasTeamPermission(team, $userStore?.uid, "stats", "view"));
  let canViewSettings = $derived(hasTeamPermission(team, $userStore?.uid, "settings", "view"));
  let canCreateSettings = $derived(hasTeamPermission(team, $userStore?.uid, "settings", "create"));
  let canEditSettings = $derived(hasTeamPermission(team, $userStore?.uid, "settings", "edit"));
  let canDeleteSettings = $derived(hasTeamPermission(team, $userStore?.uid, "settings", "delete"));
  let canViewLocations = $derived(
    hasTeamPermission(team, $userStore?.uid, "locations", "view") ||
      canViewInventory ||
      canViewStats ||
      canViewSettings,
  );
  let canCreateLocations = $derived(
    hasTeamPermission(team, $userStore?.uid, "locations", "create") ||
      canCreateSettings,
  );
  let canEditLocations = $derived(
    hasTeamPermission(team, $userStore?.uid, "locations", "edit") ||
      canEditSettings,
  );
  let canDeleteLocations = $derived(
    hasTeamPermission(team, $userStore?.uid, "locations", "delete") ||
      canDeleteSettings,
  );

  let memberList = $state([]);
  let showLocationForm = $state(false);
  let editingLocationId = $state(null);
  let isSavingLocation = $state(false);
  let isLocating = $state(false);
  let locationError = $state("");
  let messageToast = $state("");
  let typeToast = $state("");
  let showToast = $state(false);
  let locationForm = $state({
    name: "",
    description: "",
    lat: "",
    lon: "",
    budget: 0,
    assignedMemberIds: [],
  });

  $effect(() => {
    if (teamId && canViewLocations) {
      subscribeToTeamLocations(teamId);
    }
    return () => subscribeToTeamLocations(null);
  });

  $effect(() => {
    let active = true;
    if (team?.members) {
      Promise.all(team.members.map((memberId) => getUserProfile(memberId))).then((users) => {
        if (active) memberList = users.filter(Boolean);
      });
    } else {
      memberList = [];
    }
    return () => {
      active = false;
    };
  });

  function goToTeamHome() {
    navigateTo(teamId ? `/teams/${teamId}` : "/teams");
  }

  function showNotification(msg, type = "success") {
    messageToast = msg;
    typeToast = type;
    showToast = true;
    setTimeout(() => {
      showToast = false;
    }, 3000);
  }

  function resetLocationForm() {
    editingLocationId = null;
    locationForm = {
      name: "",
      description: "",
      lat: "",
      lon: "",
      budget: 0,
      assignedMemberIds: [],
    };
    locationError = "";
    isLocating = false;
  }

  function openLocationForm() {
    resetLocationForm();
    showLocationForm = true;
  }

  function openEditLocationForm(location) {
    editingLocationId = location.id;
    locationForm = {
      name: location.name || "",
      description: location.description || "",
      lat: location.gps?.lat?.toString() || "",
      lon: location.gps?.lon?.toString() || "",
      budget: Number(location.budget) || 0,
      assignedMemberIds: Array.isArray(location.assignedMemberIds)
        ? [...location.assignedMemberIds]
        : [],
    };
    locationError = "";
    isLocating = false;
    showLocationForm = true;
  }

  function closeLocationForm() {
    showLocationForm = false;
    resetLocationForm();
  }

  function toggleLocationMember(memberId) {
    if (!memberId) return;
    locationForm.assignedMemberIds = locationForm.assignedMemberIds.includes(memberId)
      ? locationForm.assignedMemberIds.filter((id) => id !== memberId)
      : [...locationForm.assignedMemberIds, memberId];
  }

  function getLocationAssignedMembers(location) {
    const assignedIds = Array.isArray(location?.assignedMemberIds)
      ? location.assignedMemberIds
      : [];
    return memberList.filter((member) => assignedIds.includes(member.id));
  }

  function getMemberInitials(memberId) {
    const member = memberList.find((m) => m.id === memberId);
    if (!member) return "?";
    const parts = (member.name || member.email || "?").split(" ");
    return parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0][0];
  }

  function formatLocationBudget(value) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: team?.projectBudgetCurrency || "MXN",
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  }

  function normalizeCoordinates(value) {
    const lat = Number(value?.lat);
    const lon = Number(value?.lon ?? value?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  }

  function getLocationDistanceLabel(location) {
    const userCoordinates = normalizeCoordinates($currentUserLocation);
    const locationCoordinates = normalizeCoordinates(location?.gps);
    if (!userCoordinates || !locationCoordinates) return "";
    return distanceInfo(userCoordinates, locationCoordinates);
  }

  function getLocationMapsUrl(location) {
    const locationCoordinates = normalizeCoordinates(location?.gps);

    if (locationCoordinates) {
      const destination = `${locationCoordinates.lat},${locationCoordinates.lon}`;
      return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
    }

    const query = [location?.name, location?.description].filter(Boolean).join(" ");
    return query
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
      : "";
  }

  async function useCurrentLocation() {
    isLocating = true;
    locationError = "";

    try {
      const gps = await getCurrentGpsPosition();
      locationForm.lat = gps.lat;
      locationForm.lon = gps.lon;
    } catch (error) {
      locationError = error.message || "No se pudo obtener tu ubicación actual.";
    } finally {
      isLocating = false;
    }
  }

  async function saveTeamLocation() {
    if (!teamId || !locationForm.name.trim()) return;

    const hasLat = locationForm.lat.trim() !== "";
    const hasLon = locationForm.lon.trim() !== "";
    let gps = null;

    if (hasLat || hasLon) {
      const lat = Number(locationForm.lat);
      const lon = Number(locationForm.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        locationError = "Introduce coordenadas GPS válidas.";
        return;
      }

      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        locationError = "La latitud debe estar entre -90 y 90, y la longitud entre -180 y 180.";
        return;
      }

      gps = { lat, lon };
    }

    isSavingLocation = true;
    locationError = "";
    try {
      const wasEditingLocation = Boolean(editingLocationId);
      const currentLocation = editingLocationId
        ? $teamLocationsStore.find((location) => location.id === editingLocationId)
        : null;
      const locationData = {
        name: locationForm.name.trim(),
        description: locationForm.description.trim(),
        gps,
        budget: canViewLocationBudget ? locationForm.budget : Number(currentLocation?.budget) || 0,
        assignedMemberIds: locationForm.assignedMemberIds,
      };

      if (editingLocationId) {
        await updateTeamLocation(teamId, editingLocationId, locationData);
      } else {
        await addTeamLocation(teamId, locationData);
      }
      closeLocationForm();
      showNotification(
        wasEditingLocation ? "Ubicación actualizada" : "Ubicación agregada al equipo",
        "success",
      );
    } catch (error) {
      console.error("Error saving team location:", error);
      locationError = "No se pudo guardar la ubicación.";
    } finally {
      isSavingLocation = false;
    }
  }

  async function removeTeamLocation(location) {
    if (!teamId || !location?.id) return;
    const confirmed = await confirmAlert({
      title: "Eliminar ubicación",
      text: `¿Eliminar "${location.name}"?`,
      confirmButtonText: "Eliminar",
      danger: true,
    });
    if (!confirmed) return;

    try {
      await deleteTeamLocation(teamId, location.id);
      showNotification("Ubicación eliminada", "success");
    } catch (error) {
      console.error("Error deleting location:", error);
      showNotification("No se pudo eliminar la ubicación", "error");
    }
  }
</script>

<div class="team-locations-page">
  <Toast message={messageToast} type={typeToast} show={showToast} />
  <TitleHeader title="Ubicaciones" description={team?.name || ""} action={goToTeamHome} />

  {#if team && canViewLocations}
    {#if canCreateLocations}
      <CircleAddButton onClick={openLocationForm} floating={true} />
    {/if}

    <main class="locations-content">
      {#if $teamLocationsStore.length === 0}
        <div class="empty-state">
          <MapPinned size={54} />
          <h2>No hay ubicaciones</h2>
          <p>Guarda lugares del equipo para enlazarlos con inventario y trabajo.</p>
          {#if canCreateLocations}
            <button onclick={openLocationForm}>
              <Plus size={18} />
              Nueva ubicación
            </button>
          {/if}
        </div>
      {:else}
        <div class="locations-list">
          {#each $teamLocationsStore as location (location.id)}
            {@const mapsUrl = getLocationMapsUrl(location)}
            <article class="location-item">
              <div class="location-icon">
                <MapPinned size={20} />
              </div>
              <div class="location-info">
                <h4>{location.name}</h4>
                <p>{location.description || "Sin descripción"}</p>
                {#if canViewLocationBudget && Number(location.budget) > 0}
                  <small class="location-budget">Presupuesto: {formatLocationBudget(location.budget)}</small>
                {/if}
                {#if getLocationDistanceLabel(location)}
                  <small class="location-distance">a {getLocationDistanceLabel(location)} de ti</small>
                {/if}
                {#if location.gps}
                  <small>{location.gps.lat}, {location.gps.lon}</small>
                {/if}
                {#if getLocationAssignedMembers(location).length}
                  <div class="assigned-members">
                    {#each getLocationAssignedMembers(location).slice(0, 4) as assignedMember}
                      <span>{getMemberInitials(assignedMember.id)}</span>
                    {/each}
                    {#if getLocationAssignedMembers(location).length > 4}
                      <span>+{getLocationAssignedMembers(location).length - 4}</span>
                    {/if}
                  </div>
                {/if}
              </div>
              {#if mapsUrl || canEditLocations || canDeleteLocations}
                <div class="location-actions">
                  {#if mapsUrl}
                    <a
                      class="location-action-btn navigation-action-btn"
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir ${location.name || "ubicación"} en Maps`}
                      title="Abrir en Maps"
                    >
                      <Navigation size={18} />
                      <span>Maps</span>
                    </a>
                  {/if}
                  {#if canEditLocations}
                    <button
                      class="location-action-btn"
                      onclick={() => openEditLocationForm(location)}
                      aria-label="Editar ubicación"
                    >
                      <Edit2 size={18} />
                    </button>
                  {/if}
                  {#if canDeleteLocations}
                    <button
                      class="location-action-btn"
                      onclick={() => removeTeamLocation(location)}
                      aria-label="Eliminar ubicación"
                    >
                      <Trash2 size={18} />
                    </button>
                  {/if}
                </div>
              {/if}
            </article>
          {/each}
        </div>
      {/if}
    </main>

    <SliceContainer bind:show={showLocationForm}>
      <div class="location-form">
        <h3>{editingLocationId ? "Editar ubicación" : "Nueva ubicación"}</h3>
        <p class="form-instruction">
          {editingLocationId
            ? "Actualiza este lugar del equipo y sus datos GPS opcionales."
            : "Guarda un lugar del equipo para enlazarlo con productos del inventario."}
        </p>

        <div class="form-group">
          <label for="team-location-name">Nombre</label>
          <input
            id="team-location-name"
            type="text"
            bind:value={locationForm.name}
            placeholder="Salón de Barcelona, almacén..."
          />
        </div>

        <div class="form-group">
          <label for="team-location-description">Descripción</label>
          <textarea
            id="team-location-description"
            rows="4"
            bind:value={locationForm.description}
            placeholder="Notas sobre esta ubicación"
          ></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="team-location-lat">Latitud</label>
            <input
              id="team-location-lat"
              type="number"
              step="any"
              bind:value={locationForm.lat}
              placeholder="41.3874"
            />
          </div>
          <div class="form-group">
            <label for="team-location-lon">Longitud</label>
            <input
              id="team-location-lon"
              type="number"
              step="any"
              bind:value={locationForm.lon}
              placeholder="2.1686"
            />
          </div>
        </div>

        {#if canViewLocationBudget}
          <div class="form-group">
            <label for="team-location-budget">Presupuesto de la ubicación</label>
            <div class="input-with-icon">
              <DollarSign size={18} color="#1be885" />
              <input
                id="team-location-budget"
                type="number"
                min="0"
                step="0.01"
                bind:value={locationForm.budget}
                placeholder="0.00"
              />
            </div>
          </div>
        {/if}

        <button class="secondary-action-btn" onclick={useCurrentLocation} disabled={isLocating}>
          <Crosshair size={18} />
          <span>{isLocating ? "Obteniendo ubicación..." : "Usar mi ubicación actual"}</span>
        </button>

        <div class="form-group">
          <p class="member-picker-label">Miembros asignados</p>
          <div class="location-member-grid">
            {#each memberList as member}
              <button
                type="button"
                class:active={locationForm.assignedMemberIds.includes(member.id)}
                onclick={() => toggleLocationMember(member.id)}
              >
                <span>{getMemberInitials(member.id)}</span>
                <strong>{member.name || member.email || "Usuario"}</strong>
              </button>
            {/each}
          </div>
        </div>

        {#if locationError}
          <p class="form-error">{locationError}</p>
        {/if}

        <button
          class="save-location-btn"
          onclick={saveTeamLocation}
          disabled={isSavingLocation || !locationForm.name.trim()}
        >
          {#if isSavingLocation}
            <span>Guardando...</span>
          {:else}
            <Save size={20} />
            <span>{editingLocationId ? "Actualizar Ubicación" : "Guardar Ubicación"}</span>
          {/if}
        </button>
      </div>
    </SliceContainer>
  {:else if team}
    <div class="empty-state">
      <MapPinned size={54} />
      <h2>Sin permiso</h2>
      <p>No tienes permiso para ver las ubicaciones de este equipo.</p>
    </div>
  {:else}
    <div class="empty-state">
      <p>No se seleccionó ningún equipo.</p>
      <button onclick={goToTeamHome}>Volver</button>
    </div>
  {/if}
</div>

<style>
  .team-locations-page {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background: var(--bg-page);
    padding: calc(var(--page-top-safe) + 14px) 18px var(--bottom-nav-clearance);
    box-sizing: border-box;
  }

  button {
    border: 0;
    cursor: pointer;
  }

  .locations-content {
    padding-top: 16px;
  }

  .locations-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-bottom: 16px;
  }

  .location-item {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
  }

  .location-icon {
    width: 44px;
    aspect-ratio: 1;
    border-radius: 12px;
    background: var(--bg-info-subtle);
    color: var(--info-color);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .location-info {
    min-width: 0;
  }

  .location-info h4,
  .location-info p,
  .location-info small {
    margin: 0;
  }

  .location-info h4 {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 700;
    line-height: 1.25;
  }

  .location-info p,
  .location-info small {
    color: var(--text-secondary);
    display: block;
    font-size: 13px;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .location-info .location-budget {
    color: var(--success-color);
    font-weight: 800;
  }

  .location-info .location-distance {
    color: var(--info-color);
    font-weight: 800;
  }

  .location-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .location-action-btn {
    min-height: 36px;
    background: var(--button-secondary-bg);
    border: 1px solid var(--control-border);
    color: var(--text-secondary);
    padding: 8px 9px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 8px;
    text-decoration: none;
    font: inherit;
    font-size: 13px;
    font-weight: 800;
  }

  .location-action-btn:hover {
    border-color: var(--control-border-strong);
    background: var(--button-secondary-bg-hover);
    color: var(--text-primary);
    transform: translateY(-1px);
    box-shadow: var(--interactive-shadow);
  }

  .navigation-action-btn {
    border-color: transparent;
    background: var(--button-primary-bg);
    color: var(--button-primary-ink);
    box-shadow: 0 8px 18px rgba(20, 20, 20, 0.08);
  }

  .navigation-action-btn:hover {
    border-color: transparent;
    background: var(--button-primary-bg);
    color: var(--button-primary-ink);
    box-shadow: var(--interactive-shadow);
    filter: saturate(1.08);
  }

  .assigned-members {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 8px;
  }

  .assigned-members span,
  .location-member-grid button span {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: var(--bg-accent-subtle);
    color: var(--accent-ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 800;
  }

  .empty-state {
    min-height: 55vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    color: var(--text-secondary);
    text-align: center;
    padding: 24px;
  }

  .empty-state h2,
  .empty-state p {
    margin: 0;
  }

  .empty-state button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-radius: var(--radius-sm);
    background: var(--accent-color);
    color: #fff;
    font-weight: 800;
  }

  .location-form {
    padding: 24px;
  }

  .location-form h3 {
    margin: 0 0 12px;
    font-size: 20px;
    font-weight: 700;
  }

  .form-instruction {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 24px;
    line-height: 1.5;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label,
  .member-picker-label {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .form-group > input,
  .form-group > textarea {
    width: 100%;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    box-sizing: border-box;
    font-size: 15px;
    padding: 12px 14px;
    outline: none;
  }

  .form-group > textarea {
    resize: vertical;
    min-height: 104px;
  }

  .form-group > input:focus,
  .form-group > textarea:focus {
    border-color: var(--accent-color);
    background: var(--bg-card);
  }

  .input-with-icon {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-input);
    padding: 12px 16px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
    transition: border-color 0.2s ease;
  }

  .input-with-icon:focus-within {
    border-color: var(--accent-color);
  }

  .input-with-icon input {
    background: transparent;
    border: none;
    outline: none;
    width: 100%;
    font-size: 16px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .secondary-action-btn {
    width: 100%;
    min-height: 44px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-weight: 700;
    cursor: pointer;
    margin-bottom: 20px;
  }

  .secondary-action-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .location-member-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 8px;
  }

  .location-member-grid button {
    min-height: 48px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 8px;
    cursor: pointer;
    text-align: left;
  }

  .location-member-grid button.active {
    border-color: var(--accent-strong);
    background: var(--bg-accent-subtle);
  }

  .location-member-grid strong {
    min-width: 0;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .form-error {
    margin: 12px 0 0;
    color: var(--danger-color);
    font-size: 13px;
    font-weight: 600;
  }

  .save-location-btn {
    width: 100%;
    padding: 16px;
    background: var(--accent-color);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    margin-top: 12px;
    box-shadow: var(--shadow-button);
    transition: all 0.2s ease;
  }

  .save-location-btn:hover:not(:disabled) {
    background: var(--accent-strong);
    transform: translateY(-2px);
  }

  .save-location-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  @media (max-width: 520px) {
    .location-item {
      grid-template-columns: 40px minmax(0, 1fr);
    }

    .location-actions {
      grid-column: 2;
      justify-content: flex-start;
    }

    .navigation-action-btn {
      min-width: 96px;
    }

    .form-row {
      grid-template-columns: 1fr;
    }
  }
</style>
