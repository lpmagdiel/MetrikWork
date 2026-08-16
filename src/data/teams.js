import { writable, get, derived } from 'svelte/store';
import { db } from './firebase.js';
import { doc, onSnapshot, collection, query, where, updateDoc, getDoc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { userStore, getProfileImage } from './auth.js';
import { createNotification } from './notifications.js';
import { createTeamPermissions, normalizeCustomTeamRoles, normalizeTeamPermissions } from './permissions.js';
import { normalizeNonWorkingDays } from './workLimits.js';
import { isConfiguredSystemAdmin } from './systemAdminConfig.js';

export const teamsStore = writable([]);
export const selectedTeamId = writable(null);
export const selectedTeam = derived(
    [teamsStore, selectedTeamId],
    ([$teamsStore, $selectedTeamId]) => {
        if (!$selectedTeamId) return null;
        return $teamsStore.find(t => t.id === $selectedTeamId) || null;
    }
);

let teamsUnsubscribe;

function normalizeCompanyProfile(profile = {}) {
    const fields = ['name', 'taxId', 'email', 'phone', 'address', 'iban', 'bankName', 'bizum'];
    return Object.fromEntries(
        fields.map((field) => [field, String(profile?.[field] || '').trim()])
    );
}

function generateGhostId() {
    return `ghost-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMasters(masters, team = null) {
    if (!Array.isArray(masters)) return [];
    const teamMembers = new Set(Array.isArray(team?.members) ? team.members : []);
    const teamAdmin = team?.admin ? String(team.admin) : '';
    const seen = new Set();
    const result = [];
    for (const master of masters) {
        const uid = String(master || '').trim();
        if (!uid || seen.has(uid)) continue;
        if (teamMembers.size && !teamMembers.has(uid) && uid !== teamAdmin) continue;
        seen.add(uid);
        result.push(uid);
    }
    return result;
}

function normalizeGhostWorkday(work = {}) {
    if (!work || typeof work !== 'object') return null;
    return {
        id: String(work.id || '').trim(),
        date: String(work.date || '').trim(),
        type: String(work.type || 'full-day'),
        taskTitle: String(work.taskTitle || '').trim(),
        note: String(work.note || '').trim(),
        overtimeHours: Number(work.overtimeHours) || 0,
        hours: Number(work.hours) || 0,
        startedAt: String(work.startedAt || '').trim(),
        endedAt: String(work.endedAt || '').trim(),
        durationSeconds: Number(work.durationSeconds) || 0,
        durationHours: Number(work.durationHours) || 0,
        variableHours: Number(work.variableHours) || 0,
        timerMode: String(work.timerMode || '').trim(),
        assignedBy: String(work.assignedBy || '').trim(),
        assignedByName: String(work.assignedByName || '').trim(),
        createdAt: String(work.createdAt || '').trim(),
        paid: Boolean(work.paid)
    };
}

function normalizeGhost(ghost = {}, fallbackId = '', team = null) {
    const id = String(ghost?.id || fallbackId || '').trim();
    if (!id) return null;
    const name = String(ghost?.name || '').trim().slice(0, 80);
    if (!name) return null;
    const masters = normalizeMasters(ghost?.masters, team);
    const rawWorksdays = Array.isArray(ghost?.worksdays) ? ghost.worksdays : [];
    const rawOvertime = Array.isArray(ghost?.overtime) ? ghost.overtime : [];
    const worksdays = [];
    const seenWorkIds = new Set();
    for (const entry of rawWorksdays) {
        const normalized = normalizeGhostWorkday(entry);
        if (!normalized || !normalized.id) continue;
        if (seenWorkIds.has(normalized.id)) continue;
        seenWorkIds.add(normalized.id);
        worksdays.push(normalized);
    }
    const overtime = [];
    for (const entry of rawOvertime) {
        const normalized = normalizeGhostWorkday(entry);
        if (!normalized || !normalized.id) continue;
        if (seenWorkIds.has(normalized.id)) continue;
        seenWorkIds.add(normalized.id);
        overtime.push(normalized);
    }
    return {
        id,
        name,
        masters,
        worksdays,
        overtime,
        createdAt: typeof ghost?.createdAt === 'string' ? ghost.createdAt : '',
        createdBy: typeof ghost?.createdBy === 'string' ? ghost.createdBy : '',
        updatedAt: typeof ghost?.updatedAt === 'string' ? ghost.updatedAt : ''
    };
}

export function getTeamGhosts(team) {
    if (!team) return [];
    const ghosts = Array.isArray(team.ghosts) ? team.ghosts : [];
    const normalized = [];
    const seenIds = new Set();
    for (const ghost of ghosts) {
        const parsed = normalizeGhost(ghost, ghost?.id, team);
        if (!parsed) continue;
        if (seenIds.has(parsed.id)) continue;
        seenIds.add(parsed.id);
        normalized.push(parsed);
    }
    return normalized;
}

function getGhostMasterIds(ghosts) {
    const masterIds = {};
    for (const ghost of ghosts || []) {
        for (const masterId of ghost?.masters || []) {
            masterIds[masterId] = true;
        }
    }
    return masterIds;
}

export function getGhostById(team, ghostId) {
    if (!team || !ghostId) return null;
    return getTeamGhosts(team).find((ghost) => ghost.id === ghostId) || null;
}

export function getGhostWorkdayUserId(ghostId) {
    return `ghost-${ghostId}`;
}

export function isGhostUserId(userId) {
    return typeof userId === 'string' && userId.startsWith('ghost-');
}

export function getGhostIdFromUserId(userId) {
    if (!isGhostUserId(userId)) return null;
    return String(userId).replace(/^ghost-/, '');
}

export function isGhostMaster(team, ghostId, uid) {
    if (!team || !ghostId || !uid) return false;
    const ghost = getGhostById(team, ghostId);
    if (!ghost) return false;
    if (team.admin === uid) return true;
    return Array.isArray(ghost.masters) && ghost.masters.includes(uid);
}

export function hasGhostControlPermission(team, uid) {
    if (!team || !uid) return false;
    if (team.admin === uid) return true;
    return Boolean(team.memberPermissions?.[uid]?.ghosts?.control);
}

export function hasGhostCreatePermission(team, uid) {
    if (!team || !uid) return false;
    if (team.admin === uid) return true;
    return Boolean(
        team.memberPermissions?.[uid]?.ghosts?.create ||
        team.memberPermissions?.[uid]?.ghosts?.control
    );
}

function assertCanManageGhosts(team, user, action = 'create') {
    if (!team || !user?.uid) throw new Error('Datos insuficientes para gestionar fantasmas');
    if (team.admin === user.uid) return;
    const memberPermissions = team.memberPermissions?.[user.uid];
    const ghostsPermissions = memberPermissions?.ghosts || {};
    const allowed = action === 'create'
        ? Boolean(ghostsPermissions.create || ghostsPermissions.control)
        : action === 'edit'
            ? Boolean(ghostsPermissions.create || ghostsPermissions.control)
            : action === 'delete'
                ? Boolean(ghostsPermissions.create || ghostsPermissions.control)
                : Boolean(ghostsPermissions.control);
    if (!allowed) {
        throw new Error('No tienes permisos para gestionar fantasmas en este equipo');
    }
}

function assertCanAssignGhostWorkday(team, ghostId, user) {
    const uid = user?.uid;
    if (!team || !ghostId || !uid) {
        throw new Error('Datos insuficientes para asignar jornada al fantasma');
    }
    if (team.admin === uid) return;
    if (hasGhostControlPermission(team, uid)) return;
    if (isGhostMaster(team, ghostId, uid)) return;
    throw new Error('No tienes permisos para registrar jornadas de este fantasma');
}

export async function addTeamGhost(teamId, data = {}) {
    const user = get(userStore);
    const team = get(teamsStore).find((t) => t.id === teamId);
    if (!team) throw new Error('Equipo no encontrado');
    assertCanManageGhosts(team, user, 'create');

    const normalizedName = String(data?.name || '').trim();
    if (!normalizedName) throw new Error('Escribe un nombre para el fantasma');

    const masters = normalizeMasters(data?.masters, team);
    if (masters.length === 0) {
        throw new Error('Asigna al menos un master válido (admin o miembro del equipo)');
    }

    const now = new Date().toISOString();
    const newGhost = {
        id: generateGhostId(),
        name: normalizedName,
        masters,
        worksdays: [],
        overtime: [],
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now
    };
    const updatedGhosts = [...getTeamGhosts(team), newGhost];
    await updateDoc(doc(db, 'teams', teamId), {
        ghosts: updatedGhosts,
        ghostMasterIds: getGhostMasterIds(updatedGhosts),
        updatedAt: now
    });
    return newGhost;
}

export async function updateTeamGhost(teamId, ghostId, data = {}) {
    const user = get(userStore);
    const team = get(teamsStore).find((t) => t.id === teamId);
    if (!team) throw new Error('Equipo no encontrado');
    if (!getGhostById(team, ghostId)) throw new Error('Fantasma no encontrado');
    assertCanManageGhosts(team, user, 'edit');

    const existing = getGhostById(team, ghostId);
    const updatedFields = { updatedAt: new Date().toISOString() };

    if (data?.name !== undefined) {
        const updatedName = String(data.name || '').trim();
        if (!updatedName) throw new Error('Escribe un nombre para el fantasma');
        updatedFields.name = updatedName;
    }

    if (data?.masters !== undefined) {
        const masters = normalizeMasters(data.masters, team);
        if (masters.length === 0) {
            throw new Error('Asigna al menos un master válido (admin o miembro del equipo)');
        }
        updatedFields.masters = masters;
    }

    const updatedGhosts = getTeamGhosts(team).map((ghost) =>
        ghost.id === ghostId
            ? { ...ghost, ...updatedFields, masters: updatedFields.masters ?? ghost.masters }
            : ghost
    );

    const now = updatedFields.updatedAt;
    await updateDoc(doc(db, 'teams', teamId), {
        ghosts: updatedGhosts,
        ghostMasterIds: getGhostMasterIds(updatedGhosts),
        updatedAt: now
    });
    return updatedGhosts.find((ghost) => ghost.id === ghostId) || null;
}

export async function removeTeamGhost(teamId, ghostId) {
    const user = get(userStore);
    const team = get(teamsStore).find((t) => t.id === teamId);
    if (!team) throw new Error('Equipo no encontrado');
    if (!getGhostById(team, ghostId)) throw new Error('Fantasma no encontrado');
    assertCanManageGhosts(team, user, 'delete');

    const now = new Date().toISOString();
    const updatedGhosts = getTeamGhosts(team).filter((ghost) => ghost.id !== ghostId);
    await updateDoc(doc(db, 'teams', teamId), {
        ghosts: updatedGhosts,
        ghostMasterIds: getGhostMasterIds(updatedGhosts),
        updatedAt: now
    });
    return ghostId;
}

export function getGhostWorkdays(team, ghostId) {
    const ghost = getGhostById(team, ghostId);
    if (!ghost) return [];
    return [...(ghost.worksdays || []), ...(ghost.overtime || [])];
}

export function findGhostRegularWorkday(team, ghostId, date, { excludeId = '' } = {}) {
    const ghost = getGhostById(team, ghostId);
    if (!ghost || !date) return null;
    const worksdays = Array.isArray(ghost.worksdays) ? ghost.worksdays : [];
    return worksdays.find((entry) => {
        if (!entry || entry.date !== date) return false;
        if (excludeId && entry.id === excludeId) return false;
        return entry.type === 'full-day' || entry.type === 'half-day';
    }) || null;
}

export async function addGhostWorkday(teamId, ghostId, workDay, assignedBy = null) {
    const user = get(userStore);
    const team = get(teamsStore).find((t) => t.id === teamId);
    if (!team) throw new Error('Equipo no encontrado');
    const ghost = getGhostById(team, ghostId);
    if (!ghost) throw new Error('Fantasma no encontrado');
    assertCanAssignGhostWorkday(team, ghostId, user);

    if (!workDay?.date) throw new Error('La jornada del fantasma necesita una fecha');
    const assignedByUid = assignedBy?.uid || user?.uid || '';
    if (!assignedByUid) throw new Error('Falta el usuario que registra la jornada');

    const isOvertime = workDay.type === 'overtime' || workDay.timerMode === 'overtime';
    const entryId = workDay.id || workDay.clientOperationId || `gd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const entry = {
        id: entryId,
        date: String(workDay.date || '').trim(),
        type: isOvertime ? 'overtime' : (workDay.type || 'full-day'),
        taskTitle: String(workDay.taskTitle || '').trim(),
        note: String(workDay.note || '').trim(),
        overtimeHours: isOvertime ? (Number(workDay.overtimeHours ?? workDay.hours) || 0) : 0,
        hours: isOvertime ? (Number(workDay.hours ?? workDay.overtimeHours) || 0) : 0,
        startedAt: String(workDay.startedAt || '').trim(),
        endedAt: String(workDay.endedAt || '').trim(),
        durationSeconds: Number(workDay.durationSeconds) || 0,
        durationHours: Number(workDay.durationHours) || 0,
        variableHours: Number(workDay.variableHours) || 0,
        timerMode: String(workDay.timerMode || '').trim(),
        assignedBy: assignedByUid,
        assignedByName: assignedBy?.name || user?.name || user?.email || '',
        createdAt: now,
        paid: false
    };

    const currentGhost = getGhostById(team, ghostId);
    const targetArray = isOvertime ? 'overtime' : 'worksdays';
    const otherArray = isOvertime ? 'worksdays' : 'overtime';
    const updatedEntries = [...(currentGhost?.[targetArray] || []), entry];
    const updatedGhosts = getTeamGhosts(team).map((g) =>
        g.id === ghostId
            ? { ...g, [targetArray]: updatedEntries, [otherArray]: currentGhost?.[otherArray] || [], updatedAt: now }
            : g
    );

    await updateDoc(doc(db, 'teams', teamId), {
        ghosts: updatedGhosts,
        ghostMasterIds: getGhostMasterIds(updatedGhosts),
        updatedAt: now
    });
    return entry;
}

export async function removeGhostWorkday(teamId, ghostId, workdayId) {
    const user = get(userStore);
    const team = get(teamsStore).find((t) => t.id === teamId);
    if (!team) throw new Error('Equipo no encontrado');
    const ghost = getGhostById(team, ghostId);
    if (!ghost) throw new Error('Fantasma no encontrado');
    assertCanAssignGhostWorkday(team, ghostId, user);

    if (!workdayId) throw new Error('Falta el identificador de la jornada');

    const now = new Date().toISOString();
    const updatedGhosts = getTeamGhosts(team).map((g) => {
        if (g.id !== ghostId) return g;
        return {
            ...g,
            worksdays: (g.worksdays || []).filter((entry) => entry.id !== workdayId),
            overtime: (g.overtime || []).filter((entry) => entry.id !== workdayId),
            updatedAt: now
        };
    });

    await updateDoc(doc(db, 'teams', teamId), {
        ghosts: updatedGhosts,
        ghostMasterIds: getGhostMasterIds(updatedGhosts),
        updatedAt: now
    });
    return workdayId;
}

function assertCanManageGhostRecords(team, user) {
    if (!team || !user?.uid) {
        throw new Error('Datos insuficientes para limpiar registros de fantasmas');
    }
    if (team.admin === user.uid) return;
    const memberPermissions = team.memberPermissions?.[user.uid];
    const ghostsPermissions = memberPermissions?.ghosts || {};
    if (!ghostsPermissions.create && !ghostsPermissions.control) {
        throw new Error('No tienes permisos para limpiar registros de fantasmas');
    }
}

export async function clearGhostWorkdays(teamId, ghostId) {
    const user = get(userStore);
    const team = get(teamsStore).find((t) => t.id === teamId);
    if (!team) throw new Error('Equipo no encontrado');
    const ghost = getGhostById(team, ghostId);
    if (!ghost) throw new Error('Fantasma no encontrado');
    assertCanManageGhostRecords(team, user);

    const removedWorksdays = (ghost.worksdays || []).length;
    const removedOvertime = (ghost.overtime || []).length;
    if (removedWorksdays === 0 && removedOvertime === 0) return { removedWorksdays: 0, removedOvertime: 0 };

    const now = new Date().toISOString();
    const updatedGhosts = getTeamGhosts(team).map((g) => {
        if (g.id !== ghostId) return g;
        return {
            ...g,
            worksdays: [],
            overtime: [],
            updatedAt: now
        };
    });

    await updateDoc(doc(db, 'teams', teamId), {
        ghosts: updatedGhosts,
        ghostMasterIds: getGhostMasterIds(updatedGhosts),
        updatedAt: now
    });
    return { removedWorksdays, removedOvertime };
}

export function getTeamMembers() {
    const teamData = get(selectedTeam);
    if (!teamData || !teamData.memberSettings) return [];

    const teamMembers = [];
    for(let memberId in teamData.memberSettings){
        teamMembers.push({...teamData.memberSettings[memberId], id: memberId});
    }
    return teamMembers;
}

export async function getTeamMembersData(teamId) {
    const team = get(teamsStore);
    const teamData = team.find(t => t.id === teamId);
    return teamData?.membersData || [];
}

export function subscribeToTeams(uid, callback) {
    if (teamsUnsubscribe) teamsUnsubscribe();

    if (!uid) {
        teamsStore.set([]);
        return;
    }

    const teamsQuery = query(collection(db, 'teams'), where('members', 'array-contains', uid));
    let lastCachedTeamsJson = '';

    teamsUnsubscribe = onSnapshot(teamsQuery, (snapshot) => {
        const teams = [];
        snapshot.forEach((doc) => {
            teams.push({ id: doc.id, name: doc.data().team, ...doc.data() });
        });
        teamsStore.set(teams);
        const minimal = teams.map(t => ({ id: t.id, name: t.name }));
        const serialized = JSON.stringify(minimal);
        if (serialized !== lastCachedTeamsJson) {
            lastCachedTeamsJson = serialized;
            try {
                localStorage.setItem('userTeams', serialized);
            } catch (e) {
                console.log('Error saving teams to localStorage:', e);
            }
        }

        if (callback) callback(teams);
    }, (error) => {
        console.error("Error in teams listener:", error);
    });
}

/**
 * Crea un nuevo equipo. Solo requiere un nombre: ya no se elige plan.
 *
 * @param {string} teamName
 * @returns {Promise<string>} id del equipo creado
 */
export async function createTeam(teamName) {
    const user = get(userStore);
    if (!user) throw new Error("Usuario no autenticado");
    if (!isConfiguredSystemAdmin(user.email)) {
        throw new Error("Solo un administrador puede crear equipos");
    }

    const normalizedName = String(teamName || '').trim();
    if (!normalizedName) throw new Error("Escribe un nombre para el equipo");

    try {
        const now = new Date().toISOString();
        const teamRef = doc(collection(db, 'teams'));
        const profileImage = getProfileImage(user);
        const teamDoc = {
            team: normalizedName,
            admin: user.uid,
            adminEmail: user.email || '',
            members: [user.uid],
            membersData: [{
                id: user.uid,
                name: user.name || user.email,
                email: user.email || '',
                avatar: profileImage,
                photoURL: profileImage
            }],
            memberPermissions: {
                [user.uid]: createTeamPermissions(true)
            },
            ghosts: [],
            ghostMasterIds: {},
            projectBudget: 0,
            projectBudgetCurrency: 'MXN',
            active: true,
            hidden: false,
            createdAt: now
        };

        await setDoc(teamRef, teamDoc);
        return teamRef.id;
    } catch (error) {
        console.error("Error creating team:", error);
        throw error;
    }
}

export async function addMemberByEmail(teamId, email, permissions = {}) {
    try {
        const user = get(userStore);
        if (!user?.uid) throw new Error("Usuario no autenticado");

        const normalizedEmail = email.trim().toLowerCase();
        const usersRef = collection(db, 'users');
        let querySnapshot = await getDocs(query(usersRef, where('emailNormalized', '==', normalizedEmail)));

        if (querySnapshot.empty) {
            querySnapshot = await getDocs(query(usersRef, where('email', '==', normalizedEmail)));
        }

        if (querySnapshot.empty && email.trim() !== normalizedEmail) {
            querySnapshot = await getDocs(query(usersRef, where('email', '==', email.trim())));
        }

        if (querySnapshot.empty) {
            throw new Error("Usuario no encontrado");
        }

        const userDoc = querySnapshot.docs[0];
        const memberUid = userDoc.id;
        const memberProfile = userDoc.data();
        const memberName = memberProfile.name || email;
        const memberImage = getProfileImage(memberProfile);

        const teamRef = doc(db, 'teams', teamId);

        const teamSnapshot = await getDoc(teamRef);
        if (!teamSnapshot.exists()) {
            throw new Error("Equipo no encontrado");
        }

        const teamData = teamSnapshot.data();
        const members = teamData.members || [];
        if (members.includes(memberUid)) {
            throw new Error("El usuario ya es miembro de este equipo");
        }

        const teamName = teamData?.team || "un equipo";
        const invitationRef = doc(db, 'users', memberUid, 'teamInvitations', teamId);
        const invitationSnapshot = await getDoc(invitationRef);
        if (invitationSnapshot.exists()) {
            const invitationStatus = invitationSnapshot.data()?.status;
            if (invitationStatus === 'pendiente') {
                throw new Error("Este usuario ya tiene una invitación pendiente");
            }
            if (invitationStatus === 'aceptado') {
                throw new Error("Este usuario ya aceptó una invitación para este equipo");
            }
        }

        const normalizedPermissions = normalizeTeamPermissions(permissions);
        const now = new Date().toISOString();
        await setDoc(invitationRef, {
            teamId,
            teamName,
            invitedUserId: memberUid,
            invitedUserEmail: memberProfile.email || email,
            invitedUserName: memberName,
            invitedUserPhotoURL: memberImage,
            invitedBy: user.uid,
            invitedByName: user.name || user.email || 'Un administrador',
            permissions: normalizedPermissions,
            status: 'pendiente',
            createdAt: now,
            updatedAt: now
        });

        await createNotification(
            memberUid,
            "Invitación a equipo",
            `${user.name || user.email || 'Un administrador'} te invitó a unirte a "${teamName}".`,
            {
                url: '/requests?section=invitations',
                type: 'team_invitation',
                sourceId: teamId,
                teamId
            }
        );

        return { id: memberUid, name: memberName, invited: true };
    } catch (error) {
        console.error("Error inviting member by email:", error);
        throw error;
    }
}

export async function updateMemberSettings(teamId, memberId, dailyRate, extraHourRate) {
    const user = get(userStore);
    if (!user) return;

    try {
        const teamRef = doc(db, 'teams', teamId);
        await updateDoc(teamRef, {
            [`memberSettings.${memberId}`]: {
                dailyRate: Number(dailyRate) || 0,
                extraHourRate: Number(extraHourRate) || 0,
                updatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error("Error updating member settings:", error);
        throw error;
    }
}

export async function updateMemberPermissions(teamId, memberId, permissions) {
    const user = get(userStore);
    if (!user) return;

    try {
        const teamRef = doc(db, 'teams', teamId);
        await updateDoc(teamRef, {
            [`memberPermissions.${memberId}`]: normalizeTeamPermissions(permissions),
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error updating member permissions:", error);
        throw error;
    }
}

export async function updateTeamCustomRoles(teamId, roles = []) {
    const user = get(userStore);
    if (!user || !teamId) return;

    try {
        await updateDoc(doc(db, 'teams', teamId), {
            customRoles: normalizeCustomTeamRoles(roles),
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error updating team custom roles:", error);
        throw error;
    }
}

export async function updateTeamProfile(teamId, data) {
    const user = get(userStore);
    if (!user || !teamId) return;

    try {
        const updateData = {
            updatedAt: new Date().toISOString()
        };

        if (typeof data.name === 'string') {
            updateData.team = data.name.trim();
        }

        if (typeof data.photoURL === 'string') {
            updateData.photoURL = data.photoURL;
        }

        if (typeof data.themePrimaryColor === 'string') {
            const color = data.themePrimaryColor.trim();
            updateData.themePrimaryColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '';
        }

        if (data.overtimeLimitHours !== undefined) {
            updateData.overtimeLimitHours = Math.max(0, Number(data.overtimeLimitHours) || 0);
        }

        if (data.nonWorkingDays !== undefined) {
            updateData.nonWorkingDays = normalizeNonWorkingDays(data.nonWorkingDays);
        }

        if (data.projectBudget !== undefined) {
            updateData.projectBudget = Math.max(0, Number(data.projectBudget) || 0);
        }

        if (typeof data.projectBudgetCurrency === 'string') {
            updateData.projectBudgetCurrency = data.projectBudgetCurrency.trim().toUpperCase() || 'MXN';
        }

        if (data.companyProfile !== undefined) {
            updateData.companyProfile = normalizeCompanyProfile(data.companyProfile);
        }

        await updateDoc(doc(db, 'teams', teamId), updateData);
    } catch (error) {
        console.error("Error updating team profile:", error);
        throw error;
    }
}

export async function removeTeamMember(teamId, memberId) {
    const user = get(userStore);
    if (!user || !teamId || !memberId) return;

    try {
        const teamRef = doc(db, 'teams', teamId);
        const teamSnapshot = await getDoc(teamRef);
        if (!teamSnapshot.exists()) throw new Error("Equipo no encontrado");

        const teamData = teamSnapshot.data();
        if (teamData.admin === memberId) {
            throw new Error("No puedes quitar al administrador del equipo");
        }

        const members = teamData.members || [];
        const membersData = teamData.membersData || [];

        if (!members.includes(memberId)) {
            throw new Error("El usuario no es miembro del equipo");
        }

        const updatedMembers = members.filter((id) => id !== memberId);
        const updatedMembersData = membersData.filter((m) => m.id !== memberId);

        await updateDoc(teamRef, {
            members: updatedMembers,
            membersData: updatedMembersData,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error removing team member:", error);
        throw error;
    }
}

export async function leaveTeam(teamId) {
    const user = get(userStore);
    if (!user?.uid || !teamId) return;

    try {
        const teamRef = doc(db, 'teams', teamId);
        const teamSnapshot = await getDoc(teamRef);
        if (!teamSnapshot.exists()) throw new Error("Equipo no encontrado");

        const teamData = teamSnapshot.data();
        if (teamData.admin === user.uid) {
            throw new Error("El administrador no puede abandonar el equipo");
        }

        const members = teamData.members || [];
        const membersData = teamData.membersData || [];
        const memberSettings = teamData.memberSettings || {};
        const memberPermissions = teamData.memberPermissions || {};

        const updatedMembers = members.filter((id) => id !== user.uid);
        const updatedMembersData = membersData.filter((m) => m.id !== user.uid);
        const updatedMemberSettings = { ...memberSettings };
        delete updatedMemberSettings[user.uid];
        const updatedMemberPermissions = { ...memberPermissions };
        delete updatedMemberPermissions[user.uid];

        await updateDoc(teamRef, {
            members: updatedMembers,
            membersData: updatedMembersData,
            memberSettings: updatedMemberSettings,
            memberPermissions: updatedMemberPermissions,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error leaving team:", error);
        throw error;
    }
}

export async function deleteTeam(teamId) {
    const user = get(userStore);
    if (!user?.uid || !teamId) return;

    try {
        const teamRef = doc(db, 'teams', teamId);
        const teamSnapshot = await getDoc(teamRef);
        if (!teamSnapshot.exists()) throw new Error("Equipo no encontrado");

        const teamData = teamSnapshot.data();
        if (teamData.admin !== user.uid) {
            throw new Error("Solo el administrador puede eliminar el equipo");
        }

        await deleteDoc(teamRef);
    } catch (error) {
        console.error("Error deleting team:", error);
        throw error;
    }
}

export async function setTeamActive(teamId, active) {
    const user = get(userStore);
    if (!user?.uid || !teamId) throw new Error("Faltan datos para actualizar el equipo");

    const teamRef = doc(db, 'teams', teamId);
    const teamSnapshot = await getDoc(teamRef);
    if (!teamSnapshot.exists()) throw new Error("Equipo no encontrado");

    const teamData = teamSnapshot.data();
    if (teamData.admin !== user.uid) {
        throw new Error("Solo el administrador puede modificar el estado del equipo");
    }

    await updateDoc(teamRef, {
        active: Boolean(active),
        updatedAt: new Date().toISOString()
    });
}

export async function setTeamHidden(teamId, hidden) {
    const user = get(userStore);
    if (!user?.uid || !teamId) throw new Error("Faltan datos para actualizar el equipo");

    const teamRef = doc(db, 'teams', teamId);
    const teamSnapshot = await getDoc(teamRef);
    if (!teamSnapshot.exists()) throw new Error("Equipo no encontrado");

    const teamData = teamSnapshot.data();
    if (teamData.admin !== user.uid) {
        throw new Error("Solo el administrador puede modificar la visibilidad del equipo");
    }

    await updateDoc(teamRef, {
        hidden: Boolean(hidden),
        updatedAt: new Date().toISOString()
    });
}
