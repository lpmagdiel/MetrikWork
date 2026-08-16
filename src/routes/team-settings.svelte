<script>
  import {
    AlertCircle,
    Camera,
    CheckCircle2,
    ChevronDown,
    CreditCard,
    Eye,
    EyeOff,
    Mail,
    Palette,
    Pencil,
    Plus,
    Power,
    Save,
    Trash2,
    UserMinus,
    UserPlus,
    Users,
    XCircle,
} from "lucide-svelte";
  import {
    selectedTeam,
    selectedTeamId,
    userStore,
    getUserProfile,
    getProfileImage,
    isProfileImage,
    addMemberByEmail,
    createNotification,
    updateMemberPermissions,
    updateTeamProfile,
    updateTeamCustomRoles,
    removeTeamMember,
    leaveTeam,
    deleteTeam,
    setTeamActive,
    setTeamHidden,
    createCustomRoleId,
    createDefaultMemberPermissions,
    createPermissionsFromTeamRole,
    getTeamRoleTemplates,
    normalizeCustomTeamRoles,
    normalizeTeamPermissions,
    hasTeamPermission,
    TEAM_PERMISSION_LABELS,
    TEAM_PERMISSION_ACTION_LABELS,
    WEEKDAY_OPTIONS,
    normalizeNonWorkingDays,
    getTeamGhosts,
    addTeamGhost,
    updateTeamGhost,
    removeTeamGhost,
    hasGhostCreatePermission,
  } from "../data/stores.js";
  import { navigateTo } from "../router.js";
  import { resizeImageFile, uploader } from "../data/fileHelper.js";
  import { confirmAlert, promptAlert, showErrorAlert, showSuccessAlert } from "../data/alerts.js";
  import TitleHeader from "../components/TitleHeader.svelte";
  import { optimizeCloudinary } from "../helpers/image.js";

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
  let customRoles = $state([]);
  let teamName = $state("");
  let teamCurrency = $state("MXN");
  let companyProfile = $state(createDefaultCompanyProfile());
  let overtimeLimitHours = $state(0);
  let nonWorkingDays = $state([]);
  let themePrimaryColor = $state("#a7f3d0");
  let photoPreview = $state("");
  let pendingPhoto = $state("");
  let newMemberEmail = $state("");
  let newMemberPermissions = $state(createDefaultMemberPermissions());
  let selectedNewMemberRole = $state("");
  let editingPermissions = $state({});
  let selectedMemberRoles = $state({});
  let showCustomRoleForm = $state(false);
  let editingCustomRoleId = $state(null);
  let customRoleName = $state("");
  let customRoleDescription = $state("");
  let customRolePermissions = $state(createDefaultMemberPermissions());
  let teamActive = $state(true);
  let teamHidden = $state(false);
  let isSavingProfile = $state(false);
  let isSavingCustomRole = $state(false);
  let isAddingMember = $state(false);
  let isTogglingActive = $state(false);
  let isTogglingHidden = $state(false);
  let showNewMemberPermissions = $state(false);
  let openPermissionMemberId = $state(null);
  let ghostsList = $derived(getTeamGhosts(team));
  let canManageGhosts = $derived(isAdmin || hasGhostCreatePermission(team, $userStore?.uid));
  let isAddingGhost = $state(false);
  let newGhostName = $state("");
  let newGhostMasters = $state([]);
  let editingGhostId = $state(null);
  let editingGhostName = $state("");
  let editingGhostMasters = $state([]);

  function masterCandidates() {
    const candidates = [];
    const adminUid = team?.admin;
    if (adminUid) {
      candidates.push({
        uid: adminUid,
        name: team?.membersData?.find((m) => m.id === adminUid)?.name || "Administrador",
        isAdmin: true
      });
    }
    (team?.membersData || []).forEach((member) => {
      if (member?.id && member.id !== adminUid) {
        candidates.push({
          uid: member.id,
          name: member.name || member.email || "Miembro",
          isAdmin: false
        });
      }
    });
    return candidates;
  }

  function toggleMaster(list, uid) {
    if (list.includes(uid)) return list.filter((id) => id !== uid);
    return [...list, uid];
  }

  function formatGhostSummary(ghost) {
    const worksdays = (ghost.worksdays || []).length;
    const overtime = (ghost.overtime || []).length;
    const masters = (ghost.masters || []).length;
    const parts = [];
    if (worksdays) parts.push(`${worksdays} jornada${worksdays === 1 ? "" : "s"}`);
    if (overtime) parts.push(`${overtime} overtime`);
    if (masters) parts.push(`${masters} master${masters === 1 ? "" : "s"}`);
    return parts.length ? parts.join(" • ") : "Sin actividad";
  }
  let roleTemplates = $derived(getTeamRoleTemplates({ customRoles }));

  const currencyOptions = [
    { code: "MXN", label: "Peso mexicano" },
    { code: "USD", label: "Dólar estadounidense" },
    { code: "EUR", label: "Euro" },
    { code: "COP", label: "Peso colombiano" },
    { code: "ARS", label: "Peso argentino" },
    { code: "CLP", label: "Peso chileno" },
    { code: "PEN", label: "Sol peruano" },
    { code: "DOP", label: "Peso dominicano" },
    { code: "NIO", label: "Córdoba nicaragüense" },
    { code: "BRL", label: "Real brasileño" },
    { code: "GBP", label: "Libra esterlina" },
  ];

  const themeColorPresets = [
    "#a7f3d0",
    "#60a5fa",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#14b8a6",
  ];

  const CLOUDINARY_PRESET_TEAM =
    import.meta.env.VITE_CLOUDINARY_PRESET_TEAM ||
    import.meta.env.CLOUDINARY_PRESET_TEAM ||
    import.meta.env.VITE_CLOUDINARY_PRESET_AVATAR ||
    import.meta.env.CLOUDINARY_PRESET_AVATAR ||
    "MetricWorkProfile";

  $effect(() => {
    if (team) {
      teamName = team.team || team.name || "";
      teamCurrency = team.projectBudgetCurrency || "MXN";
      companyProfile = normalizeCompanyProfile(team.companyProfile);
      overtimeLimitHours = Number(team.overtimeLimitHours) || 0;
      nonWorkingDays = normalizeNonWorkingDays(team.nonWorkingDays);
      themePrimaryColor = normalizeThemeColor(team.themePrimaryColor) || "#a7f3d0";
      photoPreview = team.photoURL || "";
      pendingPhoto = "";
      customRoles = normalizeCustomTeamRoles(team.customRoles);
      teamActive = team.active !== false;
      teamHidden = team.hidden === true;
      const nextEditingPermissions = {};
      const nextSelectedMemberRoles = {};
      for (const memberId of team.members || []) {
        nextEditingPermissions[memberId] = normalizeTeamPermissions(team.memberPermissions?.[memberId]);
        nextSelectedMemberRoles[memberId] = "";
      }
      editingPermissions = nextEditingPermissions;
      selectedMemberRoles = nextSelectedMemberRoles;
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

  function createDefaultCompanyProfile() {
    return {
      name: "",
      taxId: "",
      email: "",
      phone: "",
      address: "",
      iban: "",
      bankName: "",
      bizum: "",
    };
  }

  function normalizeCompanyProfile(profile = {}) {
    const defaults = createDefaultCompanyProfile();
    return Object.fromEntries(
      Object.keys(defaults).map((key) => [key, String(profile?.[key] || "").trim()]),
    );
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
    selectedMemberRoles = { ...selectedMemberRoles, [memberId]: "" };
  }

  function toggleNewMemberPermission(module, action) {
    newMemberPermissions[module][action] = !newMemberPermissions[module][action];
    selectedNewMemberRole = "";
  }

  function applyNewMemberRoleTemplate(roleId) {
    newMemberPermissions = createPermissionsFromTeamRole(roleId, { customRoles });
    selectedNewMemberRole = roleId;
  }

  function applyMemberRoleTemplate(memberId, roleId) {
    editingPermissions = {
      ...editingPermissions,
      [memberId]: createPermissionsFromTeamRole(roleId, { customRoles }),
    };
    selectedMemberRoles = { ...selectedMemberRoles, [memberId]: roleId };
  }

  function resetCustomRoleForm() {
    editingCustomRoleId = null;
    customRoleName = "";
    customRoleDescription = "";
    customRolePermissions = createDefaultMemberPermissions();
  }

  function openCreateCustomRole() {
    resetCustomRoleForm();
    showCustomRoleForm = true;
  }

  function openEditCustomRole(role) {
    editingCustomRoleId = role.id;
    customRoleName = role.label || "";
    customRoleDescription = role.description || "";
    customRolePermissions = normalizeTeamPermissions(role.permissions);
    showCustomRoleForm = true;
  }

  function closeCustomRoleForm() {
    showCustomRoleForm = false;
    resetCustomRoleForm();
  }

  function toggleCustomRolePermission(module, action) {
    const modulePermissions = customRolePermissions[module] || {};
    customRolePermissions = {
      ...customRolePermissions,
      [module]: {
        ...modulePermissions,
        [action]: !modulePermissions[action],
      },
    };
  }

  function getRolePermissionSummary(permissions) {
    const normalized = normalizeTeamPermissions(permissions);
    const enabledModules = permissionModules
      .filter(([module]) => permissionActions.some(([action]) => normalized[module]?.[action]))
      .map(([, moduleLabel]) => moduleLabel);
    return enabledModules.length > 0 ? enabledModules : ["Sin permisos"];
  }

  function toDisplayDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000);

    if (typeof value === "string") {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const [, year, month, day] = match.map(Number);
        return new Date(year, month - 1, day);
      }
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  async function handleSaveCustomRole() {
    if (!team?.id || !canEditSettings || !customRoleName.trim()) return;

    isSavingCustomRole = true;
    try {
      const now = new Date().toISOString();
      const existingRole = customRoles.find((role) => role.id === editingCustomRoleId);
      const roleId = editingCustomRoleId || createCustomRoleId(customRoleName, customRoles);
      const nextRole = {
        id: roleId,
        label: customRoleName.trim(),
        description: customRoleDescription.trim(),
        permissions: normalizeTeamPermissions(customRolePermissions),
        createdAt: existingRole?.createdAt || now,
        updatedAt: now,
      };
      const nextRoles = editingCustomRoleId
        ? customRoles.map((role) => (role.id === editingCustomRoleId ? nextRole : role))
        : [...customRoles, nextRole];

      await updateTeamCustomRoles(team.id, nextRoles);
      customRoles = normalizeCustomTeamRoles(nextRoles);
      closeCustomRoleForm();
      await showSuccessAlert(
        "Plantilla guardada",
        "La plantilla de permisos quedó disponible para invitaciones y miembros.",
      );
    } catch (error) {
      await showErrorAlert(
        "Error al guardar plantilla",
        error?.message || "No se pudo guardar la plantilla de permisos.",
      );
    } finally {
      isSavingCustomRole = false;
    }
  }

  async function handleDeleteCustomRole(role) {
    if (!team?.id || !canEditSettings || !role?.id) return;
    const confirmed = await confirmAlert({
      title: "Eliminar plantilla",
      text: `¿Eliminar la plantilla "${role.label}"?`,
      confirmButtonText: "Eliminar",
      danger: true,
    });
    if (!confirmed) return;

    try {
      const nextRoles = customRoles.filter((item) => item.id !== role.id);
      await updateTeamCustomRoles(team.id, nextRoles);
      customRoles = normalizeCustomTeamRoles(nextRoles);
      if (editingCustomRoleId === role.id) closeCustomRoleForm();
      await showSuccessAlert("Plantilla eliminada", "La plantilla de permisos se eliminó correctamente.");
    } catch (error) {
      await showErrorAlert(
        "Error al eliminar plantilla",
        error?.message || "No se pudo eliminar la plantilla.",
      );
    }
  }

  async function handleCreateTemplateFromMember(member) {
    if (!team?.id || !canEditSettings || !member?.id || isSavingCustomRole) return;

    const memberName = member.name || member.email || "miembro";
    const templateName = await promptAlert({
      title: "Crear plantilla de permisos",
      text: `Se copiarán los permisos configurados para ${memberName}.`,
      inputLabel: "Nombre de la plantilla",
      inputPlaceholder: "Supervisor de obra",
      inputValue: `Permisos de ${memberName}`,
      confirmButtonText: "Crear plantilla",
    });
    if (!templateName) return;

    isSavingCustomRole = true;
    try {
      const now = new Date().toISOString();
      const nextRole = {
        id: createCustomRoleId(templateName, customRoles),
        label: templateName,
        description: `Creada a partir de los permisos de ${memberName}.`,
        permissions: normalizeTeamPermissions(editingPermissions[member.id]),
        createdAt: now,
        updatedAt: now,
      };
      const nextRoles = [...customRoles, nextRole];

      await updateTeamCustomRoles(team.id, nextRoles);
      customRoles = normalizeCustomTeamRoles(nextRoles);
      await showSuccessAlert(
        "Plantilla creada",
        "Ya puedes aplicarla al invitar o editar otros miembros.",
      );
    } catch (error) {
      await showErrorAlert(
        "Error al crear plantilla",
        error?.message || "No se pudo crear la plantilla de permisos.",
      );
    } finally {
      isSavingCustomRole = false;
    }
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
      pendingPhoto = await resizeImageFile(file, 700, {
        type: "image/jpeg",
        quality: 0.82,
      });
      photoPreview = pendingPhoto;
    } catch (error) {
      await showErrorAlert(
        "Error al cargar la imagen",
        error?.message || "No se pudo cargar la imagen.",
      );
    } finally {
      event.target.value = "";
    }
  }

  async function handleSaveProfile() {
    if (!team?.id || !canEditSettings || !teamName.trim()) return;
    isSavingProfile = true;
    try {
      const previousOvertimeLimitHours = normalizeOvertimeLimitHours(team.overtimeLimitHours);
      const previousNonWorkingDays = normalizeComparableDays(team.nonWorkingDays);
      const nextOvertimeLimitHours = normalizeOvertimeLimitHours(overtimeLimitHours);
      const nextNonWorkingDays = normalizeComparableDays(nonWorkingDays);
      let photoURL = team.photoURL || "";
      if (pendingPhoto) {
        photoURL = await uploader(pendingPhoto, CLOUDINARY_PRESET_TEAM);
      }
      await updateTeamProfile(team.id, {
        name: teamName,
        photoURL,
        projectBudgetCurrency: teamCurrency,
        companyProfile: normalizeCompanyProfile(companyProfile),
        overtimeLimitHours: nextOvertimeLimitHours,
        nonWorkingDays: nextNonWorkingDays,
        themePrimaryColor,
      });
      await notifyWorkSettingsChanges({
        overtimeChanged: previousOvertimeLimitHours !== nextOvertimeLimitHours,
        nonWorkingDaysChanged: !areNumberListsEqual(previousNonWorkingDays, nextNonWorkingDays),
        overtimeLimitHours: nextOvertimeLimitHours,
        nonWorkingDays: nextNonWorkingDays,
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

  async function notifyWorkSettingsChanges({
    overtimeChanged,
    nonWorkingDaysChanged,
    overtimeLimitHours,
    nonWorkingDays,
  }) {
    if (!team?.id || (!overtimeChanged && !nonWorkingDaysChanged)) return;

    const recipients = [...new Set(team.members || [])].filter(
      (memberId) => memberId && memberId !== $userStore?.uid,
    );
    if (!recipients.length) return;

    const teamLabel = teamName.trim() || team.team || team.name || "tu equipo";
    const changes = [];
    if (overtimeChanged) {
      changes.push(
        overtimeLimitHours > 0
          ? `Horas extra disponibles: hasta ${overtimeLimitHours}h.`
          : "Las horas extra quedaron desactivadas.",
      );
    }
    if (nonWorkingDaysChanged) {
      changes.push(`Días laborables: ${formatWorkingDaysSummary(nonWorkingDays)}.`);
    }

    const message = `Se actualizaron los ajustes de jornada de ${teamLabel}. ${changes.join(" ")}`;
    const results = await Promise.allSettled(
      recipients.map((memberId) =>
        createNotification(
          memberId,
          "Ajustes de jornada actualizados",
          message,
          {
            url: `/teams/${team.id}`,
            type: "team_work_settings",
            teamId: team.id,
          },
        ),
      ),
    );

    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length) {
      console.warn("No se pudieron enviar algunas notificaciones de ajustes de jornada:", failed);
    }
  }

  function normalizeOvertimeLimitHours(value) {
    return Math.max(0, Number(value) || 0);
  }

  function normalizeComparableDays(days) {
    return normalizeNonWorkingDays(days).sort((a, b) => a - b);
  }

  function areNumberListsEqual(left = [], right = []) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
  }

  function formatWorkingDaysSummary(nonWorkingDays = []) {
    const nonWorkingDaySet = new Set(nonWorkingDays);
    const workingDays = WEEKDAY_OPTIONS.filter((day) => !nonWorkingDaySet.has(day.value));

    if (workingDays.length === WEEKDAY_OPTIONS.length) return "todos los días";
    if (workingDays.length === 0) return "ninguno configurado";

    return workingDays.map((day) => day.label).join(", ");
  }

  async function handleAddMember() {
    if (!team?.id || !canCreateSettings || !newMemberEmail.trim()) return;
    isAddingMember = true;
    try {
      await addMemberByEmail(team.id, newMemberEmail.trim(), newMemberPermissions);
      newMemberEmail = "";
      newMemberPermissions = createDefaultMemberPermissions();
      selectedNewMemberRole = "";
      showNewMemberPermissions = false;
      await showSuccessAlert("Invitación enviada", "El usuario podrá aceptar o rechazar la invitación.");
    } catch (error) {
      await showErrorAlert(
        "Error al invitar miembro",
        error?.message || "No se pudo enviar la invitación.",
      );
    } finally {
      isAddingMember = false;
    }
  }

  async function handleToggleActive() {
    if (!team?.id || !isAdmin || isTogglingActive) return;
    const nextState = !teamActive;
    const confirmed = await confirmAlert({
      title: nextState ? "Activar equipo" : "Desactivar equipo",
      text: nextState
        ? "El equipo volverá a aparecer en tu lista de equipos activos."
        : "El equipo se ocultará de tu lista de equipos activos. Los datos y miembros se conservan.",
      confirmButtonText: nextState ? "Activar" : "Desactivar",
    });
    if (!confirmed) return;

    isTogglingActive = true;
    try {
      await setTeamActive(team.id, nextState);
      teamActive = nextState;
      await showSuccessAlert(
        nextState ? "Equipo activado" : "Equipo desactivado",
        nextState
          ? "El equipo ya es visible en la lista principal."
          : "Se ocultó de la lista. Puedes mostrarlo desde la vista de equipos.",
      );
    } catch (error) {
      await showErrorAlert(
        "Error al cambiar el estado",
        error?.message || "No se pudo cambiar el estado del equipo.",
      );
    } finally {
      isTogglingActive = false;
    }
  }

  async function handleToggleHidden() {
    if (!team?.id || !isAdmin || isTogglingHidden) return;
    const willHide = !teamHidden;
    const confirmed = await confirmAlert({
      title: willHide ? "Ocultar este equipo" : "Mostrar este equipo",
      text: willHide
        ? "El equipo no aparecerá en tu lista principal hasta que lo vuelvas a mostrar. Los datos y miembros se conservan intactos."
        : "El equipo volverá a aparecer en tu lista principal.",
      confirmButtonText: willHide ? "Ocultar" : "Mostrar",
    });
    if (!confirmed) return;

    isTogglingHidden = true;
    try {
      await setTeamHidden(team.id, willHide);
      teamHidden = willHide;
      await showSuccessAlert(
        willHide ? "Equipo oculto" : "Equipo visible",
        willHide
          ? "El equipo ya no aparece en tu lista. Puedes mostrarlo desde la vista de equipos con el icono del ojo."
          : "El equipo vuelve a aparecer en tu lista principal.",
      );
    } catch (error) {
      await showErrorAlert(
        "Error al cambiar la visibilidad",
        error?.message || "No se pudo cambiar la visibilidad del equipo.",
      );
    } finally {
      isTogglingHidden = false;
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

  async function handleAddGhost() {
    if (!canManageGhosts) return;
    const name = String(newGhostName || "").trim();
    if (!name) {
      await showErrorAlert("Fantasma sin nombre", "Escribe un nombre para el fantasma.");
      return;
    }
    if (newGhostMasters.length === 0) {
      await showErrorAlert("Sin masters", "Selecciona al menos un master (admin o miembro) responsable del fantasma.");
      return;
    }
    isAddingGhost = true;
    try {
      await addTeamGhost(team.id, { name, masters: newGhostMasters });
      newGhostName = "";
      newGhostMasters = [];
      await showSuccessAlert("Fantasma añadido", `${name} ya puede recibir jornadas en el equipo.`);
    } catch (error) {
      await showErrorAlert("Error al crear fantasma", error?.message || "No se pudo crear el fantasma.");
    } finally {
      isAddingGhost = false;
    }
  }

  function startEditingGhost(ghost) {
    editingGhostId = ghost.id;
    editingGhostName = ghost.name || "";
    editingGhostMasters = Array.isArray(ghost.masters) ? [...ghost.masters] : [];
  }

  function cancelEditingGhost() {
    editingGhostId = null;
    editingGhostName = "";
    editingGhostMasters = [];
  }

  async function handleSaveGhostName(ghost) {
    if (!canManageGhosts) return;
    const name = String(editingGhostName || "").trim();
    const updatedFields = {};
    if (name && name !== ghost.name) updatedFields.name = name;
    if (editingGhostMasters.length === 0) {
      await showErrorAlert("Sin masters", "Asigna al menos un master al fantasma.");
      return;
    }
    const sameMasters = JSON.stringify([...(ghost.masters || [])].sort()) === JSON.stringify([...editingGhostMasters].sort());
    if (!sameMasters) updatedFields.masters = editingGhostMasters;

    if (Object.keys(updatedFields).length === 0) {
      cancelEditingGhost();
      return;
    }
    try {
      await updateTeamGhost(team.id, ghost.id, updatedFields);
      cancelEditingGhost();
      await showSuccessAlert("Fantasma actualizado", "Los datos del fantasma se guardaron.");
    } catch (error) {
      await showErrorAlert("Error al actualizar fantasma", error?.message || "No se pudo actualizar el fantasma.");
    }
  }

  async function handleRemoveGhost(ghost) {
    if (!canManageGhosts) return;
    const confirmed = await confirmAlert({
      title: "Eliminar fantasma",
      text: `¿Eliminar a ${ghost.name || "este fantasma"}? Las jornadas registradas se mantienen, pero ya no podrás asignarle nuevas jornadas.`,
      confirmButtonText: "Eliminar",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await removeTeamGhost(team.id, ghost.id);
      await showSuccessAlert("Fantasma eliminado", "El fantasma se quitó del equipo.");
    } catch (error) {
      await showErrorAlert("Error al eliminar fantasma", error?.message || "No se pudo eliminar el fantasma.");
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

  function getTeamDisplayName() {
    return team?.team || team?.name || "este equipo";
  }

  function normalizeVerificationValue(value) {
    return String(value || "").trim().toLowerCase();
  }

  async function confirmAdminTeamDeletion() {
    const teamName = getTeamDisplayName();
    const confirmed = await confirmAlert({
      title: "Abandonar y eliminar equipo",
      text: `Eres el administrador de "${teamName}". Si continúas, el equipo se eliminará definitivamente y todos los miembros perderán acceso.`,
      confirmButtonText: "Entiendo, continuar",
      danger: true,
    });
    if (!confirmed) return false;

    const typedTeamName = await promptAlert({
      title: "Verificación 1 de 2",
      text: `Escribe el nombre del equipo para confirmar: ${teamName}`,
      inputPlaceholder: teamName,
      confirmButtonText: "Verificar nombre",
      requiredMessage: "Escribe el nombre del equipo para continuar",
    });
    if (typedTeamName === null) return false;
    if (normalizeVerificationValue(typedTeamName) !== normalizeVerificationValue(teamName)) {
      await showErrorAlert("Nombre incorrecto", "El nombre escrito no coincide con el equipo.");
      return false;
    }

    if ($userStore?.email) {
      const typedEmail = await promptAlert({
        title: "Verificación 2 de 2",
        text: `Confirma tu correo de administrador: ${$userStore.email}`,
        input: "email",
        inputPlaceholder: $userStore.email,
        confirmButtonText: "Confirmar correo",
        requiredMessage: "Escribe tu correo para continuar",
      });
      if (typedEmail === null) return false;
      if (normalizeVerificationValue(typedEmail) !== normalizeVerificationValue($userStore.email)) {
        await showErrorAlert("Correo incorrecto", "El correo escrito no coincide con tu cuenta.");
        return false;
      }
    }

    return true;
  }

  async function handleDeleteTeam() {
    if (!team?.id || !isAdmin) return;
    const verified = await confirmAdminTeamDeletion();
    if (!verified) return;

    try {
      await deleteTeam(team.id);
      await showSuccessAlert("Equipo eliminado", "El equipo se eliminó definitivamente.");
      navigateTo("/teams");
    } catch (error) {
      await showErrorAlert("Error al eliminar el equipo", "No se pudo eliminar el equipo.");
    }
  }

  async function handleLeaveTeam() {
    if (!team?.id || !$userStore?.uid) return;

    if (isAdmin) {
      await handleDeleteTeam();
      return;
    }

    const teamName = getTeamDisplayName();
    const confirmed = await confirmAlert({
      title: "Abandonar equipo",
      text: `¿Quieres abandonar "${teamName}"? Perderás acceso a sus tareas, chat, pagos, inventario y ubicaciones.`,
      confirmButtonText: "Abandonar",
      danger: true,
    });
    if (!confirmed) return;

    try {
      await leaveTeam(team.id);
      await showSuccessAlert("Saliste del equipo", `Ya no perteneces a "${teamName}".`);
      navigateTo("/teams");
    } catch (error) {
      await showErrorAlert(
        "Error al abandonar equipo",
        error?.message || "No se pudo abandonar el equipo.",
      );
    }
  }

  function toggleMemberPermissions(memberId) {
    openPermissionMemberId = openPermissionMemberId === memberId ? null : memberId;
  }

  function normalizeThemeColor(value) {
    const color = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
    return "";
  }

  function selectThemeColor(color) {
    if (!canEditSettings) return;
    themePrimaryColor = normalizeThemeColor(color) || "#a7f3d0";
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
      <section class="section profile-section">
        <div class="section-heading-row profile-heading">
          <div>
            <h2>Perfil</h2>
            <p>Ajustes generales, facturación y reglas de jornada.</p>
          </div>
        </div>
        <div class="profile-row">
          <div class="team-photo">
            {#if photoPreview}
              <img src={optimizeCloudinary(photoPreview, 152, { height: 152, crop: "fill" })} alt={teamName} width="76" height="76" loading="eager" decoding="async" />
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

        <div class="profile-fields settings-field compact-field">
          <label for="teamCurrency">Moneda del equipo</label>
          <select
            id="teamCurrency"
            bind:value={teamCurrency}
            disabled={!canEditSettings}
          >
            {#each currencyOptions as currency}
              <option value={currency.code}>{currency.code} - {currency.label}</option>
            {/each}
          </select>
          <p class="field-help">
            Se usará para pagos, presupuestos, ubicaciones, inventario y estadísticas del equipo.
          </p>
        </div>

        {#if isAdmin}
          <div class="profile-fields settings-field compact-field">
            <label for="teamActive">Estado del equipo</label>

            <article class="flag-card" class:flag-card-active={teamActive} class:flag-card-inactive={!teamActive}>
              <div class="flag-icon">
                {#if teamActive}
                  <CheckCircle2 size={20} />
                {:else}
                  <Power size={20} />
                {/if}
              </div>
              <div class="flag-body">
                <strong>{teamActive ? "Equipo activo" : "Equipo inactivo"}</strong>
                <small>
                  {teamActive
                    ? "La obra está en marcha. El equipo aparece en la lista principal."
                    : "La obra está cerrada. El equipo se ocultará de tu lista por defecto."}
                </small>
              </div>
              <button
                type="button"
                class="ios-switch"
                class:on={teamActive}
                onclick={handleToggleActive}
                disabled={isTogglingActive}
                aria-pressed={teamActive}
                aria-label={teamActive ? "Desactivar equipo" : "Activar equipo"}
              >
                <span class="ios-switch-handle"></span>
              </button>
            </article>

            <p class="field-help">
              Los equipos inactivos se ocultan de tu lista por defecto. Puedes verlos pulsando el icono del ojo en la página de equipos.
            </p>
          </div>

          <div class="profile-fields settings-field compact-field">
            <label for="teamHidden">Visibilidad en tu lista</label>

            <article class="flag-card" class:flag-card-visible={!teamHidden} class:flag-card-hidden={teamHidden}>
              <div class="flag-icon">
                {#if teamHidden}
                  <EyeOff size={20} />
                {:else}
                  <Eye size={20} />
                {/if}
              </div>
              <div class="flag-body">
                <strong>{teamHidden ? "Oculto de tu lista" : "Visible en tu lista"}</strong>
                <small>
                  {teamHidden
                    ? "Solo aparecerá cuando actives el icono del ojo en la página de equipos."
                    : "Este equipo aparece en tu lista principal junto al resto."}
                </small>
              </div>
              <button
                type="button"
                class="ios-switch"
                class:on={!teamHidden}
                onclick={handleToggleHidden}
                disabled={isTogglingHidden}
                aria-pressed={!teamHidden}
                aria-label={teamHidden ? "Mostrar en la lista" : "Ocultar de la lista"}
              >
                <span class="ios-switch-handle"></span>
              </button>
            </article>

            <p class="field-help">
              Puedes ocultar este equipo concreto de tu lista principal sin cambiar su estado. Útil para obras ya cerradas que solo quieres consultar de vez en cuando.
            </p>
          </div>
        {/if}

        <details class="settings-panel">
          <summary class="settings-summary">
            <span>
              <CreditCard size={17} />
              Datos de empresa
            </span>
            <small>Facturas, cobros y comprobantes</small>
            <ChevronDown size={18} />
          </summary>
          <div class="settings-panel-body">
            <div class="company-grid">
              <div class="profile-fields settings-field">
                <label for="companyName">Nombre fiscal</label>
                <input
                  id="companyName"
                  bind:value={companyProfile.name}
                  disabled={!canEditSettings}
                  placeholder={teamName || "Nombre de la empresa"}
                />
              </div>
              <div class="profile-fields settings-field">
                <label for="companyTaxId">NIF/CIF/RFC</label>
                <input
                  id="companyTaxId"
                  bind:value={companyProfile.taxId}
                  disabled={!canEditSettings}
                  placeholder="Documento fiscal"
                />
              </div>
              <div class="profile-fields settings-field">
                <label for="companyEmail">Email de facturación</label>
                <input
                  id="companyEmail"
                  type="email"
                  bind:value={companyProfile.email}
                  disabled={!canEditSettings}
                  placeholder="facturas@empresa.com"
                />
              </div>
              <div class="profile-fields settings-field">
                <label for="companyPhone">Teléfono</label>
                <input
                  id="companyPhone"
                  type="tel"
                  bind:value={companyProfile.phone}
                  disabled={!canEditSettings}
                  placeholder="+34..."
                />
              </div>
              <div class="profile-fields settings-field">
                <label for="companyIban">IBAN / cuenta bancaria</label>
                <input
                  id="companyIban"
                  bind:value={companyProfile.iban}
                  disabled={!canEditSettings}
                  placeholder="ES00 0000 0000 0000 0000"
                />
              </div>
              <div class="profile-fields settings-field">
                <label for="companyBankName">Banco</label>
                <input
                  id="companyBankName"
                  bind:value={companyProfile.bankName}
                  disabled={!canEditSettings}
                  placeholder="Nombre del banco"
                />
              </div>
              <div class="profile-fields settings-field">
                <label for="companyBizum">Bizum</label>
                <input
                  id="companyBizum"
                  bind:value={companyProfile.bizum}
                  disabled={!canEditSettings}
                  placeholder="Teléfono Bizum"
                />
              </div>
            </div>
            <div class="profile-fields settings-field">
              <label for="companyAddress">Dirección fiscal</label>
              <textarea
                id="companyAddress"
                rows="3"
                bind:value={companyProfile.address}
                disabled={!canEditSettings}
                placeholder="Dirección fiscal de la empresa"
              ></textarea>
            </div>
          </div>
        </details>

        <details class="settings-panel" open>
          <summary class="settings-summary">
            <span>
              <Palette size={17} />
              Jornada y apariencia
            </span>
            <small>Horas extra, días no laborables y color</small>
            <ChevronDown size={18} />
          </summary>
          <div class="settings-panel-body">
            <div class="operation-grid">
              <div class="profile-fields settings-field">
                <label for="themePrimaryColor">Color primario</label>
                <div class="theme-color-control">
                  <div class="input-with-icon color-input">
                    <Palette size={18} />
                    <input
                      id="themePrimaryColor"
                      type="color"
                      bind:value={themePrimaryColor}
                      disabled={!canEditSettings}
                      aria-label="Color primario del equipo"
                    />
                    <input
                      type="text"
                      bind:value={themePrimaryColor}
                      disabled={!canEditSettings}
                      aria-label="Código hexadecimal del color primario"
                    />
                  </div>
                  <div class="theme-presets" aria-label="Colores sugeridos">
                    {#each themeColorPresets as color}
                      <button
                        type="button"
                        class:active={themePrimaryColor.toLowerCase() === color}
                        style={`--preset-color: ${color};`}
                        onclick={() => selectThemeColor(color)}
                        disabled={!canEditSettings}
                        aria-label={`Usar color ${color}`}
                      ></button>
                    {/each}
                  </div>
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
                  placeholder="0 = desactivadas"
                />
                <p class="field-help">Usa 0 para desactivar las horas extra.</p>
              </div>
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
            </div>
          </div>
        </details>

        {#if canEditSettings}
          <button class="primary-btn" onclick={handleSaveProfile} disabled={isSavingProfile || !teamName.trim()}>
            <Save size={18} />
            <span>{isSavingProfile ? "Guardando..." : "Guardar perfil"}</span>
          </button>
        {/if}
      </section>

      <details class="section collapsible-section">
        <summary class="section-summary">
          <span>
            <Users size={17} />
            Plantillas de permisos
          </span>
          <small>{customRoles.length} plantillas</small>
          <ChevronDown size={18} />
        </summary>
        <div class="section-body">
          {#if canEditSettings}
            <button
              type="button"
              class="secondary-btn compact-btn section-action"
              onclick={openCreateCustomRole}
              disabled={isSavingCustomRole}
            >
              <Plus size={16} />
              <span>Nueva plantilla</span>
            </button>
          {/if}

          <p class="field-help">
            Guarda combinaciones de permisos para reutilizarlas al invitar o editar miembros.
          </p>

          {#if customRoles.length > 0}
            <div class="custom-roles-list">
              {#each customRoles as role (role.id)}
                <article class="custom-role-card">
                  <div class="custom-role-main">
                    <div>
                      <h3>{role.label}</h3>
                      {#if role.description}
                        <p>{role.description}</p>
                      {/if}
                    </div>
                    {#if canEditSettings}
                      <div class="custom-role-actions">
                        <button type="button" class="icon-btn" onclick={() => openEditCustomRole(role)} aria-label="Editar plantilla">
                          <Pencil size={16} />
                        </button>
                        <button type="button" class="icon-btn danger" onclick={() => handleDeleteCustomRole(role)} aria-label="Eliminar plantilla">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    {/if}
                  </div>
                  <div class="role-summary">
                    {#each getRolePermissionSummary(role.permissions) as summary}
                      <span>{summary}</span>
                    {/each}
                  </div>
                </article>
              {/each}
            </div>
          {:else}
            <div class="compact-empty">Sin plantillas personalizadas</div>
          {/if}

          {#if showCustomRoleForm && canEditSettings}
            <div class="custom-role-form">
              <div class="profile-fields settings-field">
                <label for="customRoleName">Nombre de la plantilla</label>
                <input id="customRoleName" bind:value={customRoleName} placeholder="Supervisor de obra" />
              </div>
              <div class="profile-fields settings-field">
                <label for="customRoleDescription">Descripción</label>
                <input id="customRoleDescription" bind:value={customRoleDescription} placeholder="Cuándo utilizar esta plantilla" />
              </div>

              <div class="permissions-editor">
                {#each permissionModules as [module, moduleLabel]}
                  <div class="permission-row">
                    <span>{moduleLabel}</span>
                    <div class="permission-actions">
                      {#each permissionActions as [action, actionLabel]}
                        <label>
                          <input
                            type="checkbox"
                            checked={customRolePermissions[module]?.[action]}
                            onchange={() => toggleCustomRolePermission(module, action)}
                          />
                          {actionLabel}
                        </label>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>

              <div class="custom-role-form-actions">
                <button type="button" class="secondary-btn" onclick={closeCustomRoleForm}>
                  <span>Cancelar</span>
                </button>
                <button
                  type="button"
                  class="primary-btn"
                  onclick={handleSaveCustomRole}
                  disabled={isSavingCustomRole || !customRoleName.trim()}
                >
                  <Save size={18} />
                  <span>{isSavingCustomRole ? "Guardando..." : "Guardar plantilla"}</span>
                </button>
              </div>
            </div>
          {/if}
        </div>
      </details>

      {#if canCreateSettings}
        <details class="section collapsible-section">
          <summary class="section-summary">
            <span>
              <UserPlus size={17} />
              Invitar miembro
            </span>
            <small>Email y permisos iniciales</small>
            <ChevronDown size={18} />
          </summary>
          <div class="section-body">
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
                  <div class="role-template-section">
                    <div class="role-template-heading">
                      <h4>Plantillas de permisos</h4>
                      <p>Rellena los permisos de una vez y ajusta cualquier checkbox después.</p>
                    </div>
                    <div class="role-template-grid">
                      {#each roleTemplates as role}
                        <button
                          type="button"
                          class="role-template-btn"
                          class:active={selectedNewMemberRole === role.id}
                          onclick={() => applyNewMemberRoleTemplate(role.id)}
                          title={role.description}
                        >
                          <span>{role.label}</span>
                          <small>{role.description}</small>
                        </button>
                      {/each}
                    </div>
                  </div>

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
              <span>{isAddingMember ? "Enviando..." : "Enviar invitación"}</span>
            </button>
          </div>
        </details>
      {/if}

      <details class="section collapsible-section">
        <summary class="section-summary">
          <span>
            <Users size={17} />
            Miembros
          </span>
          <small>{memberList.length} personas</small>
          <ChevronDown size={18} />
        </summary>
        <div class="section-body members-list">
          {#each memberList as member}
              <article class="member-item">
                <div class="member-header">
                  <div class="member-avatar">
                    {#if getMemberPhoto(member)}
                      <img src={optimizeCloudinary(getMemberPhoto(member), 84, { height: 84, crop: "fill" })} alt={member.name || member.email} width="42" height="42" loading="eager" decoding="async" />
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
                      {#if canEditSettings}
                        <div class="role-template-section">
                          <div class="role-template-heading">
                            <h4>Plantillas de permisos</h4>
                            <p>Aplicar una plantilla reemplaza los permisos visibles antes de guardar.</p>
                          </div>
                          <div class="role-template-grid">
                            {#each roleTemplates as role}
                              <button
                                type="button"
                                class="role-template-btn"
                                class:active={selectedMemberRoles[member.id] === role.id}
                                onclick={() => applyMemberRoleTemplate(member.id, role.id)}
                                title={role.description}
                              >
                                <span>{role.label}</span>
                                <small>{role.description}</small>
                              </button>
                            {/each}
                          </div>
                        </div>
                      {/if}

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
                    <button
                      class="secondary-btn"
                      onclick={() => handleCreateTemplateFromMember(member)}
                      disabled={isSavingCustomRole}
                    >
                      <Plus size={16} />
                      <span>Crear plantilla</span>
                    </button>
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
      </details>

      {#if canViewSettings}
        <details class="section collapsible-section">
          <summary class="section-summary">
            <span>
              <span class="ghost-emoji" aria-hidden="true">👻</span>
              Fantasmas
            </span>
            <small>{ghostsList.length} {ghostsList.length === 1 ? "fantasma" : "fantasmas"}</small>
            <ChevronDown size={18} />
          </summary>
          <div class="section-body members-list">
            <p class="ghost-help">
              Los fantasmas son miembros virtuales sin login. Puedes registrar sus jornadas y horas extra,
              pero nunca generan coste para el equipo. Solo se muestran en la sección "Fantasmas" de las
              estadísticas avanzadas.
            </p>

            {#if canManageGhosts}
              <div class="ghost-add">
                <input
                  type="text"
                  placeholder="Nombre del fantasma (ej. Juan sin apellido)"
                  bind:value={newGhostName}
                  disabled={isAddingGhost}
                  maxlength="80"
                  onkeydown={(event) => event.key === "Enter" && handleAddGhost()}
                />
                <div class="ghost-masters">
                  <small class="ghost-masters-label">Masters (al menos uno)</small>
                  <div class="ghost-masters-options">
                    {#each masterCandidates() as candidate (candidate.uid)}
                      <label class="ghost-master-pill">
                        <input
                          type="checkbox"
                          checked={newGhostMasters.includes(candidate.uid)}
                          disabled={isAddingGhost}
                          onchange={() => (newGhostMasters = toggleMaster(newGhostMasters, candidate.uid))}
                        />
                        <span>{candidate.name}{candidate.isAdmin ? " (admin)" : ""}</span>
                      </label>
                    {/each}
                  </div>
                </div>
                <button
                  type="button"
                  class="primary-btn"
                  onclick={handleAddGhost}
                  disabled={isAddingGhost || !newGhostName.trim() || newGhostMasters.length === 0}
                >
                  <Plus size={18} />
                  <span>{isAddingGhost ? "Añadiendo..." : "Añadir fantasma"}</span>
                </button>
              </div>
            {/if}

            {#each ghostsList as ghost (ghost.id)}
              <article class="member-item ghost-item">
                <div class="member-header">
                  <div class="member-avatar ghost-avatar" aria-hidden="true">
                    <span>👻</span>
                  </div>
                  <div>
                    {#if editingGhostId === ghost.id}
                      <input
                        type="text"
                        class="ghost-name-input"
                        bind:value={editingGhostName}
                        maxlength="80"
                        onkeydown={(event) => event.key === "Enter" && handleSaveGhostName(ghost)}
                      />
                    {:else}
                      <h3>{ghost.name}</h3>
                      <p>{formatGhostSummary(ghost)}</p>
                    {/if}
                  </div>
                  <span class="ghost-badge">👻 Fantasma</span>
                </div>
                {#if editingGhostId === ghost.id}
                  <div class="ghost-masters">
                    <small class="ghost-masters-label">Masters (al menos uno)</small>
                    <div class="ghost-masters-options">
                      {#each masterCandidates() as candidate (candidate.uid)}
                        <label class="ghost-master-pill">
                          <input
                            type="checkbox"
                            checked={editingGhostMasters.includes(candidate.uid)}
                            onchange={() => (editingGhostMasters = toggleMaster(editingGhostMasters, candidate.uid))}
                          />
                          <span>{candidate.name}{candidate.isAdmin ? " (admin)" : ""}</span>
                        </label>
                      {/each}
                    </div>
                  </div>
                {:else}
                  <div class="ghost-masters-readonly">
                    <small class="ghost-masters-label">Masters:</small>
                    <div class="ghost-masters-options">
                      {#each masterCandidates().filter((c) => (ghost.masters || []).includes(c.uid)) as candidate (candidate.uid)}
                        <span class="ghost-master-readonly">{candidate.name}</span>
                      {:else}
                        <span class="ghost-master-readonly empty">Sin masters asignados</span>
                      {/each}
                    </div>
                  </div>
                {/if}
                {#if canManageGhosts}
                  <div class="member-actions">
                    {#if editingGhostId === ghost.id}
                      <button class="secondary-btn" onclick={() => handleSaveGhostName(ghost)}>
                        <Save size={16} />
                        <span>Guardar</span>
                      </button>
                      <button class="secondary-btn" onclick={cancelEditingGhost}>
                        <XCircle size={16} />
                        <span>Cancelar</span>
                      </button>
                    {:else}
                      <button class="secondary-btn" onclick={() => startEditingGhost(ghost)}>
                        <Pencil size={16} />
                        <span>Editar</span>
                      </button>
                      <button class="danger-soft-btn" onclick={() => handleRemoveGhost(ghost)}>
                        <Trash2 size={16} />
                        <span>Eliminar</span>
                      </button>
                    {/if}
                  </div>
                {/if}
              </article>
            {:else}
              {#if !canManageGhosts}
                <p class="ghost-empty">No hay fantasmas en este equipo todavía.</p>
              {/if}
            {/each}
          </div>
        </details>
      {/if}

      <details class="section danger-section collapsible-section">
        <summary class="section-summary">
          <span>
            <AlertCircle size={17} />
            Zona peligrosa
          </span>
          <small>{isAdmin ? "Eliminar equipo" : "Salir del equipo"}</small>
          <ChevronDown size={18} />
        </summary>
        <div class="section-body">
          {#if isAdmin}
            <p>Como administrador, abandonar el equipo eliminará definitivamente el equipo y quitará el acceso a todos los miembros.</p>
            <button class="delete-team-btn" onclick={handleLeaveTeam}>
              <Trash2 size={18} />
              <span>Abandonar y eliminar equipo</span>
            </button>
          {:else}
            <p>Abandonar el equipo quitará tu acceso a sus tareas, chat, pagos, inventario y ubicaciones.</p>
            <button class="delete-team-btn" onclick={handleLeaveTeam}>
              <UserMinus size={18} />
              <span>Abandonar equipo</span>
            </button>
          {/if}
        </div>
      </details>
    </div>
  {/if}
</div>

<style>
  .team-settings-page {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    box-sizing: border-box;
    padding: 20px 16px var(--bottom-nav-clearance);
    padding-top: var(--page-top-safe);
    background: var(--bg-page);
    color: var(--text-primary);
    min-width: 0;
  }

  .team-settings-page,
  .team-settings-page * {
    min-width: 0;
  }

  header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
    min-width: 0;
  }

  h2, h3, h4, p {
    margin: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  h2 {
    font-size: 16px;
    font-weight: 800;
    margin-bottom: 0;
  }

  .content {
    width: min(100%, 900px);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .section,
  .member-item {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 14px;
    box-shadow: var(--shadow-card);
    min-width: 0;
    overflow: hidden;
  }

  .collapsible-section {
    padding: 0;
    overflow: hidden;
  }

  .section-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .section-summary,
  .settings-summary {
    list-style: none;
    cursor: pointer;
    user-select: none;
  }

  .section-summary::-webkit-details-marker,
  .settings-summary::-webkit-details-marker {
    display: none;
  }

  .section-summary {
    min-height: 54px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .settings-summary {
    min-height: 50px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .section-summary > span,
  .settings-summary > span {
    min-width: 0;
    flex: 1;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 850;
    overflow: hidden;
  }

  .section-summary small,
  .settings-summary small {
    flex-shrink: 0;
    max-width: 50%;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .section-summary > :global(svg:last-child),
  .settings-summary > :global(svg:last-child),
  .accordion-trigger :global(svg) {
    transition: transform 0.18s ease;
    flex-shrink: 0;
  }

  .collapsible-section[open] > .section-summary,
  .settings-panel[open] > .settings-summary {
    border-bottom: 1px solid var(--border-color);
  }

  .collapsible-section[open] > .section-summary > :global(svg:last-child),
  .settings-panel[open] > .settings-summary > :global(svg:last-child),
  .accordion-trigger.open :global(svg) {
    transform: rotate(180deg);
  }

  .profile-row {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 12px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .profile-heading {
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .profile-heading p {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.35;
    margin-top: 3px;
  }

  .team-photo {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: 16px;
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
    width: 28px;
    height: 28px;
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
    flex: 1 1 200px;
    min-width: 0;
  }

  .settings-field {
    margin-bottom: 10px;
    min-width: 0;
  }

  .settings-panel {
    margin-top: 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-page);
    overflow: hidden;
  }

  .settings-panel-body {
    padding: 12px;
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  .company-grid,
  .operation-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    min-width: 0;
  }

  .settings-panel-body .settings-field {
    margin-bottom: 0;
    min-width: 0;
  }

  .field-help {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.4;
    margin-top: 5px;
    overflow-wrap: anywhere;
  }

  .field-label {
    display: block;
    margin-bottom: 8px;
  }

  .theme-color-control {
    display: grid;
    gap: 8px;
  }

  .input-with-icon.color-input {
    margin-bottom: 0;
  }

  .color-input input[type="color"] {
    width: 36px;
    min-width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .color-input input[type="text"] {
    text-transform: uppercase;
    font-weight: 800;
  }

  .theme-presets {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(28px, 1fr));
    gap: 7px;
    max-width: 220px;
  }

  .theme-presets button {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    border: 2px solid var(--border-color);
    background: var(--preset-color);
    cursor: pointer;
    justify-self: start;
  }

  .theme-presets button.active {
    border-color: var(--text-primary);
    box-shadow: 0 0 0 3px var(--bg-accent-subtle);
  }

  .weekday-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 5px;
  }

  .weekday-toggle {
    min-height: 36px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    text-align: center;
    overflow: hidden;
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

  input,
  select,
  textarea {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    min-height: 42px;
    padding: 9px 11px;
    margin-top: 6px;
    font-size: 14px;
    font-family: inherit;
  }

  textarea {
    min-height: 76px;
    resize: vertical;
    line-height: 1.45;
  }

  .input-with-icon {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    min-height: 42px;
    padding: 0 11px;
    margin-bottom: 10px;
  }

  .input-with-icon input {
    border: none;
    background: transparent;
    margin: 0;
    padding-left: 0;
    min-width: 0;
    flex: 1;
  }

  .flag-card {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 14px;
    margin-top: 6px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    transition: border-color 0.18s ease, background 0.18s ease;
    min-width: 0;
  }

  .flag-card-active {
    background: color-mix(in srgb, var(--success-color) 6%, var(--bg-card));
    border-color: color-mix(in srgb, var(--success-color) 32%, var(--border-color));
  }

  .flag-card-inactive {
    background: color-mix(in srgb, var(--warning-color) 6%, var(--bg-card));
    border-color: color-mix(in srgb, var(--warning-color) 32%, var(--border-color));
  }

  .flag-card-visible {
    background: color-mix(in srgb, var(--info-color) 6%, var(--bg-card));
    border-color: color-mix(in srgb, var(--info-color) 32%, var(--border-color));
  }

  .flag-card-hidden {
    background: var(--bg-input);
    border-color: var(--border-color);
    border-style: dashed;
  }

  .flag-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: var(--bg-input);
    color: var(--text-secondary);
    transition: background 0.18s ease, color 0.18s ease;
  }

  .flag-card-active .flag-icon {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }

  .flag-card-inactive .flag-icon {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .flag-card-visible .flag-icon {
    background: var(--bg-info-subtle);
    color: var(--info-color);
  }

  .flag-card-hidden .flag-icon {
    background: var(--bg-card);
    color: var(--text-secondary);
  }

  .flag-body {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .flag-body strong {
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 800;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .flag-body small {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .ios-switch {
    position: relative;
    width: 52px;
    height: 30px;
    flex-shrink: 0;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-secondary) 32%, var(--bg-card));
    cursor: pointer;
    transition: background 0.22s ease;
    appearance: none;
  }

  .ios-switch:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text-secondary) 42%, var(--bg-card));
  }

  .ios-switch.on {
    background: var(--success-color);
  }

  .flag-card-visible .ios-switch.on,
  .flag-card-hidden .ios-switch.on {
    background: var(--success-color);
  }

  .flag-card-inactive .ios-switch.on {
    background: var(--warning-color);
  }

  .ios-switch:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .ios-switch-handle {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 24px;
    height: 24px;
    background: #ffffff;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.18);
    transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.2, 1.2);
    will-change: transform;
  }

  .ios-switch.on .ios-switch-handle {
    transform: translateX(22px);
  }

  @media (prefers-reduced-motion: reduce) {
    .ios-switch,
    .ios-switch-handle,
    .flag-card,
    .flag-icon {
      transition: none;
    }
  }

  .section-heading-row,
  .custom-role-form-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .section-heading-row {
    justify-content: space-between;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .section-heading-row h2 {
    margin-bottom: 0;
  }

  .compact-btn {
    min-height: 36px;
    padding-inline: 11px;
    font-size: 13px;
  }

  .section-action {
    align-self: flex-start;
  }

  .custom-roles-list,
  .custom-role-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .custom-role-card {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    padding: 12px;
    min-width: 0;
  }

  .custom-role-main {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .custom-role-main > div {
    flex: 1 1 200px;
    min-width: 0;
  }

  .custom-role-main h3 {
    font-size: 15px;
    font-weight: 800;
    overflow-wrap: anywhere;
  }

  .custom-role-main p,
  .compact-empty {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.4;
    margin-top: 4px;
    overflow-wrap: anywhere;
  }

  .custom-role-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-card);
    color: var(--text-primary);
  }

  .icon-btn.danger {
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
  }

  .role-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }

  .role-summary span {
    min-height: 26px;
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    background: var(--bg-card);
    color: var(--text-secondary);
    padding: 0 9px;
    font-size: 12px;
    font-weight: 800;
  }

  .custom-role-form {
    margin-top: 14px;
    border-top: 1px solid var(--border-color);
    padding-top: 14px;
  }

  .custom-role-form-actions {
    justify-content: flex-end;
    align-items: stretch;
    flex-wrap: wrap;
  }

  .custom-role-form-actions .primary-btn,
  .custom-role-form-actions .secondary-btn {
    width: auto;
    min-width: 132px;
    flex: 1 1 140px;
  }

  .role-template-section {
    margin: 2px 0 10px;
  }

  .role-template-heading {
    margin-bottom: 9px;
  }

  .role-template-heading h4 {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 800;
    color: var(--text-primary);
  }

  .role-template-heading p {
    margin: 0;
    font-size: 13px;
    line-height: 1.4;
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }

  .role-template-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .role-template-btn {
    min-height: 84px;
    padding: 11px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-primary);
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 5px;
    transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
    min-width: 0;
  }

  .role-template-btn:hover {
    border-color: var(--accent-color);
    transform: translateY(-1px);
  }

  .role-template-btn.active {
    border-color: var(--accent-color);
    background: var(--bg-accent-subtle);
  }

  .role-template-btn span {
    font-size: 13px;
    font-weight: 800;
    color: var(--text-primary);
    overflow-wrap: anywhere;
  }

  .role-template-btn small {
    font-size: 11px;
    line-height: 1.35;
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }

  .permissions-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .permissions-editor.compact {
    margin-top: 8px;
  }

  .accordion {
    margin-bottom: 14px;
    min-width: 0;
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
    min-width: 0;
  }

  .accordion-trigger :global(svg) {
    transition: transform 0.18s ease;
    flex-shrink: 0;
  }

  .accordion-trigger.open :global(svg) {
    transform: rotate(180deg);
  }

  .accordion-panel {
    margin-top: 8px;
    min-width: 0;
  }

  .permission-row {
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 12px;
    min-width: 0;
  }

  .permission-row > span {
    display: block;
    margin-bottom: 9px;
    overflow-wrap: anywhere;
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
    overflow: hidden;
  }

  .permission-actions input {
    width: auto;
    min-width: 0;
    margin: 0;
    accent-color: var(--accent-color);
    flex-shrink: 0;
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
    margin-top: 12px;
  }

  .member-actions button {
    min-width: 0;
  }

  .member-header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    min-width: 0;
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
    font-size: 16px;
    font-weight: 800;
  }

  .member-header > div:not(.member-avatar):not(.admin-badge):not(.ghost-badge) {
    flex: 1 1 140px;
    min-width: 0;
  }

  .member-header h3 {
    font-size: 15px;
    font-weight: 800;
    overflow-wrap: anywhere;
  }

  .member-header p,
  .danger-section p {
    color: var(--text-secondary);
    font-size: 13px;
    margin-top: 3px;
    overflow-wrap: anywhere;
  }

  .admin-badge {
    padding: 5px 9px;
    border-radius: 999px;
    background: var(--bg-accent-subtle);
    color: var(--accent-ink);
    font-size: 12px;
    font-weight: 800;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .ghost-emoji {
    font-size: 18px;
    margin-right: 2px;
  }

  .ghost-help {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.5;
    background: var(--bg-input);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    margin-bottom: 12px;
  }

  .ghost-add {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 12px;
    align-items: stretch;
  }

  .ghost-add input[type="text"] {
    flex: 1;
    min-width: 0;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
    background: var(--bg-input);
    color: var(--text-primary);
    font: inherit;
  }

  .ghost-add .primary-btn {
    width: auto;
    flex-shrink: 0;
    align-self: flex-start;
  }

  .ghost-masters,
  .ghost-masters-readonly {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    border: 1px solid var(--border-color);
  }

  .ghost-masters-label {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .ghost-masters-options {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .ghost-master-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--bg-surface, var(--bg-input));
    border: 1px solid var(--border-color);
    cursor: pointer;
    font-size: 13px;
    max-width: 100%;
  }

  .ghost-master-pill input {
    margin: 0;
    flex-shrink: 0;
  }

  .ghost-master-readonly {
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.18);
    color: #475569;
    font-size: 12px;
    font-weight: 600;
  }

  .ghost-master-readonly.empty {
    background: transparent;
    border: 1px dashed var(--border-color);
    color: var(--text-secondary);
  }

  .ghost-item .ghost-avatar {
    background: rgba(148, 163, 184, 0.18);
    color: #475569;
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    font-size: 22px;
    line-height: 1;
  }

  .ghost-badge {
    padding: 5px 9px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.18);
    color: #475569;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .ghost-name-input {
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
    background: var(--bg-input);
    color: var(--text-primary);
    font: inherit;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .ghost-empty {
    color: var(--text-secondary);
    font-size: 13px;
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
    font-size: 14px;
    min-width: 0;
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

  /* ---- Modern tokens (refined card spacing + subtle elevation) ---- */
  .section {
    border-radius: 14px;
    padding: 16px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.05);
  }

  .section-heading-row h2 {
    font-size: 17px;
    letter-spacing: -0.005em;
  }

  .section-summary {
    padding: 0 16px;
  }

  .settings-summary {
    padding: 0 14px;
  }

  .section-summary > span,
  .settings-summary > span {
    font-size: 15px;
  }

  .flag-card {
    border-radius: 14px;
    padding: 14px 16px;
  }

  .ios-switch {
    transition: background 0.22s ease, box-shadow 0.22s ease;
  }

  .ios-switch:hover:not(:disabled) {
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent-color) 12%, transparent);
  }

  /* ---- Mobile breakpoints ---- */
  @media (max-width: 720px) {
    .team-settings-page {
      padding: 16px 14px var(--bottom-nav-clearance);
    }

    .section, .member-item {
      padding: 14px;
    }

    .settings-panel-body {
      padding: 12px;
    }

    .flag-card {
      padding: 12px 14px;
      gap: 10px;
    }

    .company-grid,
    .operation-grid {
      grid-template-columns: 1fr;
    }

    .profile-row {
      gap: 12px;
    }

    .team-photo {
      width: 56px;
      height: 56px;
    }

    .profile-fields {
      flex-basis: 100%;
    }

    .role-template-grid {
      grid-template-columns: 1fr;
    }

    .member-actions {
      grid-template-columns: 1fr 1fr;
    }

    .section-summary small,
    .settings-summary small {
      max-width: 40%;
    }
  }

  @media (max-width: 540px) {
    .team-settings-page {
      padding: 14px 12px var(--bottom-nav-clearance);
    }

    .section {
      padding: 12px;
      border-radius: 12px;
    }

    .section-summary {
      padding: 0 12px;
      min-height: 50px;
    }

    .settings-summary {
      padding: 0 12px;
      min-height: 46px;
    }

    .section-summary > span,
    .settings-summary > span {
      font-size: 14px;
    }

    .section-heading-row h2 {
      font-size: 16px;
    }

    .profile-fields {
      flex-basis: 100%;
    }

    .flag-card {
      grid-template-columns: 40px minmax(0, 1fr) auto;
      gap: 10px;
    }

    .flag-icon {
      width: 40px;
      height: 40px;
    }

    .ios-switch {
      width: 46px;
      height: 26px;
    }

    .ios-switch.on .ios-switch-handle {
      transform: translateX(20px);
    }

    .ios-switch-handle {
      width: 20px;
      height: 20px;
    }

    .weekday-grid {
      gap: 4px;
    }

    .weekday-toggle {
      padding: 0 2px;
      font-size: 11px;
      min-height: 34px;
    }

    .permission-actions {
      grid-template-columns: 1fr;
    }

    .member-actions {
      grid-template-columns: 1fr;
    }

    .custom-role-form-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .custom-role-form-actions .primary-btn,
    .custom-role-form-actions .secondary-btn {
      width: 100%;
      min-width: 0;
    }

    .admin-badge,
    .ghost-badge {
      font-size: 11px;
      padding: 4px 8px;
    }

    .role-template-btn {
      min-height: 76px;
      padding: 10px;
    }
  }

  @media (max-width: 380px) {
    .team-settings-page {
      padding: 12px 10px var(--bottom-nav-clearance);
    }

    .section, .member-item {
      padding: 11px;
    }

    .section-summary {
      padding: 0 10px;
      gap: 8px;
    }

    .settings-summary {
      padding: 0 10px;
    }

    .flag-card {
      padding: 11px 12px;
      gap: 8px;
    }

    .flag-icon {
      width: 36px;
      height: 36px;
    }

    .weekday-toggle {
      font-size: 10px;
      padding: 0 1px;
    }

    .primary-btn,
    .secondary-btn,
    .danger-soft-btn,
    .delete-team-btn {
      padding: 0 10px;
      font-size: 13px;
    }
  }
</style>
