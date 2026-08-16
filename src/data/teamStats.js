import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase.js';
import { getTeamGhosts } from './teams.js';

function buildWorksQuery(teamId, { startDate, endDate } = {}) {
    const constraints = [where('teamId', '==', teamId)];
    if (startDate) constraints.push(where('date', '>=', startDate));
    if (endDate) constraints.push(where('date', '<=', endDate));
    return query(collection(db, 'works'), ...constraints);
}

function buildGhostWorks(teamId, teamData, { startDate, endDate } = {}) {
    if (!teamData) return [];
    const ghosts = getTeamGhosts(teamData);
    const result = [];
    for (const ghost of ghosts) {
        const userId = `ghost-${ghost.id}`;
        const userName = ghost.name;
        const entries = [...(ghost.worksdays || []), ...(ghost.overtime || [])];
        for (const entry of entries) {
            if (!entry?.date) continue;
            if (startDate && entry.date < startDate) continue;
            if (endDate && entry.date > endDate) continue;
            const isOvertime = entry.type === 'overtime';
            const overtimeHours = isOvertime
                ? (Number(entry.overtimeHours ?? entry.hours) || 0)
                : (Number(entry.overtimeHours) || 0);
            result.push({
                id: entry.id,
                teamId,
                userId,
                userName,
                type: isOvertime ? 'overtime' : (entry.type || 'full-day'),
                overtimeHours,
                hours: Number(entry.hours) || overtimeHours || 0,
                date: entry.date,
                taskTitle: entry.taskTitle || '',
                note: entry.note || '',
                startedAt: entry.startedAt || '',
                endedAt: entry.endedAt || '',
                durationSeconds: Number(entry.durationSeconds) || 0,
                durationHours: Number(entry.durationHours) || 0,
                variableHours: Number(entry.variableHours) || 0,
                timerMode: entry.timerMode || '',
                assignedBy: entry.assignedBy || '',
                assignedByName: entry.assignedByName || '',
                isGhost: true,
                ghostId: ghost.id,
                createdAt: entry.createdAt || '',
                paid: Boolean(entry.paid)
            });
        }
    }
    return result;
}

export async function getTeamAdvancedStatsData(teamId, { startDate, endDate } = {}) {
    if (!teamId) {
        return {
            works: [],
            payments: [],
            inventory: [],
            locations: [],
            absenceRequests: []
        };
    }

    const paymentsConstraints = [where('teamId', '==', teamId)];
    if (startDate) paymentsConstraints.push(where('date', '>=', startDate));
    if (endDate) paymentsConstraints.push(where('date', '<=', endDate));

    const absenceConstraints = [
        where('teamId', '==', teamId),
        where('status', '==', 'aceptado')
    ];
    if (startDate) absenceConstraints.push(where('endDate', '>=', startDate));
    if (endDate) absenceConstraints.push(where('startDate', '<=', endDate));

    const worksQuery = buildWorksQuery(teamId, { startDate, endDate });
    const paymentsQuery = query(collection(db, 'team_payments'), ...paymentsConstraints);
    const absenceRequestsQuery = query(collection(db, 'absenceRequests'), ...absenceConstraints);

    const [teamSnapshot, worksSnapshot, paymentsSnapshot, inventorySnapshot, locationsSnapshot, absenceRequestsSnapshot] = await Promise.all([
        getDoc(doc(db, 'teams', teamId)),
        getDocs(worksQuery),
        getDocs(paymentsQuery),
        getDocs(collection(db, 'teams', teamId, 'inventory')),
        getDocs(collection(db, 'teams', teamId, 'locations')),
        getDocs(absenceRequestsQuery)
    ]);

    const works = [];
    worksSnapshot.forEach((workDoc) => {
        works.push({ id: workDoc.id, ...workDoc.data() });
    });

    const teamData = teamSnapshot.exists() ? teamSnapshot.data() : null;
    if (teamData) {
        works.push(...buildGhostWorks(teamId, teamData, { startDate, endDate }));
    }
    works.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

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

    const absenceRequests = [];
    absenceRequestsSnapshot.forEach((requestDoc) => {
        absenceRequests.push({ id: requestDoc.id, ...requestDoc.data() });
    });

    return {
        works,
        payments,
        inventory,
        locations: locations.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
        absenceRequests: absenceRequests.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
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
