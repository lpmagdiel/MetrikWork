import { db } from './firebase.js';
import { collection, addDoc, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { getWorksByTeamId } from './works.js';
import { getBankName } from '../helpers/banks.js';

export async function getTeamPaymentsData(teamId) {
    try {
        // 1. Get works for the team
        const works = await getWorksByTeamId(teamId);
        // 2. Get registered payments for the team
        const paymentsQuery = query(collection(db, 'team_payments'), where('teamId', '==', teamId));
        const [paymentsSnapshot, privateProfilesSnapshot] = await Promise.all([
            getDocs(paymentsQuery),
            getDocs(collection(db, 'teams', teamId, 'privateMemberProfiles'))
        ]);
        const payments = [];
        paymentsSnapshot.forEach(doc => payments.push({ id: doc.id, ...doc.data() }));
        const privateProfiles = new Map();
        privateProfilesSnapshot.forEach(doc => {
            const data = doc.data() || {};
            privateProfiles.set(doc.id, {
                phone: typeof data.phone === 'string' ? data.phone : '',
                iban: typeof data.iban === 'string' ? data.iban : '',
                bankName: typeof data.bankName === 'string' && data.bankName.trim()
                    ? data.bankName
                    : getBankName(data.iban)
            });
        });

        // 3. Get team document to have rates and member names
        const teamDoc = await getDoc(doc(db, 'teams', teamId));
        const teamData = teamDoc.data();
        if (!teamData) throw new Error("Team not found");

        const memberSettings = teamData.memberSettings || {};
        const membersData = teamData.membersData || [];

        // 4. Calculate balances per user
        const memberBalances = membersData.map(member => {
            const userId = member.id;
            const settings = memberSettings[userId] || {};
            const privateProfile = privateProfiles.get(userId) || {};
            const dailyRate = Number(settings.dailyRate) || 0;
            const extraHourRate = Number(settings.extraHourRate) || 0;

            const userWorks = (works[userId] || []).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
            const userPayments = payments
                .filter(p => p.userId === userId)
                .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

            let totalFullDays = 0;
            let totalHalfDays = 0;
            let totalOvertimeHours = 0;
            let totalEarned = 0;

            userWorks.forEach(work => {
                if (work.type === 'full-day') {
                    totalFullDays++;
                    totalEarned += dailyRate;
                } else if (work.type === 'half-day') {
                    totalHalfDays++;
                    totalEarned += dailyRate / 2;
                }
                if (work.overtimeHours > 0) {
                    totalOvertimeHours += work.overtimeHours;
                    totalEarned += work.overtimeHours * extraHourRate;
                }
            });

            const totalPaid = userPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const balance = totalEarned - totalPaid;

            return {
                id: userId,
                name: member.name,
                totalFullDays,
                totalHalfDays,
                totalWorkDays: totalFullDays + (totalHalfDays / 2),
                totalOvertimeHours,
                totalEarned,
                totalPaid,
                balance,
                dailyRate,
                extraHourRate,
                privateProfile,
                payments: userPayments,
                works: userWorks
            };
        });

        return memberBalances;
    } catch (error) {
        console.error("Error calculating team payments:", error);
        throw error;
    }
}

export async function registerTeamPayment(teamId, userId, amount, type, registeredBy = null, method = 'cash') {
    try {
        const normalizedMethod = ['cash', 'transfer', 'bizum'].includes(method) ? method : 'cash';
        const paymentDoc = {
            teamId,
            userId,
            amount: Number(amount) || 0,
            type, // 'total' or 'partial'
            method: normalizedMethod,
            date: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        if (registeredBy?.uid) {
            paymentDoc.registeredBy = registeredBy.uid;
            paymentDoc.registeredByName = registeredBy.name || registeredBy.email || '';
        }

        const docRef = await addDoc(collection(db, 'team_payments'), paymentDoc);
        return { id: docRef.id, ...paymentDoc };
    } catch (error) {
        console.error("Error registering team payment:", error);
        throw error;
    }
}

export async function getUserTeamPayments(teamId, userId) {
    if (!teamId || !userId) return [];

    const paymentsQuery = query(
        collection(db, 'team_payments'),
        where('teamId', '==', teamId),
        where('userId', '==', userId)
    );
    const paymentsSnapshot = await getDocs(paymentsQuery);
    const payments = [];
    paymentsSnapshot.forEach(doc => payments.push({ id: doc.id, ...doc.data() }));

    return payments.sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
}
