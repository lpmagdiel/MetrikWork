import { writable, get, derived } from 'svelte/store';
import { db } from './firebase.js';
import { doc, onSnapshot, collection, addDoc, query, where, updateDoc, getDoc, arrayUnion, getDocs } from 'firebase/firestore';
import { userStore } from './auth.js';
import { createNotification } from './notifications.js';

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
 * @param {Object|null} paymentData 
 * @returns 
 */
export async function createTeam(teamName, paymentData = null) {
    const user = get(userStore);
    if (!user) return;

    try {
        const teamDoc = {
            team: teamName,
            admin: user.uid,
            members: [user.uid],
            membersData: [{ id: user.uid, name: user.name || user.email }],
            createdAt: new Date().toISOString()
        };

        if (paymentData) {
            teamDoc.payment = {
                transactionId: paymentData.transactionId,
                planName: paymentData.planName,
                planPrice: paymentData.planPrice,
                amount: paymentData.amount,
                cardLast4: paymentData.cardLast4 || null,
                paymentDate: new Date().toISOString(),
                status: paymentData.status || 'succeeded'
            };
        }

        const docRef = await addDoc(collection(db, 'teams'), teamDoc);
        return docRef.id;
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
export async function addMemberByEmail(teamId, email) {
    try {
        // 1. Search for user by email
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', email));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            throw new Error("Usuario no encontrado");
        }

        const userDoc = querySnapshot.docs[0];
        const memberUid = userDoc.id;
        const memberName = userDoc.data().name || email;

        // 2. Add member to team
        const teamRef = doc(db, 'teams', teamId);
        
        const teamSnapshot = await getDoc(teamRef);
        if (teamSnapshot.exists()) {
            const members = teamSnapshot.data().members || [];
            if (members.includes(memberUid)) {
                throw new Error("El usuario ya es miembro de este equipo");
            }
        }

        await updateDoc(teamRef, {
            members: arrayUnion(memberUid),
            membersData: arrayUnion({ id: memberUid, name: memberName })
        });

        // 3. Create notification for the new member
        const teamName = teamSnapshot.data()?.team || "un equipo";
        await createNotification(
            memberUid, 
            "¡Bienvenido al equipo!", 
            `Te han añadido al equipo "${teamName}".`
        );

        return { id: memberUid, name: memberName };
    } catch (error) {
        console.error("Error adding member by email:", error);
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
