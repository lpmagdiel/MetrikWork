import { db } from './firebase.js';
import { collection, addDoc, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

export async function registerWorkday(teamId, userId, userName, workDay) {
    if (!workDay) throw new Error("workDay is missing");
    try {
        const newWork = {
            teamId,
            userId,
            userName,
            type: (workDay && workDay.type) ? workDay.type : 'full-day',
            overtimeHours: (workDay && workDay.overtimeHours) ? Number(workDay.overtimeHours) : 0,
            date: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
            paid: false
        };
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
