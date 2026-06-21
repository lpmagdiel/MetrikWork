import { db } from './firebase.js';
import { collection, addDoc, query, where, getDocs, doc, getDoc, setDoc, updateDoc, runTransaction } from 'firebase/firestore';
import {
    enqueueOfflineOperation,
    getQueuedOperationsByType,
    isBrowserOffline,
    isOfflineError,
    scheduleOfflineSync
} from './offlineQueue.js';
import { applyWorkdayOvertimeLimit, assertWorkingDay } from './workLimits.js';
import { geocodeAddress, getStoredUserGpsLocation, normalizeCoordinates } from '../helpers/navigation.js';

const REGISTER_WORKDAY_OPERATION = 'registerWorkday';
const DUPLICATE_REGULAR_WORKDAY_MESSAGE = 'Ya existe una jornada completa o media jornada para este día.';
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
    'clientOperationId',
    'memberGps',
    'memberLocationAddress',
    'memberLocationCapturedAt',
    'checkInGps',
    'checkInLocationCapturedAt',
    'checkOutGps',
    'checkOutLocationCapturedAt'
];

export function getTodayDateString() {
    const now = new Date();
    return getLocalDateString(now);
}

function getLocalDateString(value = new Date()) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    const date = value instanceof Date ? value : new Date(value || Date.now());
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const year = safeDate.getFullYear();
    const month = String(safeDate.getMonth() + 1).padStart(2, '0');
    const day = String(safeDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function resolveWorkdayDate(workDay = {}, operation = null) {
    return workDay.date || getLocalDateString(workDay.startedAt || operation?.createdAt || new Date());
}

function withResolvedWorkdayDate(workDay = {}, operation = null) {
    return {
        ...workDay,
        date: resolveWorkdayDate(workDay, operation)
    };
}

function isRegularWorkdayType(type) {
    return type === 'full-day' || type === 'half-day';
}

function isRegularWorkday(workDay = {}) {
    return isRegularWorkdayType(workDay.type || 'full-day');
}

function getRegularWorkdayDocId(teamId, userId, date) {
    return ['regular-workday', teamId, userId, date]
        .map((part) => encodeURIComponent(String(part || '')))
        .join('__');
}

async function findRegularWorkdayForDate(teamId, userId, date, { excludeId = '' } = {}) {
    if (!teamId || !userId || !date) return null;
    const worksQuery = query(
        collection(db, 'works'),
        where('teamId', '==', teamId),
        where('userId', '==', userId),
        where('date', '==', date)
    );
    const snapshot = await getDocs(worksQuery);
    return snapshot.docs.find((workDoc) => {
        if (excludeId && workDoc.id === excludeId) return false;
        return isRegularWorkdayType(workDoc.data().type);
    }) || null;
}

async function saveRegularWorkday(teamId, userId, workDayDoc) {
    const regularDocId = getRegularWorkdayDocId(teamId, userId, workDayDoc.date);
    const legacyRegularDoc = await findRegularWorkdayForDate(teamId, userId, workDayDoc.date, {
        excludeId: regularDocId
    });

    if (legacyRegularDoc) {
        throw new Error(DUPLICATE_REGULAR_WORKDAY_MESSAGE);
    }

    const workRef = doc(db, 'works', regularDocId);
    await runTransaction(db, async (transaction) => {
        const existingDoc = await transaction.get(workRef);

        if (existingDoc.exists()) {
            const existingWorkday = existingDoc.data() || {};
            const sameOperation = workDayDoc.clientOperationId &&
                existingWorkday.clientOperationId === workDayDoc.clientOperationId;

            if (!sameOperation) {
                throw new Error(DUPLICATE_REGULAR_WORKDAY_MESSAGE);
            }
        }

        if (existingDoc.exists()) {
            transaction.set(workRef, workDayDoc, { merge: true });
        } else {
            transaction.set(workRef, workDayDoc);
        }
    });

    return regularDocId;
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
    const workDate = resolveWorkdayDate(workDay);
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

async function addStoredMemberLocation(workDay, { includeAddress = true } = {}) {
    const memberGps = normalizeCoordinates(workDay?.memberGps) || getStoredUserGpsLocation();
    if (!memberGps) return workDay;

    const workDayWithLocation = {
        ...workDay,
        memberGps,
        memberLocationCapturedAt:
            workDay?.memberLocationCapturedAt ||
            memberGps.updatedAt ||
            new Date().toISOString()
    };

    if (!includeAddress || workDayWithLocation.memberLocationAddress) {
        return workDayWithLocation;
    }

    try {
        workDayWithLocation.memberLocationAddress = await geocodeAddress(memberGps);
    } catch (error) {
        console.warn("No se pudo resolver la dirección GPS de la jornada:", error?.message || error);
    }

    return workDayWithLocation;
}

async function ensureStoredMemberLocationAddress(workDay) {
    const memberGps = normalizeCoordinates(workDay?.memberGps);
    if (!memberGps || workDay?.memberLocationAddress || isBrowserOffline()) return workDay;
    return addStoredMemberLocation(workDay, { includeAddress: true });
}

async function hasQueuedRegularWorkdayForDate(teamId, userId, date) {
    const queuedWorkdays = await getQueuedOperationsByType(REGISTER_WORKDAY_OPERATION);
    return queuedWorkdays.some((operation) => {
        const payload = operation.payload || {};
        const workDay = payload.workDay || {};
        const type = workDay.type || 'full-day';
        return payload.teamId === teamId &&
            payload.userId === userId &&
            resolveWorkdayDate(workDay, operation) === date &&
            isRegularWorkdayType(type);
    });
}

async function enqueueRegisterWorkday(teamId, userId, userName, workDay) {
    const clientOperationId = workDay.clientOperationId || `workday-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const queuedWorkDay = withResolvedWorkdayDate({ ...workDay, clientOperationId });
    const workDate = queuedWorkDay.date;
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
    const datedWorkDay = withResolvedWorkdayDate({
        ...workDay,
        clientOperationId: workDay.clientOperationId || operation?.id
    }, operation);
    const workDayWithLocation = await ensureStoredMemberLocationAddress(datedWorkDay);
    const newWork = buildWorkdayDoc(teamId, userId, userName, workDayWithLocation, teamData);

    if (isRegularWorkday(newWork)) {
        const id = await saveRegularWorkday(teamId, userId, newWork);
        rememberLocalWorkday(newWork.date);
        return id;
    }

    const deterministicId = newWork.clientOperationId || operation?.id;

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
    const datedWorkDay = withResolvedWorkdayDate(workDay);

    if (isRegularWorkday(datedWorkDay)) {
        const hasQueuedWorkday = await hasQueuedRegularWorkdayForDate(teamId, userId, datedWorkDay.date);
        if (hasQueuedWorkday) throw new Error(DUPLICATE_REGULAR_WORKDAY_MESSAGE);
    }

    const workDayWithLocation = await addStoredMemberLocation(datedWorkDay, {
        includeAddress: !isBrowserOffline()
    });

    if (isBrowserOffline()) {
        return enqueueRegisterWorkday(teamId, userId, userName, workDayWithLocation);
    }

    try {
        const id = await executeRegisterWorkday({ teamId, userId, userName, workDay: workDayWithLocation });
        return { queued: false, id };
    } catch (error) {
        if (isOfflineError(error)) {
            return enqueueRegisterWorkday(teamId, userId, userName, workDayWithLocation);
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
    const limitedWorkDay = withResolvedWorkdayDate(applyWorkdayOvertimeLimit(workDay, teamData));
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

    if (isRegularWorkday(workData)) {
        const existingRegularDoc = await findRegularWorkdayForDate(teamId, userId, workData.date);

        if (existingRegularDoc) {
            await updateDoc(existingRegularDoc.ref, workData);
            return existingRegularDoc.id;
        }

        const regularDocId = getRegularWorkdayDocId(teamId, userId, workData.date);
        await setDoc(doc(db, 'works', regularDocId), {
            ...workData,
            createdAt: new Date().toISOString(),
            paid: false
        });
        return regularDocId;
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
