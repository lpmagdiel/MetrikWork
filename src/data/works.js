import { db } from './firebase.js';
import { collection, addDoc, query, where, getDocs, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import {
    enqueueOfflineOperation,
    getQueuedOperationsByType,
    isBrowserOffline,
    isOfflineError,
    scheduleOfflineSync
} from './offlineQueue.js';
import { applyWorkdayOvertimeLimit, assertWorkingDay } from './workLimits.js';

const REGISTER_WORKDAY_OPERATION = 'registerWorkday';
const WORKDAY_OPTIONAL_FIELDS = [
    'taskTitle',
    'note',
    'startedAt',
    'endedAt',
    'durationSeconds',
    'durationHours',
    'variableHours',
    'timerMode',
    'pomodoroEnabled',
    'completedPomodoros',
    'clientOperationId'
];

export function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export async function hasWorkdayForDate(teamId, userId, date = getTodayDateString()) {
    if (!teamId || !userId) return false;
    const hasQueuedWorkday = await hasQueuedRegularWorkdayForDate(teamId, userId, date);
    const worksQuery = query(
        collection(db, 'works'),
        where('teamId', '==', teamId),
        where('userId', '==', userId),
        where('date', '==', date)
    );
    try {
        const snapshot = await getDocs(worksQuery);
        return hasQueuedWorkday || snapshot.docs.some((doc) => {
            const type = doc.data().type;
            return type === 'full-day' || type === 'half-day';
        });
    } catch (error) {
        if (isOfflineError(error)) return hasQueuedWorkday;
        throw error;
    }
}

function rememberLocalWorkday(workDate) {
    try {
        const existingStats = JSON.parse(localStorage.getItem('userStats')) || { workDays: [] };
        if (!existingStats.workDays.includes(workDate)) {
            existingStats.workDays.push(workDate);
        }
        localStorage.setItem('userStats', JSON.stringify(existingStats));
    } catch (e) {
        console.log('Error saving to localStorage:', e);
    }
}

function buildWorkdayDoc(teamId, userId, userName, workDay, teamData = null) {
    if (!workDay) throw new Error("workDay is missing");
    const workDate = workDay.date || getTodayDateString();
    if (teamData) assertWorkingDay(teamData, workDate);
    const limitedWorkDay = teamData ? applyWorkdayOvertimeLimit(workDay, teamData) : workDay;
    const newWork = {
        teamId,
        userId,
        userName,
        type: (limitedWorkDay && limitedWorkDay.type) ? limitedWorkDay.type : 'full-day',
        overtimeHours: (limitedWorkDay && limitedWorkDay.overtimeHours) ? Number(limitedWorkDay.overtimeHours) : 0,
        date: workDate,
        createdAt: new Date().toISOString(),
        paid: false
    };

    WORKDAY_OPTIONAL_FIELDS.forEach((field) => {
        if (limitedWorkDay[field] !== undefined && limitedWorkDay[field] !== null) {
            newWork[field] = limitedWorkDay[field];
        }
    });

    return newWork;
}

async function hasQueuedRegularWorkdayForDate(teamId, userId, date) {
    const queuedWorkdays = await getQueuedOperationsByType(REGISTER_WORKDAY_OPERATION);
    return queuedWorkdays.some((operation) => {
        const payload = operation.payload || {};
        const workDay = payload.workDay || {};
        const type = workDay.type || 'full-day';
        return payload.teamId === teamId &&
            payload.userId === userId &&
            (workDay.date || getTodayDateString()) === date &&
            (type === 'full-day' || type === 'half-day');
    });
}

async function enqueueRegisterWorkday(teamId, userId, userName, workDay) {
    const clientOperationId = workDay.clientOperationId || `workday-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const queuedWorkDay = { ...workDay, clientOperationId };
    const workDate = queuedWorkDay.date || getTodayDateString();
    const operation = await enqueueOfflineOperation(
        REGISTER_WORKDAY_OPERATION,
        { teamId, userId, userName, workDay: queuedWorkDay },
        {
            id: clientOperationId,
            label: queuedWorkDay.type === 'overtime' ? 'Horas extra' : 'Jornada'
        }
    );
    rememberLocalWorkday(workDate);
    scheduleOfflineSync();
    return { queued: true, id: operation.id };
}

export async function executeRegisterWorkday({ teamId, userId, userName, workDay }, operation = null) {
    if (!workDay) throw new Error("workDay is missing");
    const teamSnapshot = await getDoc(doc(db, 'teams', teamId));
    const teamData = teamSnapshot.data();
    const newWork = buildWorkdayDoc(teamId, userId, userName, workDay, teamData);
    const deterministicId = workDay.clientOperationId || operation?.id;

    if (deterministicId) {
        await setDoc(doc(db, 'works', deterministicId), newWork, { merge: true });
        rememberLocalWorkday(newWork.date);
        return deterministicId;
    }

    const docRef = await addDoc(collection(db, 'works'), newWork);
    rememberLocalWorkday(newWork.date);
    return docRef.id;
}

export async function registerWorkday(teamId, userId, userName, workDay) {
    if (!workDay) throw new Error("workDay is missing");
    if (isBrowserOffline()) {
        return enqueueRegisterWorkday(teamId, userId, userName, workDay);
    }

    try {
        const id = await executeRegisterWorkday({ teamId, userId, userName, workDay });
        return { queued: false, id };
    } catch (error) {
        if (isOfflineError(error)) {
            return enqueueRegisterWorkday(teamId, userId, userName, workDay);
        }
        console.error("Error registering workday:", error);
        throw error;
    }
}

export async function assignWorkdayToMember(teamId, userId, userName, workDay, assignedBy = null) {
    if (!teamId || !userId || !workDay?.date) throw new Error("Datos de jornada incompletos");
    const teamSnapshot = await getDoc(doc(db, 'teams', teamId));
    const teamData = teamSnapshot.data();
    assertWorkingDay(teamData, workDay.date);
    const limitedWorkDay = applyWorkdayOvertimeLimit(workDay, teamData);
    const worksQuery = query(
        collection(db, 'works'),
        where('teamId', '==', teamId),
        where('userId', '==', userId),
        where('date', '==', workDay.date)
    );
    const snapshot = await getDocs(worksQuery);
    const workData = {
        teamId,
        userId,
        userName,
        type: limitedWorkDay.type || 'full-day',
        overtimeHours: limitedWorkDay.overtimeHours ? Number(limitedWorkDay.overtimeHours) : 0,
        date: limitedWorkDay.date,
        note: limitedWorkDay.note?.trim() || '',
        assignedBy,
        updatedAt: new Date().toISOString()
    };

    ['taskTitle', 'startedAt', 'endedAt', 'durationSeconds', 'durationHours', 'variableHours', 'timerMode'].forEach((field) => {
        if (limitedWorkDay[field] !== undefined && limitedWorkDay[field] !== null) {
            workData[field] = limitedWorkDay[field];
        }
    });

    if (!snapshot.empty) {
        await updateDoc(snapshot.docs[0].ref, workData);
        return snapshot.docs[0].id;
    }

    const docRef = await addDoc(collection(db, 'works'), {
        ...workData,
        createdAt: new Date().toISOString(),
        paid: false
    });
    return docRef.id;
}

export const getTeamWorks = async (teamId) => {
    if (!teamId) return [];
    const worksQuery = query(collection(db, 'works'), where('teamId', '==', teamId));
    const snapshot = await getDocs(worksQuery);
    const works = [];
    snapshot.forEach((doc) => {
        works.push({ id: doc.id, ...doc.data() });
    });
    return works.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export const getUserTeamWorks = async (teamId, userId) => {
    if (!teamId || !userId) return [];
    const worksQuery = query(
        collection(db, 'works'),
        where('teamId', '==', teamId),
        where('userId', '==', userId)
    );
    const snapshot = await getDocs(worksQuery);
    const works = [];
    snapshot.forEach((doc) => {
        works.push({ id: doc.id, ...doc.data() });
    });
    return works.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export const getWorksByTeamId = async (teamId) => {
    const worksQuery = query(collection(db, 'works'), where('teamId', '==', teamId));
    const snapshot = await getDocs(worksQuery);
    const works = [];
    snapshot.forEach((doc) => {
        works.push({ id: doc.id, ...doc.data() });
    });
    return Object.groupBy(works, ({ userId }) => userId);
}
export async function getTeamStats(teamId, userId, period = 'month', dailyRate = 0, extraHourRate = 0) {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        let startDate, endDate;
        if (period === 'month') {
            startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
        } else {
            startDate = `${year}-01-01`;
            endDate = `${year}-12-31`;
        }
        const worksQuery = query(
            collection(db, 'works'),
            where('teamId', '==', teamId),
            where('userId', '==', userId),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
        );
        const snapshot = await getDocs(worksQuery);
        const works = [];
        snapshot.forEach((doc) => {
            works.push({ id: doc.id, ...doc.data() });
        });
        
        // Use the passed rates
        let totalFullDays = 0, totalHalfDays = 0, totalOvertimeHours = 0, totalEarnings = 0;
        works.forEach(work => {
            if (work.type === 'full-day') {
                totalFullDays++;
                totalEarnings += dailyRate;
            } else if (work.type === 'half-day') {
                totalHalfDays++;
                totalEarnings += dailyRate / 2;
            }
            if (work.overtimeHours > 0) {
                totalOvertimeHours += work.overtimeHours;
                totalEarnings += work.overtimeHours * extraHourRate;
            }
        });
        return { totalFullDays, totalHalfDays, totalWorkDays: totalFullDays + (totalHalfDays / 2), totalOvertimeHours, totalEarnings, works };
    } catch (error) {
        console.error("Error getting team stats:", error);
        throw error;
    }
}
