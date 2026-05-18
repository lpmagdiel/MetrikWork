import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase.js';
import { getTeamWorks } from './works.js';

export async function getTeamAdvancedStatsData(teamId) {
    if (!teamId) {
        return {
            works: [],
            payments: [],
            inventory: [],
            locations: []
        };
    }

    const paymentsQuery = query(collection(db, 'team_payments'), where('teamId', '==', teamId));

    const [works, paymentsSnapshot, inventorySnapshot, locationsSnapshot] = await Promise.all([
        getTeamWorks(teamId),
        getDocs(paymentsQuery),
        getDocs(collection(db, 'teams', teamId, 'inventory')),
        getDocs(collection(db, 'teams', teamId, 'locations'))
    ]);

    const payments = [];
    paymentsSnapshot.forEach((paymentDoc) => {
        payments.push({ id: paymentDoc.id, ...paymentDoc.data() });
    });

    const inventory = [];
    inventorySnapshot.forEach((productDoc) => {
        inventory.push({ id: productDoc.id, ...productDoc.data() });
    });

    const locations = [];
    locationsSnapshot.forEach((locationDoc) => {
        locations.push({ id: locationDoc.id, ...locationDoc.data() });
    });

    return {
        works,
        payments,
        inventory,
        locations: locations.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    };
}

export async function updateTeamBudget(teamId, amount, currency = 'MXN') {
    if (!teamId) return;

    await updateDoc(doc(db, 'teams', teamId), {
        projectBudget: Math.max(0, Number(amount) || 0),
        projectBudgetCurrency: String(currency || 'MXN').trim().toUpperCase(),
        updatedAt: new Date().toISOString()
    });
}
