import { db } from './firebase.js';
import { collection, addDoc, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { applyWorkdayOvertimeLimit } from './workLimits.js';

export function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export async function hasWorkdayForDate(teamId, userId, date = getTodayDateString()) {
    if (!teamId || !userId) return false;
    const worksQuery = query(
        collection(db, 'works'),
        where('teamId', '==', teamId),
        where('userId', '==', userId),
        where('date', '==', date)
    );
    const snapshot = await getDocs(worksQuery);
    return snapshot.docs.some((doc) => {
        const type = doc.data().type;
        return type === 'full-day' || type === 'half-day';
    });
}

export async function registerWorkday(teamId, userId, userName, workDay) {
    if (!workDay) throw new Error("workDay is missing");
    try {
        const teamSnapshot = await getDoc(doc(db, 'teams', teamId));
        const limitedWorkDay = applyWorkdayOvertimeLimit(workDay, teamSnapshot.data());
        const newWork = {
            teamId,
            userId,
            userName,
            type: (limitedWorkDay && limitedWorkDay.type) ? limitedWorkDay.type : 'full-day',
            overtimeHours: (limitedWorkDay && limitedWorkDay.overtimeHours) ? Number(limitedWorkDay.overtimeHours) : 0,
            date: getTodayDateString(),
            createdAt: new Date().toISOString(),
            paid: false
        };
        const optionalFields = [
            'taskTitle',
            'note',
            'startedAt',
            'endedAt',
            'durationSeconds',
            'durationHours',
            'variableHours',
            'timerMode'
        ];
        optionalFields.forEach((field) => {
            if (limitedWorkDay[field] !== undefined && limitedWorkDay[field] !== null) {
                newWork[field] = limitedWorkDay[field];
            }
        });
        await addDoc(collection(db, 'works'), newWork);
        try {
            const existingStats = JSON.parse(localStorage.getItem('userStats')) || { workDays: [] };
            const today = newWork.date;
            if (!existingStats.workDays.includes(today)) {
                existingStats.workDays.push(today);
            }
            localStorage.setItem('userStats', JSON.stringify(existingStats));
        } catch (e) {
            console.log('Error saving to localStorage:', e);
        }
    } catch (error) {
        console.error("Error registering workday:", error);
        throw error;
    }
}

export async function assignWorkdayToMember(teamId, userId, userName, workDay, assignedBy = null) {
    if (!teamId || !userId || !workDay?.date) throw new Error("Datos de jornada incompletos");
    const teamSnapshot = await getDoc(doc(db, 'teams', teamId));
    const limitedWorkDay = applyWorkdayOvertimeLimit(workDay, teamSnapshot.data());
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
