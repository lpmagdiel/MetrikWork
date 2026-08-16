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

function normalizeGhost(ghost = {}, fallbackId = '') {
    const id = String(ghost?.id || fallbackId || '').trim();
    if (!id) return null;
    const name = String(ghost?.name || '').trim().slice(0, 80);
    if (!name) return null;
    return {
        id,
        name,
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
        const parsed = normalizeGhost(ghost, ghost?.id);
        if (!parsed) continue;
        if (seenIds.has(parsed.id)) continue;
        seenIds.add(parsed.id);
        normalized.push(parsed);
    }
    return normalized;
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

export async function addTeamGhost(teamId, name) {
    const user = get(userStore);
    const team = get(teamsStore).find((t) => t.id === teamId);
    if (!team) throw new Error('Equipo no encontrado');
    assertCanManageGhosts(team, user, 'create');

    const normalizedName = String(name || '').trim();
    if (!normalizedName) throw new Error('Escribe un nombre para el fantasma');

    const now = new Date().toISOString();
    const newGhost = {
        id: generateGhostId(),
        name: normalizedName,
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now
    };
    const updatedGhosts = [...getTeamGhosts(team), newGhost];
    await updateDoc(doc(db, 'teams', teamId), {
        ghosts: updatedGhosts,
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

    const updatedName = String(data?.name || '').trim();
    if (!updatedName) throw new Error('Escribe un nombre para el fantasma');

    const now = new Date().toISOString();
    const updatedGhosts = getTeamGhosts(team).map((ghost) =>
        ghost.id === ghostId
            ? { ...ghost, name: updatedName, updatedAt: now }
            : ghost
    );
    await updateDoc(doc(db, 'teams', teamId), {
        ghosts: updatedGhosts,
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
        updatedAt: now
    });
    return ghostId;
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
