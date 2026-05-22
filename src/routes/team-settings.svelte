<script>
  import {
    AlertCircle,
    Camera,
    ChevronDown,
    Mail,
    Save,
    Trash2,
    UserMinus,
    UserPlus,
    Users,
  } from "lucide-svelte";
  import {
    selectedTeam,
    selectedTeamId,
    userStore,
    getUserProfile,
    getProfileImage,
    isProfileImage,
    addMemberByEmail,
    updateMemberPermissions,
    updateTeamProfile,
    removeTeamMember,
    deleteTeam,
    createDefaultMemberPermissions,
    normalizeTeamPermissions,
    hasTeamPermission,
    TEAM_PERMISSION_LABELS,
    TEAM_PERMISSION_ACTION_LABELS,
    WEEKDAY_OPTIONS,
    normalizeNonWorkingDays,
  } from "../data/stores.js";
  import { navigateTo } from "../router.js";
  import { resizer, uploader } from "../data/fileHelper.js";
  import { confirmAlert, showErrorAlert, showSuccessAlert } from "../data/alerts.js";
  import TitleHeader from "../components/TitleHeader.svelte";

  let team = $derived($selectedTeam);
  let isAdmin = $derived(team?.admin === $userStore?.uid);
  let canViewSettings = $derived(hasTeamPermission(team, $userStore?.uid, "settings", "view"));
  let canCreateSettings = $derived(hasTeamPermission(team, $userStore?.uid, "settings", "create"));
  let canEditSettings = $derived(hasTeamPermission(team, $userStore?.uid, "settings", "edit"));
  let canDeleteSettings = $derived(hasTeamPermission(team, $userStore?.uid, "settings", "delete"));
  let teamId = $derived(team?.id || $selectedTeamId);

  const permissionModules = Object.entries(TEAM_PERMISSION_LABELS);
  const permissionActions = Object.entries(TEAM_PERMISSION_ACTION_LABELS);

  let memberList = $state([]);
  let teamName = $state("");
  let overtimeLimitHours = $state(0);
  let nonWorkingDays = $state([]);
  let photoPreview = $state("");
  let pendingPhoto = $state("");
  let newMemberEmail = $state("");
  let newMemberPermissions = $state(createDefaultMemberPermissions());
  let editingPermissions = $state({});
  let isSavingProfile = $state(false);
  let isAddingMember = $state(false);
  let showNewMemberPermissions = $state(false);
  let openPermissionMemberId = $state(null);

  $effect(() => {
    if (team) {
      teamName = team.team || team.name || "";
      overtimeLimitHours = Number(team.overtimeLimitHours) || 0;
      nonWorkingDays = normalizeNonWorkingDays(team.nonWorkingDays);
      photoPreview = team.photoURL || "";
      pendingPhoto = "";
      const nextEditingPermissions = {};
      for (const memberId of team.members || []) {
        nextEditingPermissions[memberId] = normalizeTeamPermissions(team.memberPermissions?.[memberId]);
      }
      editingPermissions = nextEditingPermissions;
    }
  });

  $effect(() => {
    let active = true;
    if (team?.members) {
      Promise.all(team.members.map((id) => getUserProfile(id))).then((users) => {
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

  function getMemberPhoto(member) {
    return getProfileImage(member);
  }

  function getMemberFallbackAvatar(member) {
    if (member?.avatar && !isProfileImage(member.avatar)) return member.avatar;
    return "";
  }

  function togglePermission(memberId, module, action) {
    editingPermissions[memberId][module][action] = !editingPermissions[memberId][module][action];
  }

  function toggleNewMemberPermission(module, action) {
    newMemberPermissions[module][action] = !newMemberPermissions[module][action];
  }

  function toggleNonWorkingDay(day) {
    const normalizedDay = Number(day);
    nonWorkingDays = nonWorkingDays.includes(normalizedDay)
      ? nonWorkingDays.filter((selectedDay) => selectedDay !== normalizedDay)
      : [...nonWorkingDays, normalizedDay];
  }

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (readerEvent) => {
        pendingPhoto = await resizer(readerEvent.target.result, 700);
        photoPreview = pendingPhoto;
      };
      reader.readAsDataURL(file);
    } catch (error) {
      await showErrorAlert("Error al cargar la imagen", "No se pudo cargar la imagen.");
    }
    event.target.value = "";
  }

  async function handleSaveProfile() {
    if (!team?.id || !canEditSettings || !teamName.trim()) return;
    isSavingProfile = true;
    try {
      let photoURL = team.photoURL || "";
      if (pendingPhoto) {
        photoURL = await uploader(pendingPhoto);
      }
      await updateTeamProfile(team.id, {
        name: teamName,
        photoURL,
        overtimeLimitHours,
        nonWorkingDays,
      });
      pendingPhoto = "";
      await showSuccessAlert(
        "Equipo actualizado",
        "Los datos del perfil del equipo se guardaron correctamente.",
      );
    } catch (error) {
      await showErrorAlert(
        "Error al actualizar el equipo",
        error?.message || "No se pudieron guardar los datos del perfil.",
      );
    } finally {
      isSavingProfile = false;
    }
  }

  async function handleAddMember() {
    if (!team?.id || !canCreateSettings || !newMemberEmail.trim()) return;
    isAddingMember = true;
    try {
      await addMemberByEmail(team.id, newMemberEmail.trim(), newMemberPermissions);
      newMemberEmail = "";
      newMemberPermissions = createDefaultMemberPermissions();
      showNewMemberPermissions = false;
      await showSuccessAlert("Miembro agregado", "El miembro se agregó al equipo correctamente.");
    } catch (error) {
      await showErrorAlert(
        "Error al agregar miembro",
        error?.message || "No se pudo agregar el miembro al equipo.",
      );
    } finally {
      isAddingMember = false;
    }
  }

  async function handleSavePermissions(memberId) {
    if (!team?.id || !canEditSettings || memberId === team.admin) return;
    try {
      await updateMemberPermissions(team.id, memberId, editingPermissions[memberId]);
      await showSuccessAlert("Permisos actualizados", "Los permisos del miembro se guardaron correctamente.");
    } catch (error) {
      await showErrorAlert("Error al guardar permisos", "No se pudieron guardar los permisos.");
    }
  }

  async function handleRemoveMember(member) {
    if (!team?.id || !canDeleteSettings || member.id === team.admin) return;
    const confirmed = await confirmAlert({
      title: "Quitar miembro",
      text: `¿Quitar a ${member.name || member.email || "este miembro"} del equipo?`,
      confirmButtonText: "Quitar",
      danger: true,
    });
    if (!confirmed) return;

    try {
      await removeTeamMember(team.id, member.id);
      await showSuccessAlert("Miembro eliminado", "El miembro se quitó del equipo correctamente.");
    } catch (error) {
      await showErrorAlert(
        "Error al quitar miembro",
        error?.message || "No se pudo quitar el miembro del equipo.",
      );
    }
  }

  async function handleDeleteTeam() {
    if (!team?.id || !isAdmin) return;
    const confirmed = await confirmAlert({
      title: "Eliminar equipo",
      text: `¿Eliminar definitivamente el equipo "${team.team || team.name}"?`,
      confirmButtonText: "Eliminar",
      danger: true,
    });
    if (!confirmed) return;

    try {
      await deleteTeam(team.id);
      navigateTo("/teams");
    } catch (error) {
      await showErrorAlert("Error al eliminar el equipo", "No se pudo eliminar el equipo.");
    }
  }

  function toggleMemberPermissions(memberId) {
    openPermissionMemberId = openPermissionMemberId === memberId ? null : memberId;
  }
</script>

<div class="team-settings-page">
  <header>
  <TitleHeader title="Ajustes del equipo" description={team?.name || ""} action={goToTeamHome} />
  </header>

  {#if !team}
    <div class="empty-state">Cargando equipo...</div>
  {:else if !canViewSettings}
    <div class="empty-state">
      <AlertCircle size={44} />
      <p>No tienes permiso para ver los ajustes de este equipo.</p>
    </div>
  {:else}
    <div class="content">
      <section class="section">
        <h2>Perfil</h2>
        <div class="profile-row">
          <div class="team-photo">
            {#if photoPreview}
              <img src={photoPreview} alt={teamName} />
            {:else}
              <Users size={34} />
            {/if}
            {#if canEditSettings}
              <label class="photo-btn" aria-label="Cambiar foto">
                <Camera size={16} />
                <input type="file" accept="image/*" onchange={handlePhotoChange} />
              </label>
            {/if}
          </div>
          <div class="profile-fields">
            <label for="teamName">Nombre del equipo</label>
            <input id="teamName" bind:value={teamName} disabled={!canEditSettings} />
          </div>
        </div>
        <div class="profile-fields settings-field">
          <label for="overtimeLimitHours">Límite de horas extra</label>
          <input
            id="overtimeLimitHours"
            type="number"
            min="0"
            step="0.25"
            bind:value={overtimeLimitHours}
            disabled={!canEditSettings}
            placeholder="0 = sin límite"
          />
          <p class="field-help">
            Usa 0 para no limitar. Las jornadas flexibles se recortan al máximo configurado.
          </p>
        </div>
        <div class="profile-fields settings-field">
          <span class="field-label">Días no laborables</span>
          <div class="weekday-grid">
            {#each WEEKDAY_OPTIONS as day}
              <label class="weekday-toggle" class:active={nonWorkingDays.includes(day.value)}>
                <input
                  type="checkbox"
                  checked={nonWorkingDays.includes(day.value)}
                  onchange={() => toggleNonWorkingDay(day.value)}
                  disabled={!canEditSettings}
                />
                <span>{day.shortLabel}</span>
              </label>
            {/each}
          </div>
          <p class="field-help">
            Los usuarios no podrán registrar jornadas en los días marcados. Si desmarcas un día, vuelve a permitir fichar.
          </p>
        </div>
        {#if canEditSettings}
          <button class="primary-btn" onclick={handleSaveProfile} disabled={isSavingProfile || !teamName.trim()}>
            <Save size={18} />
            <span>{isSavingProfile ? "Guardando..." : "Guardar perfil"}</span>
          </button>
        {/if}
      </section>

      {#if canCreateSettings}
        <section class="section">
          <h2>Agregar miembro</h2>
          <div class="input-with-icon">
            <Mail size={18} />
            <input type="email" bind:value={newMemberEmail} placeholder="usuario@ejemplo.com" />
          </div>
          <div class="accordion">
            <button
              type="button"
              class="accordion-trigger"
              class:open={showNewMemberPermissions}
              aria-expanded={showNewMemberPermissions}
              onclick={() => (showNewMemberPermissions = !showNewMemberPermissions)}
            >
              <span>Permisos iniciales</span>
              <ChevronDown size={18} />
            </button>
            {#if showNewMemberPermissions}
              <div class="permissions-editor accordion-panel">
                {#each permissionModules as [module, moduleLabel]}
                  <div class="permission-row">
                    <span>{moduleLabel}</span>
                    <div class="permission-actions">
                      {#each permissionActions as [action, actionLabel]}
                        <label>
                          <input
                            type="checkbox"
                            checked={newMemberPermissions[module][action]}
                            onchange={() => toggleNewMemberPermission(module, action)}
                          />
                          {actionLabel}
                        </label>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <button class="primary-btn" onclick={handleAddMember} disabled={isAddingMember || !newMemberEmail.trim()}>
            <UserPlus size={18} />
            <span>{isAddingMember ? "Agregando..." : "Agregar miembro"}</span>
          </button>
        </section>
      {/if}

      <section class="section">
        <h2>Miembros</h2>
        <div class="members-list">
          {#each memberList as member}
            <article class="member-item">
              <div class="member-header">
                <div class="member-avatar">
                  {#if getMemberPhoto(member)}
                    <img src={getMemberPhoto(member)} alt={member.name || member.email} />
                  {:else if getMemberFallbackAvatar(member)}
                    <span>{getMemberFallbackAvatar(member)}</span>
                  {:else}
                    <Users size={20} />
                  {/if}
                </div>
                <div>
                  <h3>{member.name || member.email || "Usuario"}</h3>
                  <p>{member.email}</p>
                </div>
                {#if member.id === team.admin}
                  <span class="admin-badge">Admin</span>
                {/if}
              </div>

              {#if member.id !== team.admin}
                <div class="accordion member-permissions">
                  <button
                    type="button"
                    class="accordion-trigger"
                    class:open={openPermissionMemberId === member.id}
                    aria-expanded={openPermissionMemberId === member.id}
                    onclick={() => toggleMemberPermissions(member.id)}
                  >
                    <span>Permisos</span>
                    <ChevronDown size={18} />
                  </button>
                  {#if openPermissionMemberId === member.id}
                    <div class="permissions-editor compact accordion-panel">
                      {#each permissionModules as [module, moduleLabel]}
                        <div class="permission-row">
                          <span>{moduleLabel}</span>
                          <div class="permission-actions">
                            {#each permissionActions as [action, actionLabel]}
                              <label>
                                <input
                                  type="checkbox"
                                  checked={editingPermissions[member.id]?.[module]?.[action]}
                                  disabled={!canEditSettings}
                                  onchange={() => togglePermission(member.id, module, action)}
                                />
                                {actionLabel}
                              </label>
                            {/each}
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>

                <div class="member-actions">
                  {#if canEditSettings}
                    <button class="secondary-btn" onclick={() => handleSavePermissions(member.id)}>
                      <Save size={16} />
                      <span>Guardar</span>
                    </button>
                  {/if}
                  {#if canDeleteSettings}
                    <button class="danger-soft-btn" onclick={() => handleRemoveMember(member)}>
                      <UserMinus size={16} />
                      <span>Quitar</span>
                    </button>
                  {/if}
                </div>
              {/if}
            </article>
          {/each}
        </div>
      </section>

      {#if isAdmin}
        <section class="section danger-section">
          <h2>Zona peligrosa</h2>
          <p>Eliminar el equipo quita el acceso a todos los miembros.</p>
          <button class="delete-team-btn" onclick={handleDeleteTeam}>
            <Trash2 size={18} />
            <span>Eliminar equipo</span>
          </button>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .team-settings-page {
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
    padding: 24px 20px var(--bottom-nav-clearance);
    padding-top: var(--page-top-safe);
    background: var(--bg-page);
    color: var(--text-primary);
  }

  header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 22px;
  }



  h2, h3, p {
    margin: 0;
  }

  h2 {
    font-size: 17px;
    font-weight: 800;
    margin-bottom: 14px;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section,
  .member-item {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 16px;
    box-shadow: var(--shadow-card);
  }

  .profile-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 14px;
  }

  .team-photo {
    position: relative;
    width: 76px;
    height: 76px;
    border-radius: 18px;
    background: var(--bg-accent-subtle);
    color: var(--accent-ink);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }

  .team-photo img,
  .member-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .photo-btn {
    position: absolute;
    right: 6px;
    bottom: 6px;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--accent-strong);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .photo-btn input {
    display: none;
  }

  .profile-fields,
  .input-with-icon {
    flex: 1;
  }

  .settings-field {
    margin-bottom: 14px;
  }

  .field-help {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.4;
    margin-top: 6px;
  }

  .field-label {
    display: block;
    margin-bottom: 8px;
  }

  .weekday-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
    gap: 8px;
  }

  .weekday-toggle {
    min-height: 42px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
    cursor: pointer;
  }

  .weekday-toggle.active {
    border-color: var(--danger-color);
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
  }

  .weekday-toggle input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  label,
  .field-label,
  .permission-row span {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
  }

  input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    padding: 12px 14px;
    margin-top: 7px;
    font-size: 15px;
  }

  .input-with-icon {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 0 12px;
    margin-bottom: 14px;
  }

  .input-with-icon input {
    border: none;
    background: transparent;
    margin: 0;
    padding-left: 0;
  }

  .permissions-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .permissions-editor.compact {
    margin-top: 8px;
  }

  .accordion {
    margin-bottom: 14px;
  }

  .accordion.member-permissions {
    margin: 14px 0 0;
  }

  .accordion-trigger {
    width: 100%;
    min-height: 42px;
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 12px;
    font-size: 14px;
    font-weight: 800;
  }

  .accordion-trigger :global(svg) {
    transition: transform 0.18s ease;
  }

  .accordion-trigger.open :global(svg) {
    transform: rotate(180deg);
  }

  .accordion-panel {
    margin-top: 8px;
  }

  .permission-row {
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 12px;
  }

  .permission-row > span {
    display: block;
    margin-bottom: 9px;
  }

  .permission-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .permission-actions label {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 32px;
    padding: 7px 9px;
    border-radius: 8px;
    background: var(--bg-card);
    color: var(--text-secondary);
  }

  .permission-actions input {
    width: auto;
    margin: 0;
    accent-color: var(--accent-color);
  }

  .members-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

.member-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
  }

  .member-header {
        display: flex;
    align-items: center;
    gap: 10px;
    justify-content: space-between;
  }

  .member-avatar {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: var(--bg-accent-subtle);
    color: var(--accent-ink);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }

  .member-header > div:nth-child(2) {
    flex: 1;
    min-width: 0;
  }

  .member-header h3 {
    font-size: 15px;
    font-weight: 800;
  }

  .member-header p,
  .danger-section p {
    color: var(--text-secondary);
    font-size: 13px;
    margin-top: 3px;
  }

  .admin-badge {
    padding: 5px 9px;
    border-radius: 999px;
    background: var(--bg-accent-subtle);
    color: var(--accent-ink);
    font-size: 12px;
    font-weight: 800;
  }

  .member-actions {
    margin-top: 12px;
    flex-wrap: wrap;
  }

  button {
    border: none;
    cursor: pointer;
  }

  .primary-btn,
  .secondary-btn,
  .danger-soft-btn,
  .delete-team-btn {
    min-height: 44px;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 14px;
    font-weight: 800;
  }

  .primary-btn {
    width: 100%;
    background: var(--accent-color);
    color: #fff;
  }

  .secondary-btn {
    background: var(--bg-input);
    color: var(--text-primary);
  }

  .danger-soft-btn {
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
  }

  .delete-team-btn {
    width: 100%;
    margin-top: 14px;
    background: var(--danger-color);
    color: #fff;
  }

  button:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .empty-state {
    min-height: 55%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 12px;
    color: var(--text-secondary);
  }
</style>
