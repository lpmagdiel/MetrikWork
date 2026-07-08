import { writable, get, derived } from 'svelte/store';
import { db } from './firebase.js';
import { doc, onSnapshot, collection, query, where, updateDoc, getDoc, getDocs, setDoc, deleteField, deleteDoc } from 'firebase/firestore';
import { userStore, getProfileImage } from './auth.js';
import { createNotification } from './notifications.js';
import { createTeamPermissions, normalizeCustomTeamRoles, normalizeTeamPermissions } from './permissions.js';
import { assertTeamMemberLimit, getTeamMonthlyPrice, normalizeTeamSizeData } from './teamSizes.js';
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

export function getTeamMembers() {
    const teamData = get(selectedTeam);
    if (!teamData || !teamData.memberSettings) return [];
    
    const teamMembers = [];
    for(let memberId in teamData.memberSettings){
        teamMembers.push({...teamData.memberSettings[memberId], id: memberId});
    }
    return teamMembers;
}

/**
 * 
 * @param {string} teamId 
 * @returns 
 */
export async function getTeamMembersData(teamId) {
    const team = get(teamsStore);
    const teamData = team.find(t => t.id === teamId);
    return teamData?.membersData || [];
}

/**
 * 
 * @param {string} uid 
 * @param {function} callback 
 * @returns 
 */
export function subscribeToTeams(uid, callback) {
    if (teamsUnsubscribe) teamsUnsubscribe();
    
    if (!uid) {
        teamsStore.set([]);
        return;
    }

    const teamsQuery = query(collection(db, 'teams'), where('members', 'array-contains', uid));
    
    teamsUnsubscribe = onSnapshot(teamsQuery, (snapshot) => {
        const teams = [];
        snapshot.forEach((doc) => {
            teams.push({ id: doc.id, name: doc.data().team, ...doc.data() });
        });
        teamsStore.set(teams);
        try {
            localStorage.setItem('userTeams', JSON.stringify(teams.map(t => ({ id: t.id, name: t.name }))));
        } catch (e) {
            console.log('Error saving teams to localStorage:', e);
        }

        if (callback) callback(teams);
    }, (error) => {
        console.error("Error in teams listener:", error);
    });
}

/**
 * 
 * @param {string} teamName 
 * @param {{ size?: string }} options
 * @returns 
 */
export async function createTeam(teamName, { size = 'S' } = {}) {
    const user = get(userStore);
    if (!user) throw new Error("Usuario no autenticado");
    if (!isConfiguredSystemAdmin(user.email)) {
        throw new Error("Solo un administrador puede crear equipos");
    }

    const normalizedName = String(teamName || '').trim();
    if (!normalizedName) throw new Error("Escribe un nombre para el equipo");
    const teamSizeData = normalizeTeamSizeData(size);
    const billingAmountEur = getTeamMonthlyPrice(teamSizeData.teamSize);

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
            projectBudget: 0,
            projectBudgetCurrency: 'MXN',
            billingDate: null,
            billingAmountEur,
            teamSize: teamSizeData.teamSize,
            maxMembers: teamSizeData.maxMembers,
            createdAt: now
        };

        await setDoc(teamRef, teamDoc);
        return teamRef.id;
    } catch (error) {
        console.error("Error creating team:", error);
        throw error;
    }
}

/**
 * 
 * @param {string} teamId 
 * @param {string} email 
 * @returns 
 */
export async function addMemberByEmail(teamId, email, permissions = {}) {
    try {
        const user = get(userStore);
        if (!user?.uid) throw new Error("Usuario no autenticado");

        // 1. Search for user by email
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

        // 2. Create an invitation instead of adding the member directly.
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
        assertTeamMemberLimit(teamData, members.length + 1);

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

/**
 * 
 * @param {string} teamId 
 * @param {string} memberId 
 * @param {number} dailyRate 
 * @param {number} extraHourRate 
 * @returns 
 */
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

        await updateDoc(teamRef, {
            members: (teamData.members || []).filter((id) => id !== memberId),
            membersData: (teamData.membersData || []).filter((member) => member.id !== memberId),
            [`memberSettings.${memberId}`]: deleteField(),
            [`memberPermissions.${memberId}`]: deleteField(),
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
            throw new Error("El administrador debe eliminar el equipo para abandonarlo");
        }

        if (!(teamData.members || []).includes(user.uid)) {
            throw new Error("No perteneces a este equipo");
        }

        await updateDoc(teamRef, {
            members: (teamData.members || []).filter((id) => id !== user.uid),
            membersData: (teamData.membersData || []).filter((member) => member.id !== user.uid),
            [`memberSettings.${user.uid}`]: deleteField(),
            [`memberPermissions.${user.uid}`]: deleteField(),
            updatedAt: new Date().toISOString()
        });

        if (get(selectedTeamId) === teamId) {
            selectedTeamId.set(null);
        }
    } catch (error) {
        console.error("Error leaving team:", error);
        throw error;
    }
}

export async function deleteTeam(teamId) {
    const user = get(userStore);
    if (!user || !teamId) return;

    try {
        await deleteDoc(doc(db, 'teams', teamId));
    } catch (error) {
        console.error("Error deleting team:", error);
        throw error;
    }
}
